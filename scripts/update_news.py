#!/usr/bin/env python3
"""Conservative primary-source RSS collector; no generated factual summaries."""
import datetime as dt
import email.utils
import json
import html
from bs4 import BeautifulSoup
import re
import os
import pathlib
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
NOW = dt.datetime.now(dt.timezone.utc)
HEADERS = {'User-Agent': 'DailyInsightPrimarySourceCollector/1.2 (+educational PWA)'}

def host_ok(url, allowed):
    try:
        u = urllib.parse.urlsplit(url)
        return u.scheme == 'https' and u.hostname in allowed and not u.username and not u.password
    except ValueError:
        return False

def text(node, name):
    child = node.find(name)
    return (child.text or '').strip() if child is not None else ''

def date_value(value):
    if not value: return None
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try: parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError: return None
    if parsed.tzinfo is None: parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).isoformat()

def clean_excerpt(raw):
    """Publisher-supplied feed description only; never fabricate missing body."""
    raw = re.sub(r"<(?i:script|style)[^>]*>.*?</(?i:script|style)>", " ", raw or "", flags=re.S)
    raw = re.sub(r"<[^>]*>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(raw)).strip()[:12000]

def paragraphs(raw):
    """Preserve meaningful feed paragraphs when present; otherwise one evidence block."""
    raw = re.sub(r"<(?i:script|style)[^>]*>.*?</(?i:script|style)>", " ", raw or "", flags=re.S)
    parts = re.split(r"(?i)</(?:p|div|li|h[1-6])>|<br\s*/?>", raw)
    cleaned = [clean_excerpt(x) for x in parts]
    return [x for x in cleaned if x][:35]


def article_image_candidate(url,allowed):
    """Find publisher image metadata; do NOT assume re-use rights."""
    if not host_ok(url,allowed): return None
    try:
        req=urllib.request.Request(url,headers=HEADERS)
        with urllib.request.urlopen(req,timeout=12) as resp:
            if not host_ok(resp.geturl(),allowed): return None
            if 'html' not in resp.headers.get('Content-Type',''): return None
            body=resp.read(900_000)
        soup=BeautifulSoup(body,'html.parser')
        node=soup.find('meta',attrs={'property':'og:image'}) or soup.find('meta',attrs={'name':'twitter:image'})
        if not node or not node.get('content'): return None
        image=urllib.parse.urljoin(url,node['content'])
        return image if image.startswith('https://') else None
    except Exception: return None

def translate_segments(parts):
    """Offline model: no API key; fail closed on model or resource errors."""
    if not parts: return [], 'no_original_text'
    if os.environ.get('DI_TRANSLATION') == '0': return [], 'translation_not_requested'
    try:
        from transformers import pipeline
        from opencc import OpenCC
        global _translator
        if '_translator' not in globals(): _translator = pipeline('translation', model='Helsinki-NLP/opus-mt-en-zh', device=-1)
        translator = _translator
        convert = OpenCC('s2t')
        results = []
        for part in parts:
            # Split to reduce truncation. Paragraph alignment preserved.
            sentences = re.split(r'(?<=[.!?])\s+', part)
            translated_sentences=[]
            for sentence in sentences:
                if not sentence.strip(): continue
                if len(sentence)>850: raise ValueError('sentence_too_long_for_safe_translation')
                out=translator(sentence, max_length=512, truncation=False)[0]['translation_text']
                if not out.strip(): raise ValueError('empty_translation')
                translated_sentences.append(convert.convert(out))
            results.append(' '.join(translated_sentences))
        if len(results)!=len(parts): raise ValueError('segment_count_mismatch')
        return results, 'translated_unreviewed'
    except Exception as exc:
        print('Translation unavailable:',type(exc).__name__,str(exc)[:200])
        return [], 'translation_error_'+type(exc).__name__


def parse_entries(xml):
    root = ET.fromstring(xml)
    results = []
    # RSS 2.0 and Atom; no third-party parsing or text generation.
    for item in root.findall('.//item'):
        results.append((text(item,'title'),text(item,'link'),text(item,'pubDate') or text(item,'{http://purl.org/dc/elements/1.1/}date'),text(item,'description')))
    for item in root.findall('.//{http://www.w3.org/2005/Atom}entry'):
        link = next((x.get('href','') for x in item.findall('{http://www.w3.org/2005/Atom}link') if x.get('rel','alternate') == 'alternate'),'')
        results.append((text(item,'{http://www.w3.org/2005/Atom}title'),link,text(item,'{http://www.w3.org/2005/Atom}published') or text(item,'{http://www.w3.org/2005/Atom}updated'),text(item,'{http://www.w3.org/2005/Atom}summary')))
    return results

TAIWAN_RELEASES = (
    ('moda', '數位發展部', 'https://moda.gov.tw/press/press-releases/372',
     r'/press/press-releases/\d+', '.article1.cpArticle', 'h2 .titleTxt', 'AI與科技',
     'CC0 1.0', 'https://moda.gov.tw/announcement/publicdeclare/951'),
    ('adi', '數位產業署', 'https://moda.gov.tw/ADI/news/latest-news/766',
     r'/ADI/news/latest-news/\d+', '.article1.cpArticle', 'h2 .titleTxt', 'AI與科技',
     'CC0 1.0', 'https://moda.gov.tw/announcement/publicdeclare/951'),
    ('ey', '行政院', 'https://www.ey.gov.tw/Page/6485009ABEC1CB9C',
     r'/Page/9277F759E41CCD91/[0-9a-f-]{36}', '.words_content .data_left', '.words .h2',
     '社會與公共政策', '政府資料開放授權條款－第1版',
     'https://www.ey.gov.tw/Page/2EADDBFEDDB6357E'),
)
TAIPEI = dt.timezone(dt.timedelta(hours=8))

def publisher_page(url, allowed):
    if not host_ok(url, allowed):
        raise ValueError('unapproved URL')
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=18) as response:
        if not host_ok(response.geturl(), allowed) or 'text/html' not in response.headers.get('Content-Type', ''):
            raise ValueError('unexpected publisher response')
        payload = response.read(2_000_001)
    if len(payload) > 2_000_000:
        raise ValueError('publisher page too large')
    return BeautifulSoup(payload, 'html.parser', from_encoding='utf-8')

