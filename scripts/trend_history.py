"""Daily observed-source metrics. Missing collection days remain missing."""
import datetime as dt

TAIPEI = dt.timezone(dt.timedelta(hours=8))


def event_snapshot(events, days, now, canonicalize):
    local = now.astimezone(TAIPEI)
    date = local.date().isoformat()
    metric_days = [day for day in days if isinstance(day, dict)
                   and day.get('observation_version') == 1 and day.get('date', '') <= date]
    earlier = [day for day in metric_days if day['date'] < date]
    same = next((day for day in reversed(metric_days) if day['date'] == date), {})
    baseline = same.get('baseline', not bool(earlier))
    known = {key for day in earlier for event in day.get('event_stats', [])
             for key in event.get('article_keys', [])}
    records = {event['id']: dict(event) for event in same.get('event_stats', [])}
    for event in events:
        ids = {event['id'], *event.get('aliases', [])}
        prior = [value for key, value in records.items()
                 if key in ids or ids.intersection(value.get('aliases', []))]
        urls = {canonicalize(a['url']) for a in event.get('articles', [])}
        urls.update(key for value in prior for key in value.get('article_keys', []))
        groups = {a['source_group'] for a in event.get('articles', []) if a.get('source_group')}
        groups.update(group for value in prior for group in value.get('source_groups', []))
        aliases = ids | {alias for value in prior for alias in value.get('aliases', [])}
        for value in prior:
            records.pop(value['id'], None)
        records[event['id']] = {
            'id': event['id'], 'aliases': sorted(aliases - {event['id']}),
            'title': event['title'], 'primary_topic': event['primary_topic'],
            'article_keys': sorted(urls),
            'new_article_keys': None if baseline else sorted(urls - known),
            'source_groups': sorted(groups),
        }
    return {'observation_version': 1, 'observed_at': now.isoformat(),
            'closed': bool(same.get('closed')) or local.hour >= 18,
            'baseline': baseline, 'event_stats': sorted(records.values(), key=lambda value: value['id'])}
