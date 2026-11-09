#!/usr/bin/env python3
"""Grow a licensed Chinese reading library and an attributed media headline index.
No paywalls, fabricated stories, or assumed full-text/image rights.
"""
import concurrent.futures as cf
import datetime as dt
import email.utils
import hashlib
import json
import pathlib
import re
import time
import urllib.parse as up
import urllib.request as ur
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
from opencc import OpenCC

ROOT = pathlib.Path(__file__).resolve().parents[1]
NOW = dt.datetime.now(dt.timezone.utc)
UA = {'User-Agent': 'DailyInsight/2.0 (https://vanessa-app.github.io/daily-insight/; educational noncommercial RSS reader)'}
CONVERT = OpenCC('s2twp')
LICENSE = 'https://creativecommons.org/licenses/by-sa/4.0/'

def fetch(url):
    for attempt in range(2):
        try:
            with ur.urlopen(ur.Request(url, headers=UA), timeout=16) as response:
                if up.urlsplit(response.geturl()).scheme != 'https':
                    raise ValueError('insecure redirect')
                data = response.read(4_000_001)
                if len(data) > 4_000_000:
                    raise ValueError('response too large')
                return data
        except Exception:
            if attempt: raise
            time.sleep(.4)

def wiki_query(params):
    return json.loads(fetch('https://zh.wikipedia.org/w/api.php?' + up.urlencode({'format':'json', **params})))

def stamp(raw):
    try: value = email.utils.parsedate_to_datetime(raw)
    except (TypeError, ValueError):
        try: value = dt.datetime.fromisoformat(raw.replace('Z','+00:00'))
        except (ValueError, AttributeError): return None
    if value.tzinfo is None: value = value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc)

def media_feed(source):
    # Some publisher feeds include XML-invalid control characters in CDATA.
    # Remove only characters XML 1.0 forbids; keep all visible source text.
    raw=fetch(source['feed']).decode('utf-8-sig')
    raw=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', raw)
    root = ET.fromstring(raw)
    results = []
    for entry in root.findall('.//item')[:20]:
        title = entry.findtext('title', '').strip()
        url = entry.findtext('link','').strip()
        published = stamp(entry.findtext('pubDate',''))
        if not title or not published or not NOW-dt.timedelta(days=7) <= published <= NOW+dt.timedelta(minutes=10): continue
        parsed = up.urlsplit(url)
        if parsed.scheme != 'https' or parsed.hostname not in source['allowed_hosts']: continue
        url = up.urlunsplit((parsed.scheme,parsed.netloc,parsed.path,'',''))
        # Media full text is never scraped. Only LTN explicitly licenses RSS
        # messages for noncommercial attributed reuse; Yahoo remains title/link only.
        description = BeautifulSoup(entry.findtext('description',''), 'html.parser').get_text(' ',strip=True)
        excerpt = description[:250] if source.get('rss_reuse') else ''
        item = {'id':source['id']+':'+hashlib.sha256(url.encode()).hexdigest()[:16],
                'source_id':source['id'], 'source':source['name'], 'source_kind':'media',
                'kind':'news','category':source['category'],'title':title,'url':url,
                'published_at':published.isoformat(),'fetched_at':NOW.isoformat(),
                'content_complete':False,'reuse_license':'rss_message_only' if excerpt else 'link_only',
                'content_scope':'media_rss_excerpt' if excerpt else 'media_headline',
                'translation_status':'original_zh_hant','evidence_original':[excerpt] if excerpt else [],
                'excerpt_original':excerpt,'verification':'publisher_domain_checked',
                'license_name':source.get('license_name','標題索引；全文權利歸原發布者'),
                'license_url':source.get('license_url'), 'quiz':[], 'quiz_reviewed':False}
        # Retain the original byline when syndicated via Yahoo.
        item['byline'] = entry.findtext('{http://purl.org/dc/elements/1.1/}creator','').strip()
        results.append(item)
    return results