def taiwan_releases(retained, statuses):
    for sid, name, listing, path, body_selector, title_selector, category, license_name, license_url in TAIWAN_RELEASES:
        allowed = [urllib.parse.urlsplit(listing).hostname]
        accepted = failed = 0
        try:
            page = publisher_page(listing, allowed)
            urls = list(dict.fromkeys(urllib.parse.urljoin(listing, a['href'])
                        for a in page.select('a[href]') if re.fullmatch(path, a['href'])))
            if not urls:
                raise ValueError('release links missing')
            for url in [url for url in urls if url != listing][:8]:
                try:
                    page = publisher_page(url, allowed)
                    body = page.select_one(body_selector)
                    heading = page.select_one(title_selector)
                    if not body or not heading:
                        raise ValueError('release layout changed')
                    # Require every text block to be a paragraph. Skip embedded media,
                    # third-party notices, and contact details pending editorial review.
                    if any(node.name != 'p' for node in body.find_all(recursive=False)) or body.select('img,video,iframe,table,figure,blockquote'):
                        continue
                    parts = [p.get_text(strip=False).strip() for p in body.find_all('p', recursive=False)]
                    parts = [p for p in parts if p]
                    prose = ''.join(parts)
                    if len(parts) < 2 or re.sub(r'\s+', '', prose) != re.sub(r'\s+', '', body.get_text()):
                        continue
                    if re.search(r'版權所有|禁止轉載|不得轉載|另行授權|經同意方可|©|新聞聯絡人|09\d{2}[- ]?\d{3}[- ]?\d{3}', prose):
                        continue
                    if sid == 'adi':
                        date = dt.datetime.fromisoformat(page.select_one('.infoDate span').get_text(strip=True)).replace(tzinfo=TAIPEI)
                    elif sid == 'moda':
                        date = dt.datetime.fromisoformat(re.search(r'"datePublished"\s*:\s*"([^"]+)"', str(page)).group(1))
                    else:
                        y, m, d = map(int, re.search(r'(\d{3})-(\d{2})-(\d{2})', page.select_one('.date_style2').get_text()).groups())
                        date = dt.datetime(y+1911, m, d, tzinfo=TAIPEI)
                    if date > NOW or NOW-date > dt.timedelta(days=30):
                        continue
                    retained[url] = {
                        'id': sid+':'+url.rsplit('/',1)[-1], 'source_id': sid, 'source': name,
                        'kind': 'news', 'category': category, 'title': heading.get_text(strip=True),
                        'url': url, 'published_at': date.isoformat(), 'content_complete': True,
                        'reuse_license': 'approved', 'license_name': license_name, 'license_url': license_url,
                        'content_scope': 'official_full_text', 'translation_status': 'original_zh_hant',
                        'evidence_original': parts, 'excerpt_original': parts[0],
                        'verification': 'publisher_domain_checked', 'claim_verification': 'not_independently_verified'
                    }
                    accepted += 1
                except (ValueError, AttributeError, OSError) as exc:
                    failed += 1
                    print(name, url, type(exc).__name__, exc)
            status = 'partial' if failed else 'ok'
        except (ValueError, OSError) as exc:
            status = 'error'
            print(name, type(exc).__name__, exc)
        statuses[name] = {'status': status, 'accepted': accepted, 'checked_at': NOW.isoformat()}

