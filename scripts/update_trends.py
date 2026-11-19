#!/usr/bin/env python3
"""Build a source-linked trend index from Daily Insight's existing article catalog.

No generative model, scraping, subscriptions, or modification of source articles.
Importance and topic assignments are transparent heuristics, not fact checking.
"""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
import pathlib
import re
import tempfile
import os
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
NOW = dt.datetime.now(dt.timezone.utc)
MAX_AGE_DAYS = 21

TOPICS = [
    ('technology_ai', '科技與 AI', ('人工智慧', '生成式', 'ai', 'llm', '模型', '算力', '雲端', '資安', 'cyber', 'robot', '機器人', '數位', '科技', '軟體', 'nvidia', 'openai', 'google', 'microsoft', '衛星', '太空')), 
    ('semiconductors', '半導體產業', ('半導體', '晶片', '晶圓', '先進製程', '封裝', '台積電', 'tsmc', 'gpu', 'hbm', '記憶體', '矽光子', 'asml', 'chip', 'nvidia')),
    ('global_finance', '全球經濟與金融', ('利率', '央行', '聯準會', 'fed', '通膨', 'inflation', '匯率', '金融', '經濟', '股市', '台股', '就業', 'gdp', '債券', '貨幣', '貿易', '財政')),
    ('business_management', '企業經營與管理', ('企業', '公司', '營運', '策略', '管理', '轉型', '財報', '獲利', '董事會', '併購', 'ceo', '供應鏈', '商業', '人力', '治理', '新創', '創業')), 
    ('politics_policy', '國際政治與政策', ('國際', '政府', '政策', '法案', '立法', '關稅', '外交', '國安', '美國', '中國', '歐盟', 'apec', '地緣', '總統', '國會', '制裁', '協定', '貿易', '選舉')), 
    ('consumer_lifestyle', '生活與消費趨勢', ('消費', '零售', '生活', '電商', '旅遊', '食品', '健康', '醫療', '住宅', '交通', '購物', '旅館', '行動支付', '網購', '物價', '民生')),
]
TOPIC_LABELS = {item[0]: item[1] for item in TOPICS}
CATEGORY_BOOSTS = {
    'AI與科技': 'technology_ai', '科技與工程': 'technology_ai',
    '商業與經濟': 'global_finance', '經濟與財政': 'global_finance',
    '國際與全球趨勢': 'politics_policy', '台灣政治與社會': 'politics_policy',
    '社會與公共政策': 'politics_policy', '日常生活與實用技能': 'consumer_lifestyle',
    '醫療與健康': 'consumer_lifestyle', '食品與生活': 'consumer_lifestyle',
}
BROAD_TERMS = {'科技', '數位', '國際', '公司', '企業', '健康', '經濟', '美國', '中國', '服務', '管理', '商業'}
IMPACT_WORDS = ('重大', '全球', '首次', '政策', '法案', '投資', '突破', '升級', '國際', '轉型', '影響', '供應鏈', '創新', '創紀錄', 'official', 'announces')
EVENT_WORDS = ('宣布', '公布', '推出', '發布', '通過', '調整', '合作', '上線', 'invest', 'launch', 'announce', 'approve', 'release', '升級', '簽署', '開幕', '修正')
WATCHPOINTS = {
    'technology_ai': '後續產品實際應用、技術能力及官方更新',
    'semiconductors': '供應鏈合作、製程與產能進度及需求變化',
    'global_finance': '後續公布的官方指標與政策決議',
    'business_management': '企業後續公告、執行進度與可衡量成果',
    'politics_policy': '正式政策文本、施行日期及後續配套',
    'consumer_lifestyle': '實際採用情況、消費者反應及後續服務變化',
}


def read_items(name):
    try:
        data = json.loads((DATA / name).read_text(encoding='utf-8'))
        return data.get('items', []) if isinstance(data.get('items'), list) else []
    except (OSError, ValueError):
        return []


def safe_url(url):
    try:
        parts = urlsplit(url)
        return bool(parts.netloc and parts.scheme == 'https' and not parts.username)
    except (TypeError, ValueError):
        return False


def timestamp(value):
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=dt.timezone.utc) if not parsed.tzinfo else parsed.astimezone(dt.timezone.utc)
    except (AttributeError, ValueError):
        return None


def topic_scores(article):
    title = str(article.get('title', '')).lower()
    category = str(article.get('category', ''))
    scores = {}
    for key, _label, terms in TOPICS:
        matched_terms = [term for term in terms if term in title]
        matches = len(matched_terms)
        # A broad news category without a title-level subject match is not a trend.
        if not matches or (matches == 1 and matched_terms[0] in BROAD_TERMS and CATEGORY_BOOSTS.get(category) != key):
            scores[key] = 0
            continue
        score = matches * 3
        if CATEGORY_BOOSTS.get(category) == key:
            score += 2
        if key == 'semiconductors' and any(x in title for x in ('半導體', '晶片', '晶圓', '台積電', 'tsmc', '封裝')):
            score += 5
        scores[key] = score
    return scores


def grams(title):
    title = title.lower()
    words = re.findall(r'[a-z][a-z0-9-]{2,}', title)
    chinese = re.findall(r'[\u4e00-\u9fff]{3,}', title)
    for run in chinese:
        words.extend(run[i:i + 3] for i in range(len(run) - 2))
    return set(words) - {'台灣', '今日', '新聞', '表示', '進行', '目前', '未來'}


def similar(a, b):
    if a['topic'] != b['topic']:
        return False
    shared = a['grams'] & b['grams']
    union = a['grams'] | b['grams']
    return len(shared) >= 3 and bool(union) and len(shared) / len(union) >= .38


