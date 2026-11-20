#!/usr/bin/env python3
"""Build an entirely offline, read-only-data stage-6 QA copy from production source.

The preview runs the real trends and backup modules against synthetic data and
an in-memory storage object. It never calls the live feed or user localStorage.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'preview' / 'stage6-acceptance.html'
TOPICS = [
    ('technology_ai', '科技與 AI'), ('semiconductors', '半導體產業'),
    ('global_finance', '全球經濟與金融'), ('business_management', '企業經營與管理'),
    ('politics_policy', '國際政治與政策'), ('consumer_lifestyle', '生活與消費趨勢'),
]
EVENTS = []
HEADLINES = [
    '示例科技公布 AI 技術研發方向',
    '示例晶片廠發布先進封裝進度',
    '示例研究機構說明國際金融趨勢',
    '示例企業公布供應鏈管理方案',
    '示例機構發布國際政策說明',
    '示例零售品牌調整服務模式',
]
for i, (topic, _) in enumerate(TOPICS):
    articles = [
        {'title': HEADLINES[i], 'source': '示例發布者', 'url': f'https://example.org/demo-{i}-a',
         'published_at': '2026-11-18T04:00:00Z', 'source_type': 'official',
         'content_access': 'headline_only', 'source_domain': 'example.org'},
        {'title': HEADLINES[i] + '：媒體後續觀察', 'source': '示例媒體',
         'url': f'https://example.org/demo-{i}-b', 'published_at': '2026-11-19T06:00:00Z',
         'source_type': 'media', 'content_access': 'excerpt', 'source_domain': 'example.org'},
    ]
    EVENTS.append({
        'id': f'stage6-demo-{i}', 'aliases': [], 'title': HEADLINES[i],
        'primary_topic': topic, 'related_topics': [], 'importance_score': 6,
        'importance_factors': {'topical': 2, 'impact': 1, 'recency': 2, 'sources': 1},
        'first_seen_at': '2026-11-18T04:00:00Z', 'updated_at': '2026-11-19T06:00:00Z',
        'source_count': 2, 'articles': articles,
        'watchpoint': '依可追溯來源追蹤更新。',
        'headline_groups': [{'headline': HEADLINES[i], 'article_urls': [a['url'] for a in articles],
                             'source_groups': ['official', 'media']}],
    })

trends = {'schema_version': 1, 'generated_at': '2026-11-20T00:00:00Z',
          'topics': [{'id': k, 'label': v} for k, v in TOPICS], 'events': EVENTS}
history = {'schema_version': 1, 'days': []}
health = {'schema_version': 1, 'links': {}}

css = (ROOT / 'style.css').read_text(encoding='utf-8')
css = re.sub(r'^@import url\([^;]+;', '', css, count=1)
backup = (ROOT / 'personal-data.js').read_text(encoding='utf-8')
front = (ROOT / 'trends.js').read_text(encoding='utf-8')
front = re.sub(r'\blocalStorage\b', 'demoStorage', front)
front = front.replace('window.location.reload()', 'window.stage6DemoReload()')
assert 'localStorage' not in front

script = '''
const demoItems = new Map();
const demoStorage = {
 getItem: k => demoItems.get(k) ?? null,
 setItem: (k, v) => demoItems.set(k, v),
 removeItem: k => demoItems.delete(k)
};
const demoData = __TREND__;
const demoHistory = __HISTORY__;
const demoHealth = __HEALTH__;
window.fetch = async path => {
 const key = String(path);
 const data = key.includes('trend-history') ? demoHistory : key.includes('source-health') ? demoHealth
   : key.includes('trends.json') ? demoData : null;
 if (!data) throw Error('此離線預覽不允許任何外部網路要求');
 return {ok:true,json:async()=>data};
};
'''.replace('__TREND__', json.dumps(trends, ensure_ascii=False, separators=(',', ':')))
script = script.replace('__HISTORY__', json.dumps(history, ensure_ascii=False))
script = script.replace('__HEALTH__', json.dumps(health, ensure_ascii=False))

html = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Insight 3.0 第六階段 · 非正式驗收</title>
<style>{css}</style><style>.stage6-demo-banner{{position:relative;padding:14px 18px;margin-bottom:14px;background:#fff0d8;border:1px solid #dfc8a3;border-radius:11px;color:#78512f;line-height:1.75;font-size:14px}}.stage6-demo-banner strong{{display:block;font-size:16px}}.stage6-demo-mainnav button{{pointer-events:none}}.stage6-demo-mainnav button.active{{pointer-events:auto}}</style>
</head><body><div class="shell"><header class="mast"><div class="brand"><span class="brandmark">✳</span><div><div class="eyebrow">CURIOUS MINDS · DAILY EDITION</div><h1>Daily <em>Insight.</em></h1></div></div><span class="header-right">第六階段非正式驗收</span></header>
<div class="stage6-demo-banner" role="status"><strong>Daily Insight 3.0 · 第六階段功能驗收</strong>此頁使用真實第六階段前端程式和虛構資料、記憶體儲存。可測試首頁排序／隱藏、企業關鍵字、事件狀態及 JSON 匯入／匯出；不會讀寫正式新聞、知識、個人資料或網站。</div>
<div class="site-toolbar"><nav class="stage6-demo-mainnav" aria-label="主選單"><button type="button" class="tab active" data-page="trends">趨勢情報 <span class="nav-new">3.0</span></button><button type="button" class="tab">新聞</button><button type="button" class="tab">知識</button><button type="button" class="tab">收藏書架</button><button type="button" class="tab">學習足跡</button><button type="button" class="tab">來源準則</button></nav></div>
<main id="main"><p>正在載入示範資料…</p></main><footer>完全離線的開發分支預覽，沒有正式發布，也不使用付費 API。</footer></div>
<script>{script.replace('</script', '<\\/script')}</script>
<script>{backup.replace('</script', '<\\/script')}</script>
<script>{front.replace('</script', '<\\/script')}</script>
<script>
function render() {{ document.getElementById('main').innerHTML = window.DailyTrends.render([]); }}
document.addEventListener('click', e => {{
 const link = e.target.closest('.trend-source-link');
 if (!link) return;
 e.preventDefault();
 document.querySelector('.stage6-demo-banner').textContent = '此為虛構來源示範連結，不會開啟外部網站。正式版會保留可追溯的真實來源。';
}}, true);
window.stage6DemoReload = () => {{
 const banner = document.querySelector('.stage6-demo-banner');
 banner.textContent = '示範匯入已寫入暫存記憶體；正式版此時會重新載入頁面。關閉此頁後資料不會保留。';
 render();
}};
render();
</script></body></html>'''
OUT.write_text(html, encoding='utf-8')
print(f'Built isolated stage-six acceptance preview: {OUT}, {len(html)} characters')
