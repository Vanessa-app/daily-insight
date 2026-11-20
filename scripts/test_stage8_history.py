import datetime as dt
import unittest
from trend_history import event_snapshot


class ObservedHistory(unittest.TestCase):
    def snapshot(self, events, days, when):
        return event_snapshot(events, days, dt.datetime.fromisoformat(when), lambda u: u.split('?')[0])

    def event(self, urls=('https://example.org/a',), key='event', aliases=()):
        return dict(id=key, aliases=list(aliases), title='示範事件', primary_topic='technology_ai',
                    articles=[dict(url=u, source_group='example.org') for u in urls])

    def day(self, date, value):
        return dict(date=date, **value)

    def test_baseline_is_not_daily_growth(self):
        first=self.snapshot([self.event()], [], '2026-11-19T10:00:00+00:00')
        self.assertTrue(first['closed'])
        self.assertTrue(first['baseline'])
        self.assertIsNone(first['event_stats'][0]['new_article_keys'])
        again=self.snapshot([self.event(('https://example.org/b',))], [self.day('2026-11-19',first)], '2026-11-19T12:00:00+00:00')
        self.assertTrue(again['baseline'])
        self.assertEqual(len(again['event_stats'][0]['article_keys']),2)

    def test_retries_canonical_urls_and_alias_merge(self):
        baseline=self.day('2026-11-18',self.snapshot([self.event()], [], '2026-11-18T10:00:00+00:00'))
        morning=self.snapshot([self.event(('https://example.org/a?utm=1','https://example.org/b'))], [baseline], '2026-11-19T00:00:00+00:00')
        self.assertFalse(morning['closed'])
        self.assertEqual(morning['event_stats'][0]['new_article_keys'],['https://example.org/b'])
        evening=self.snapshot([self.event(('https://example.org/c',),'merged',('event',))], [baseline,self.day('2026-11-19',morning)], '2026-11-19T10:00:00+00:00')
        self.assertTrue(evening['closed'])
        self.assertEqual(len(evening['event_stats']),1)
        self.assertEqual(evening['event_stats'][0]['new_article_keys'],['https://example.org/b','https://example.org/c'])
        retry=self.snapshot([], [baseline,self.day('2026-11-19',evening)], '2026-11-19T11:00:00+00:00')
        self.assertEqual(retry['event_stats'],evening['event_stats'])

    def test_taipei_day_and_legacy_not_inferred(self):
        value=self.snapshot([self.event()], [{'date':'2026-11-19','total_events':90}], '2026-11-19T16:01:00+00:00')
        self.assertFalse(value['closed'])
        self.assertTrue(value['baseline'])

    def test_gap_is_not_backfilled(self):
        first=self.day('2026-11-17',self.snapshot([self.event()], [], '2026-11-17T10:00:00+00:00'))
        after=self.snapshot([self.event(('https://example.org/b',))], [first], '2026-11-19T10:00:00+00:00')
        self.assertEqual(after['event_stats'][0]['new_article_keys'],['https://example.org/b'])
        self.assertNotIn('2026-11-18',str(after))

    def test_collector_retains_180_completed_days_plus_today(self):
        import tempfile
        import json
        import update_trends
        from pathlib import Path
        old=update_trends.DATA
        try:
            with tempfile.TemporaryDirectory() as directory:
                update_trends.DATA=Path(directory)
                start=dt.datetime(2026,5,1,10,tzinfo=dt.timezone.utc)
                for i in range(183):
                    update_trends.update_history([self.event()], start+dt.timedelta(days=i))
                history=json.loads((Path(directory)/'trend-history.json').read_text())
                self.assertEqual(len(history['days']),181)
                self.assertTrue(all(not d['baseline'] for d in history['days']))
                self.assertEqual(history['event_metrics_version'],1)
        finally: update_trends.DATA=old


if __name__=='__main__': unittest.main()