def knowledge_article(title, category, alternatives):
    data = wiki_query({'action':'query','prop':'extracts','explaintext':1,
                       'titles':title,'variant':'zh-tw','redirects':1,'converttitles':1})
    page = next(iter(data.get('query',{}).get('pages',{}).values()),{})
    text = page.get('extract','').strip()
    if page.get('missing') is not None or page.get('ns') != 0 or len(text) < 900 or len(text) > 100000:
        raise ValueError('missing, too short or unsuitable article')
    # Plaintext APIs omit tables, images and mathematical markup. Exclude pages
    # whose explanation depends on rendered equations or missing attachments.
    if re.search(r'\\displaystyle|\\begin\{|此為消歧義|這是一個消歧義', text):
        raise ValueError('formula dependent or disambiguation')
    text = CONVERT.convert(text)
    parts = [p.strip() for p in re.split(r'\n\s*\n|\n(?=[^=\n])', text) if p.strip()]
    prose = [p for p in parts if not re.match(r'^=+',p) and len(p)>55]
    if len(prose) < 4: raise ValueError('not enough standalone explanation')
    name = CONVERT.convert(page['title'])
    url = 'https://zh.wikipedia.org/zh-tw/'+up.quote(page['title'].replace(' ','_'))
    references=[]
    try:
        page_html=BeautifulSoup(fetch(url),'html.parser')
        for link in page_html.select('.reflist a.external, .mw-references-wrap a.external'):
            href=up.urljoin(url,link.get('href',''));host=up.urlsplit(href).hostname or ''
            if href.startswith('https://') and any(host==h or host.endswith('.'+h) for h in ['doi.org','ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','pmc.ncbi.nlm.nih.gov','nature.com','science.org','ncl.edu.tw','edu.tw','edu','ac.uk','jstor.org']):
                if href not in [r['url'] for r in references]:references.append({'url':href,'title':link.get_text(' ',strip=True) or host})
            if len(references)>=8:break
    except Exception:
        pass
    quiz = []
    # Source-grounded recall questions: correct answers are exact source sentences.
    # Other choices are explicitly fictional distractors, never presented as facts.
    for part in prose[:2]:
        evidence = re.split(r'(?<=[。！？])',part)[0]
        if len(evidence) > 260: continue
        index = parts.index(part)+1
        options = [evidence, '本文表示，這個概念在任何情況都沒有例外，也不受條件影響。',
                   '本文表示，理解這個概念只要記住名稱，不必考慮定義、機制或實例。']
        offset = (len(name)+index)%3
        options = options[offset:]+options[:offset]
        quiz.append({'question':f'依據〈{name}〉第 {index} 段，下列哪項敘述符合該段原文？',
                     'options':options,'answer':options.index(evidence),'paragraph':index,
                     'supporting_quote':evidence,'explanation':'原文依據：'+evidence})
    return {'id':'wiki:'+str(page['pageid']),'source_id':'wikipedia-zh','source':'維基百科（中文編者群）',
            'source_kind':'encyclopedia','kind':'knowledge','category':category,'title':name,'url':url,
            'published_at':None,'added_at':NOW.isoformat(),'fetched_at':NOW.isoformat(),
            'content_complete':False,'content_scope':'licensed_text_edition','reuse_license':'approved',
            'license_name':'CC BY-SA 4.0（本繁體文字版以相同授權分享）','license_url':LICENSE,
            'attribution':'〈'+name+'〉，維基百科中文編者群；轉換為臺灣繁體用語並整理為文字版，未收錄原站圖表與註腳。',
            'history_url':'https://zh.wikipedia.org/w/index.php?title='+up.quote(page['title'])+'&action=history',
            'translation_status':'original_zh_hant','standalone_text_checked':True,
            'evidence_original':parts,'excerpt_original':prose[0][:240],
            'verification':'publisher_domain_checked','quiz_origin':'source_grounded_recall',
            'quiz_reviewed':False,'quiz':quiz,
            'references':references, 'reading_minutes':max(3,round(len(text)/450))}

