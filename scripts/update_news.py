#!/usr/bin/env python3
"""Conservative primary-source RSS collector; no generated factual summaries."""
import datetime as dt
import email.utils
import json
import html
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
    raw = re.sub(r"<[^>]*>", " ", raw or "")
    return re.sub(r"\s+", " ", html.unescape(raw)).strip()[:650]

def translate_excerpt(content):
    """Optional translation of short feed excerpts; no fabricated text."""
    key=os.environ.get("DEEPL_AUTH_KEY", "")
    if not key or not content: return None
    endpoint=os.environ.get("DEEPL_API_URL", "https://api-free.deepl.com/v2/translate")
    if endpoint not in ("https://api-free.deepl.com/v2/translate", "https://api.deepl.com/v2/translate"): return None
    data=urllib.parse.urlencode({"text":content,"target_lang":"ZH-HANT"}).encode()
    req=urllib.request.Request(endpoint,data=data,headers={"Authorization":"DeepL-Auth-Key "+key,"Content-Type":"application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req,timeout=15) as response:
            obj=json.load(response)
        result=obj["translations"][0]["text"]
        return result if isinstance(result,str) and result.strip() else None
    except Exception: return None

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
            for title,url,published,description in parsed[:100]:
                if not title or not host_ok(url,allowed): continue
                date = date_value(published)
                if not date: continue
                if dt.datetime.fromisoformat(date)>NOW+dt.timedelta(days=1): continue
                # Source authenticity is domain-based; individual claims are NOT independently fact-checked.
                excerpt=clean_excerpt(description)
                previous=retained.get(url,{})
                translated=previous.get('translation_zh_hant') if previous.get('excerpt_original')==excerpt else None
                if not translated and excerpt: translated=translate_excerpt(excerpt)
                retained[url] = {'excerpt_original':excerpt,'translation_zh_hant':translated,'excerpt_type':'publisher_feed_description','id':sid+':'+str(abs(__import__('zlib').crc32(url.encode()))),'source_id':sid,'source':source['name'],'category':source['category'],'title':title[:300],'url':url,'published_at':date,'verification':'publisher_domain_checked','claim_verification':'not_independently_verified'}
                accepted += 1
            statuses[sid] = {'status':'ok','accepted':accepted,'checked_at':NOW.isoformat()}
        except Exception as exc:
            statuses[sid] = {'status':'error','reason':type(exc).__name__,'checked_at':NOW.isoformat()}
    valid = {s['id']:s['allowed_hosts'] for s in sources}
    items = [x for x in retained.values() if x.get('source_id') in valid and host_ok(x.get('url',''),valid[x['source_id']]) and x.get('published_at')]
    items.sort(key=lambda x:x['published_at'],reverse=True)
    output = {'schema_version':1,'updated_at':NOW.isoformat(),'items':items[:150],'sources':statuses,'disclaimer':'Publisher-domain validation only; article claims are not independently fact-checked.'}
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Accepted',len(output['items']),'items; source status:',{k:v['status'] for k,v in statuses.items()})

if __name__=='__main__': run()
