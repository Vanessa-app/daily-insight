"""Regression tests for rule-based trend indexing. Run with unittest discover."""
import datetime as dt
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import update_trends as trends


class TrendIndexTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 11, 19, tzinfo=dt.timezone.utc)

    def item(self, url, title, **kwargs):
        return {'url': url, 'title': title, 'source': kwargs.get('source', '官方'),
                'category': kwargs.get('category', 'AI與科技'),
                'published_at': kwargs.get('published_at', '2026-11-18T10:00:00+00:00'),
                'kind': kwargs.get('kind', 'news')}

    def test_keeps_original_articles_unmodified(self):
        source = self.item('https://example.org/ai', 'AI 公司公布新模型')
        before = json.dumps(source, ensure_ascii=False, sort_keys=True)
        result = trends.build_events([source], self.now)
        self.assertEqual(json.dumps(source, ensure_ascii=False, sort_keys=True), before)
        self.assertEqual(result[0]['article_urls'], [source['url']])
        self.assertEqual(result[0]['facts'], [])

    def test_filters_invalid_old_and_knowledge(self):
        examples = [
            self.item('http://example.org/insecure', 'AI 模型推出'),
            self.item('https://example.org/old', 'AI 模型推出', published_at='2025-11-01T10:00:00Z'),
            self.item('https://example.org/knowledge', 'AI 模型介紹', kind='knowledge'),
            self.item('https://example.org/valid', 'AI 企業推出新模型')
        ]
        result = trends.build_events(examples, self.now)
        self.assertEqual([u for e in result for u in e['article_urls']], ['https://example.org/valid'])

    def test_duplicate_source_url_deduplicated(self):
        a = self.item('https://example.org/news', '半導體晶片製程推出新方案')
        result = trends.build_events([a, a], self.now)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['source_count'], 1)

    def test_stable_event_identifier_for_same_article(self):
        a = self.item('https://example.org/a', '科技 AI 模型推出應用')
        event = trends.build_events([a], self.now)[0]
        restored = trends.build_events([a], self.now, previous={a['url']: event['id']})[0]
        self.assertEqual(restored['id'], event['id'])
        self.assertTrue(0 <= event['importance_score'] <= 10)

    def test_output_references_only_source_news_urls(self):
        articles = trends.read_items('news.json') + trends.read_items('catalog.json') + trends.read_items('taiwan.json')
        original_urls = {a.get('url') for a in articles if a.get('kind') != 'knowledge'}
        events = trends.build_events(articles)
        self.assertTrue(events)
        self.assertTrue(all(set(e['article_urls']) <= original_urls for e in events))
        self.assertTrue(all(e['primary_topic'] in trends.TOPIC_LABELS for e in events))
        self.assertTrue(all(e['facts'] == [] for e in events))


if __name__ == '__main__':
    unittest.main()
