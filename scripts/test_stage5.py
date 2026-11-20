"""Stage-five A1/A2/A4/D1 contract and regression cases."""
import datetime as dt
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import source_quality as quality
import update_trends as trends


class StageFiveTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 19, tzinfo=dt.timezone.utc)

    def item(self, url, title, source='報導來源', source_id=None, **extra):
        return {'url': url, 'title': title, 'source': source, 'source_id': source_id,
                'kind': 'news', 'category': 'AI與科技',
                'published_at': '2026-11-18T12:00:00+00:00', **extra}

    def test_tracking_query_deduplicates_without_changing_original_url(self):
        first = self.item('https://example.com/story?utm_source=mail', 'AI 科技公司公布新模型')
        second = self.item('https://example.com/story?utm_source=app', 'AI 科技公司公布新模型')
        events = trends.build_events([first, second], self.now)
        self.assertEqual(len(events), 1)
        self.assertEqual(len(events[0]['articles']), 1)
        self.assertEqual(events[0]['article_urls'], [first['url']])

    def test_source_groups_not_treated_as_independent_fact_checks(self):
        official = self.item('https://agency.gov.example/ai', 'AI 科技公司公布新模型計畫',
                             source='政府單位', source_id='agency',
                             content_scope='official_full_text', reuse_license='approved')
        media = self.item('https://press.example/ai', 'AI 科技公司公布新模型計畫',
                          source='媒體甲', source_id='media-one', source_kind='media',
                          content_scope='media_headline')
        events = trends.build_events([official, media], self.now)
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event['source_count'], 2)
        self.assertEqual(event['evidence_status'], 'primary_source_available')
        self.assertFalse(event['independently_verified'])
        self.assertEqual(event['facts'], [])
        self.assertEqual(event['headline_groups'][0]['status'], 'similar_headline_only')
        self.assertFalse(event['headline_groups'][0]['independently_verified'])
        self.assertEqual(event['articles'][0]['content_access'], 'licensed_full_text')

    def test_named_company_guard_prevents_unrelated_merge(self):
        first = self.item('https://one.example/ai', 'Nvidia AI 科技公司公布最新晶片計畫')
        second = self.item('https://two.example/ai', 'Broadcom AI 科技公司公布最新晶片計畫')
        events = trends.build_events([first, second], self.now)
        self.assertEqual(len(events), 2)

    def test_previous_merged_ids_are_preserved_as_aliases(self):
        a = self.item('https://a.example/ai', 'AI 科技公司公布新模型計畫')
        b = self.item('https://b.example/ai', 'AI 科技公司公布新模型計畫')
        previous = {a['url']: {'id': 'trend-old-a', 'aliases': ['trend-ancestor']},
                    b['url']: {'id': 'trend-old-b', 'aliases': []}}
        merged = trends.build_events([a, b], self.now, previous=previous)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]['id'], 'trend-old-a')
        self.assertEqual(merged[0]['aliases'], ['trend-ancestor', 'trend-old-b'])

    def test_source_metadata_and_unknown_are_conservative(self):
        media = self.item('https://media.example/story', 'AI 產業推出新服務',
                          source_kind='media', content_scope='media_rss_excerpt')
        self.assertEqual(quality.metadata(media)['source_type'], 'media')
        self.assertEqual(quality.metadata(media)['content_access'], 'excerpt')
        self.assertEqual(quality.classify_status(200), 'available')
        self.assertEqual(quality.classify_status(404), 'not_found')
        self.assertEqual(quality.classify_status(403), 'unknown')
        self.assertEqual(quality.classify_status(None), 'unknown')

    def test_checks_are_bounded_and_do_not_scrape_bodies(self):
        calls = []
        urls = [f'https://source.example/{i}' for i in range(21)]
        def fake_head(url):
            calls.append(url)
            return 405 if url.endswith('/0') else 200
        links, checked = quality.update_checks(urls, checker=fake_head, now=self.now, limit=1000)
        self.assertEqual(checked, quality.MAX_CHECKS_PER_RUN)
        self.assertEqual(len(calls), quality.MAX_CHECKS_PER_RUN)
        self.assertIn('unknown', [row['status'] for row in links.values()])
        self.assertEqual(len(links), quality.MAX_CHECKS_PER_RUN)

    def test_invalid_url_never_checked(self):
        links, checked = quality.update_checks(['http://unsafe.example', 'https://u:p@example.com',
                                               'https://127.0.0.1/private', 'https://localhost/private'],
                                               checker=lambda _: self.fail('URL should not be checked'), now=self.now)
        self.assertEqual(links, {})
        self.assertEqual(checked, 0)
        self.assertEqual(quality.classify_status(302), 'unknown')


if __name__ == '__main__':
    unittest.main()
