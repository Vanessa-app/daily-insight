#!/usr/bin/env python3
"""Optional link health pass, bounded to twelve HEAD requests per scheduled run."""
from __future__ import annotations

import datetime as dt
import json

from source_quality import HEALTH_FILE, ROOT, load_previous, update_checks


def main():
    path = ROOT / 'data' / 'trends.json'
    try:
        events = json.loads(path.read_text(encoding='utf-8')).get('events', [])
    except (OSError, ValueError):
        events = []
    urls = [article.get('url') for event in events for article in event.get('articles', [])]
    links, checked = update_checks(urls, load_previous())
    # Atomic writes prevent half-written JSON if Actions is interrupted.
    from update_trends import write_json
    write_json(HEALTH_FILE, {
        'schema_version': 1,
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'method': 'bounded_head_checks_no_article_download',
        'checked_this_run': checked,
        'links': links,
    })
    print(f'Source health: {checked} links checked, {len(links)} known statuses')


if __name__ == '__main__':
    main()