def run():
    sources = json.loads((ROOT/'sources.json').read_text(encoding='utf-8'))
    target = ROOT/'data/news.json'
    old = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {'items': [],'sources': {}}
    retained = {x['url']:x for x in old.get('items',[]) if isinstance(x,dict) and x.get('url')}
    statuses = {}
    for source in sources:
        sid = source['id']; allowed = source['allowed_hosts']; feed = source['feed']
        if not host_ok(feed,allowed):
            statuses[sid] = {'status':'rejected_configuration','checked_at':NOW.isoformat()}; continue
        try:
            req = urllib.request.Request(feed,headers=HEADERS)
            with urllib.request.urlopen(req,timeout=18) as response:
                final_url = response.geturl()
                if not host_ok(final_url,allowed): raise ValueError('feed redirected off approved domain')
                payload = response.read(2_000_001)
                if len(payload)>2_000_000: raise ValueError('feed too large')
            parsed = parse_entries(payload)
            accepted = 0
            for title,url,published,description in parsed[:3]:
                if not title or not host_ok(url,allowed): continue
                date = date_value(published)
                if not date: continue
                if dt.datetime.fromisoformat(date)>NOW+dt.timedelta(days=1): continue
                # Source authenticity is domain-based; individual claims are NOT independently fact-checked.
                excerpt=clean_excerpt(description)
                segments=paragraphs(description)
                scope='publisher_feed_excerpt'; complete=False; extraction_status='not_attempted'
                previous=retained.get(url,{})
                if previous.get('evidence_original')==segments and previous.get('translation_status')=='translated_unreviewed':
                    translated=previous.get('evidence_zh_hant',[])
                    status='translated_unreviewed'
                else:
                    translated,status=translate_segments(segments)
                # No full-text claim unless an explicitly licensed full-text adapter exists.
                # Current approved feeds only provide publisher excerpts, which may be long.
                retained[url] = {
                    'image_url':article_image_candidate(url,allowed), 'image_rights':'unverified', 'image_credit':source['name'], 'quiz_reviewed':False, 'quiz':[],
                    'excerpt_original':excerpt,'translation_zh_hant':' '.join(translated) if translated else None,
                    'evidence_original':segments,'evidence_zh_hant':translated,
                    'translation_status':status,'content_scope':scope,'extraction_status':extraction_status,
                    'content_complete':complete,'reuse_license':'not_confirmed',
                    'id':sid+':'+str(abs(__import__('zlib').crc32(url.encode()))),
                    'source_id':sid,'source':source['name'],'category':source['category'],
                    'title':title[:300],'url':url,'published_at':date,
                    'verification':'publisher_domain_checked',
                    'claim_verification':'not_independently_verified'
                }
                accepted += 1
            statuses[sid] = {'status':'ok','accepted':accepted,'checked_at':NOW.isoformat()}
        except Exception as exc:
            statuses[sid] = {'status':'error','reason':type(exc).__name__,'checked_at':NOW.isoformat()}
    taiwan_releases(retained, statuses)
    valid = {s['id']:s['allowed_hosts'] for s in sources}
    valid.update({row[0]: [urllib.parse.urlsplit(row[2]).hostname] for row in TAIWAN_RELEASES})
    items = [x for x in retained.values() if x.get('source_id') in valid and host_ok(x.get('url',''),valid[x['source_id']]) and x.get('published_at')]
    items.sort(key=lambda x:x['published_at'],reverse=True)
    output = {'schema_version':3,'updated_at':NOW.isoformat(),'items':items[:60],'sources':statuses,'disclaimer':'Source excerpts unless independently approved for full-text use; machine translations unreviewed; no full-text rights assumed.'}
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Accepted',len(output['items']),'items; source status:',{k:v['status'] for k,v in statuses.items()})

if __name__=='__main__': run()