def run():
    config = json.loads((ROOT/'catalog_sources.json').read_text())
    target = ROOT/'data/catalog.json'
    old = json.loads(target.read_text()) if target.exists() else {'items':[], 'discovery':{}}
    retained = {a['url']:a for a in old['items']}
    statuses = {}; cursors = old.get('discovery',{})
    before = set(retained)
    attempted=cursors.setdefault('attempted',{})
    attempted_urls={a.get('requested_title',a['title']) for a in retained.values() if a['kind']=='knowledge'}
    # Isolate each publisher and each article failure; retain usable cached content.
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(media_feed,s):s for s in config['media']}
        for task in cf.as_completed(tasks):
            source=tasks[task]
            try:
                items=task.result()
                for a in items: retained[a['url']]=a
                statuses[source['name']+' / '+source['category']]={'status':'ok' if items else 'no_recent_items','accepted':len(items),'checked_at':NOW.isoformat()}
            except Exception as error:
                statuses[source['name']+' / '+source['category']]={'status':'error','reason':type(error).__name__,'checked_at':NOW.isoformat()}
    candidates=[]
    existing_titles={a['title'] for a in retained.values() if a['kind']=='knowledge'}
    for topic in config['knowledge']:
        for title in topic['titles']:
            if CONVERT.convert(title) not in existing_titles and title not in attempted_urls and (not stamp(attempted.get(title,'')) or NOW-stamp(attempted[title])>dt.timedelta(days=30)):
                candidates.append((title,topic['category'],topic['titles']))
    # Once the curriculum has been seeded, discover fresh concepts through rotating
    # topical category pages. Persist pagination rather than rereading a fixed set.
    day=NOW.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    pending=cursors.pop('pending',[])
    for row in pending:
        if CONVERT.convert(row[0]) not in existing_titles:candidates.append(tuple(row))
    if not candidates and cursors.get('day') != day:
        def discover(topic):
            cat=topic['discovery_category']
            params={'action':'query','list':'categorymembers','cmtitle':'Category:'+cat,'cmtype':'page','cmlimit':12}
            if cursors.get(cat):params['cmcontinue']=cursors[cat]
            return wiki_query(params)
        with cf.ThreadPoolExecutor(max_workers=3) as pool:
            tasks={pool.submit(discover,topic):topic for topic in config['knowledge']}
            for task in cf.as_completed(tasks):
                topic=tasks[task];cat=topic['discovery_category']
                try:
                    result=task.result()
                    if 'error' in result:raise ValueError('category API error')
                    cursors[cat]=result.get('continue',{}).get('cmcontinue')
                    for page in result.get('query',{}).get('categorymembers',[]):
                        title=page['title']
                        if page.get('ns')==0 and CONVERT.convert(title) not in existing_titles and title not in attempted_urls and (not stamp(attempted.get(title,'')) or NOW-stamp(attempted[title])>dt.timedelta(days=30)):
                            candidates.append((title,topic['category'],topic['titles']))
                except Exception as error:
                    statuses['知識探索 / '+cat]={'status':'error','reason':type(error).__name__,'checked_at':NOW.isoformat()}
        cursors['day']=day
    # Initial run expands every topic. Later runs add at most 24 concepts per check.
    if existing_titles:
        # Interleave topics so one long category cannot monopolize the batch.
        buckets={}
        for row in candidates:buckets.setdefault(row[1],[]).append(row)
        candidates=[]
        while any(buckets.values()):
            for group in buckets.values():
                if group:candidates.append(group.pop(0))
    limit=72 if not existing_titles else 24
    # Keep discovery results that do not fit in this batch for the next check.
    cursors['pending']=candidates[limit:]
    # Revisit a few older knowledge texts monthly, preserving their addition date.
    for a in sorted(knowledge_old := [a for a in retained.values() if a['kind']=='knowledge'],key=lambda a:a.get('fetched_at',''))[:4]:
        checked=stamp(a.get('fetched_at',''))
        if checked and NOW-checked>dt.timedelta(days=30):
            candidates.append((a.get('requested_title',a['title']),a['category'],[]))
    batch=list(dict((row[0],row) for row in candidates[:limit]+[row for row in candidates[limit:] if row[0] in attempted_urls]).values())
    accepted=failed=0
    print('Knowledge candidates:',len(batch),'queued:',len(cursors.get('pending',[])),flush=True)
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        tasks={pool.submit(knowledge_article,*row):row[0] for row in batch}
        for task in cf.as_completed(tasks):
            attempted[tasks[task]]=NOW.isoformat()
            try:
                a=task.result();a['requested_title']=tasks[task];previous=retained.get(a['url'],{});a['added_at']=previous.get('added_at',a['added_at']);retained[a['url']]=a;accepted+=1
            except Exception as error:
                failed+=1; print('Knowledge skipped:',tasks[task],type(error).__name__,str(error)[:80],flush=True)
    statuses['開放百科知識']={'status': 'partial' if failed else 'ok','accepted':accepted,'skipped':failed,'checked_at':NOW.isoformat()}
    knowledge=[a for a in retained.values() if a['kind']=='knowledge']
    news=sorted([a for a in retained.values() if a['kind']=='news' and stamp(a.get('published_at','')) and stamp(a['published_at'])>=NOW-dt.timedelta(days=7)],key=lambda a:a['published_at'],reverse=True)[:400]
    unique_news={}
    for a in news:
        key=re.sub(r'[\W_]+','',a['title']).lower()
        if key not in unique_news:unique_news[key]=a
    news=list(unique_news.values())
    output={'schema_version':1,'updated_at':NOW.isoformat(),'items':knowledge+news,'sources':statuses,
            'discovery':cursors,'new_items':len(set(a['url'] for a in knowledge+news)-before),
            'counts':{'knowledge':len(knowledge),'news':len(news)}}
    target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print('Catalog:',output['counts'],'new:',output['new_items'],flush=True)

if __name__=='__main__': run()
