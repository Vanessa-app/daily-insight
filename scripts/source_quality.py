"""Conservative, bounded checks for source metadata and link availability.

The index never downloads or republishes article bodies. HTTP status checks
are advisory: only explicit 404/410 responses are classified as missing.
"""
from __future__ import annotations

import datetime as dt
import ipaddress
import json
import pathlib
import urllib.error
import urllib.request
from urllib.parse import urlsplit


ROOT = pathlib.Path(__file__).resolve().parents[1]
HEALTH_FILE = ROOT / 'data' / 'source-health.json'
MAX_CHECKS_PER_RUN = 12
MAX_SAVED_RESULTS = 600


def source_type(article):
    scope = str(article.get('content_scope') or '')
    if scope == 'official_full_text' or article.get('source_id') in {'ey', 'nasa'}:
        return 'official'
    if article.get('source_kind') == 'media' or scope.startswith('media_'):
        return 'media'
    if scope == 'publisher_feed_excerpt':
        return 'publisher'
    return 'other'


def reading_scope(article):
    scope = str(article.get('content_scope') or '')
    if scope == 'official_full_text' and article.get('reuse_license') == 'approved':
        return 'licensed_full_text'
    if scope in {'publisher_feed_excerpt', 'media_rss_excerpt'}:
        return 'excerpt'
    return 'headline_only'


def source_group(article):
    """A source group is a publisher identity, not independent verification."""
    url = str(article.get('url') or '')
    host = (urlsplit(url).hostname or '').lower().removeprefix('www.')
    source_id = str(article.get('source_id') or '').strip().lower()
    return source_id or host or str(article.get('source') or 'unknown').lower()


def metadata(article):
    url = str(article.get('url') or '')
    return {
        'source_type': source_type(article),
        'content_access': reading_scope(article),
        'source_group': source_group(article),
        'source_domain': (urlsplit(url).hostname or '').lower(),
    }


def valid_http_url(url):
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or not host or parsed.username or parsed.password:
            return False
        if host == 'localhost' or host.endswith(('.local', '.internal')) or '.' not in host:
            return False
        # Do not send scheduled URL probes to loopback, private or literal IPs.
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return True
    except (TypeError, ValueError):
        return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_head_status(url):
    request = urllib.request.Request(url, method='HEAD', headers={
        'User-Agent': 'DailyInsightSourceLinkCheck/1.0 (+public-source-index)',
        'Accept': '*/*',
    })
    try:
        # Do not follow redirects into a different, potentially private host.
        with urllib.request.build_opener(NoRedirect).open(request, timeout=3) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def classify_status(status):
    if status in (404, 410):
        return 'not_found'
    if isinstance(status, int) and 200 <= status < 300:
        return 'available'
    return 'unknown'


def update_checks(urls, previous=None, checker=http_head_status, now=None, limit=MAX_CHECKS_PER_RUN):
    """Check only the least recently checked links; fail closed to 'unknown'."""
    now = now or dt.datetime.now(dt.timezone.utc)
    previous = previous if isinstance(previous, dict) else {}
    unique = sorted({url for url in urls if valid_http_url(url)})
    existing = {url: row for url, row in previous.items()
                if url in unique and isinstance(row, dict)}
    queued = sorted(unique, key=lambda url: (existing.get(url, {}).get('checked_at', ''), url))
    results = dict(existing)
    check_count = max(0, min(limit, MAX_CHECKS_PER_RUN, len(queued)))
    for url in queued[:check_count]:
        try:
            status = checker(url)
        except Exception:  # External URL failures must not break publication data.
            status = None
        results[url] = {
            'status': classify_status(status),
            'http_status': status if isinstance(status, int) else None,
            'checked_at': now.isoformat(),
        }
    # All currently indexed URLs are retained; cap protects against abnormal files.
    return {url: results[url] for url in unique[:MAX_SAVED_RESULTS] if url in results}, check_count


def load_previous(path=HEALTH_FILE):
    try:
        content = json.loads(path.read_text(encoding='utf-8'))
        return content.get('links', {}) if content.get('schema_version') == 1 else {}
    except (OSError, ValueError, AttributeError):
        return {}