def load_previous():
    try:
        previous = json.loads((DATA / 'trends.json').read_text(encoding='utf-8'))
        return {url: event['id'] for event in previous.get('events', []) for url in event.get('article_urls', [])}
    except (OSError, KeyError, ValueError, TypeError):
        return {}


def build_events(articles, now=NOW, previous=None):
    previous = previous or {}
    cutoff = now - dt.timedelta(days=MAX_AGE_DAYS)
    candidates = []
    seen = set()
    for a in articles:
        url, title = a.get('url'), str(a.get('title') or '').strip()
        published = timestamp(a.get('published_at'))
        if a.get('kind') == 'knowledge' or not title or not safe_url(url) or url in seen:
            continue
        # Sports match scores or country names are not by themselves policy signals.
        if a.get('category') == '運動與健康':
            continue
        if not published or not cutoff <= published <= now + dt.timedelta(days=1):
            continue
        seen.add(url)
        scores = topic_scores(a)
        top = sorted(scores, key=lambda k: (-scores[k], list(TOPIC_LABELS).index(k)))
        if scores[top[0]] == 0:
            continue
        candidates.append({'article': a, 'date': published, 'topic': top[0],
                           'related': [key for key in top[1:] if scores[key] >= 5][:2],
                           'grams': grams(title), 'score': scores[top[0]]})
    candidates.sort(key=lambda x: (x['date'], x['score']), reverse=True)
    clusters = []
    for candidate in candidates:
        matching = next((cluster for cluster in clusters if similar(candidate, cluster[0])), None)
        if matching is None:
            clusters.append([candidate])
        else:
            matching.append(candidate)
    events = []
    for group in clusters:
        best = max(group, key=lambda x: (x['score'], x['article'].get('source_kind') != 'media', x['date']))
        latest = max(x['date'] for x in group)
        earliest = min(x['date'] for x in group)
        articles_by_date = sorted(group, key=lambda x: x['date'])
        urls = [x['article']['url'] for x in articles_by_date]
        reused = next((previous[url] for url in urls if url in previous), None)
        event_id = reused or 'trend-' + hashlib.sha256(urls[0].encode()).hexdigest()[:14]
        sources = {str(x['article'].get('source') or '來源未標示') for x in group}
        topical = min(3, best['score'] // 4)
        impact = min(3, sum(word in best['article']['title'].lower() for word in IMPACT_WORDS))
        recency = 2 if (now - latest).total_seconds() <= 2 * 86400 else 1 if (now - latest).days <= 7 else 0
        evidence = 2 if len(sources) >= 2 else 1 if sources else 0
        score = min(10, topical + impact + recency + evidence)
        evidence_items = [{'title': x['article']['title'], 'url': x['article']['url'],
                           'source': x['article'].get('source') or '來源未標示',
                           'published_at': x['date'].isoformat()}
                          for x in articles_by_date]
        events.append({
            'id': event_id, 'title': best['article']['title'], 'primary_topic': best['topic'],
            'related_topics': sorted({key for x in group for key in x['related']}),
            'importance_score': score, 'importance_factors': {'topical': topical, 'impact': impact, 'recency': recency, 'sources': evidence},
            'status': 'developing' if len(group) > 1 else 'new',
            'first_seen_at': earliest.isoformat(), 'updated_at': latest.isoformat(),
            'article_urls': urls, 'source_count': len(sources), 'articles': evidence_items,
            'facts': [],  # No machine-authored factual assertions without evidence review.
            'watchpoint': WATCHPOINTS[best['topic']],
            'interpretation_label': '觀察方向，非已證實結論或投資建議',
            'origin_priority': 'primary_source' if any(x['article'].get('source_kind') != 'media' for x in group) else 'media_index',
        })
    return sorted(events, key=lambda e: (-e['importance_score'], e['origin_priority'] != 'primary_source', -timestamp(e['updated_at']).timestamp(), e['id']))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, delete=False, encoding='utf-8') as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write('\n')
        temp_path = file.name
    os.replace(temp_path, path)


def update_history(events, now=NOW):
    path = DATA / 'trend-history.json'
    try:
        history = json.loads(path.read_text(encoding='utf-8')).get('days', [])
    except (OSError, ValueError):
        history = []
    day = now.astimezone(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    counts = collections.Counter(e['primary_topic'] for e in events)
    snapshot = {'date': day, 'total_events': len(events), 'topic_counts': {key: counts[key] for key in TOPIC_LABELS},
                'top_event_ids': [e['id'] for e in events[:8]]}
    days = [entry for entry in history if isinstance(entry, dict) and entry.get('date') != day]
    days.append(snapshot)
    days = sorted(days, key=lambda x: x['date'])[-180:]
    write_json(path, {'schema_version': 1, 'days': days})
    return len(days)


def main():
    articles = read_items('news.json') + read_items('catalog.json') + read_items('taiwan.json')
    events = build_events(articles, previous=load_previous())
    output = {'schema_version': 1, 'generated_at': NOW.isoformat(), 'method': 'explainable_rules_no_ai',
              'disclaimer': '主題歸類與重要性是規則式排序，並非獨立事實查核；原始來源請見各事件。',
              'topics': [{'id': key, 'label': label} for key, label, _ in TOPICS], 'events': events[:180]}
    write_json(DATA / 'trends.json', output)
    days = update_history(output['events'])
    print(f'Trend index: {len(output["events"])} events, {days} historical days, {len(articles)} source articles')


if __name__ == '__main__':
    main()
