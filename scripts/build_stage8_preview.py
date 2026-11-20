#!/usr/bin/env python3
"""Bundle stage-eight code with explicit fictional fixtures and memory storage."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'preview' / 'stage8-acceptance.html'

def knowledge(key, title, category, paragraphs, question, options, answer, explanation):
    return {'id':key,'title':title,'category':category,'kind':'knowledge','source':'Daily Insight 預覽示範教材',
            'url':'https://example.org/'+key,'verification':'publisher_domain_checked','reuse_license':'approved',
            'content_complete':True,'standalone_reviewed':True,'translation_status':'original_zh_hant',
            'content_scope':'full_text','evidence_original':paragraphs,'quiz_reviewed':True,
            'quiz':[{'question':question,'options':options,'answer':answer,'paragraph':1,'explanation':explanation}]}

articles = [
    knowledge('stage7-cost','安排一天行程的機會成本','商業與經濟',[
        '機會成本是指做出一個選擇時，所放棄的最佳可行方案帶來的價值。假設你只有一小時，可以整理旅行資料、練習英文或看一集影集；你選擇整理旅行資料，而在另外兩個方案中最重視練習英文，整理資料的機會成本就是放棄練習英文帶來的價值。',
        '比較方案時，可以先列出真正可行的選項，再依自己的目標排序。機會成本會隨可行選項及你重視的事情改變，也不一定能直接用金錢衡量。'],
        '若選擇整理資料，次佳選項是練英文，機會成本是什麼？',['三件事花費時間的總和','放棄練英文所帶來的價值','已經看過影集的時間'],1,
        '機會成本取決於放棄的最佳可行方案；在這個例子中是練習英文。'),
    knowledge('stage7-repeat','分次練習與閱讀回憶','心理學與人類行為',[
        '間隔重複是一種把複習安排在不同時間的學習方式。例如讀完一本書的一節，可以在之後幾天回想重點，再翻開原文檢查；重複練習時也能依自己記得的程度調整下一次複習時間，而不必每次都從頭重讀。',
        '回想後要核對原文，避免把記錯的內容反覆記住。本例的練習步驟是先合上書說出重點，再檢查原文，最後記下仍不理解的問題。'],
        '在本例中，回想文章重點後的下一步是什麼？',['立即刪除筆記','翻開原文核對','只看文章標題'],1,'先核對原文，才能知道自己的回想是否準確。'),
    knowledge('stage7-logic','用前提支持結論','邏輯學',[
        '前提是指在一段論證中用來支持結論的陳述。例如所有這個盒子裡的卡片都是藍色的，而這張卡片來自這個盒子，因此這張卡片是藍色的；前兩個陳述就是用來支持最後結論的前提。',
        '檢查論證時，除了確認推理形式是否成立，也要分別檢查前提是否為真。有效的推理形式本身，並不能替我們保證實際觀察到的前提正確。'],
        '「這張卡片來自這個盒子」在例子中是什麼？',['前提','結論','無關的廣告'],0,'它和盒子中卡片的顏色一起支持結論。')
]
for i, topic in enumerate(['politics_policy','technology_ai','consumer_lifestyle']):
    headline = ['示範城市公布圖書館晚間服務試辦','示例團隊開始測試借書查詢介面','示範圖書館公開讀者回饋彙整'][i]
    paragraphs = [
        '這是用來驗收功能的虛構新聞。示範圖書館宣布在三個分館試辦晚間延長服務，先收集借閱人次與讀者回饋，再決定是否調整時段。公告同時列出試辦範圍和服務內容，讓讀者可以檢查哪些分館適用。',
        '示範方案仍在試辦階段，尚未公布實施後的比較結果。是否擴大辦理，仍需等待試辦資料和後續正式公告；目前無法僅憑開放時數就判斷成效。'
    ]
    if i == 1:
        paragraphs = ['這是功能驗收用的虛構新聞。示例團隊開始測試借書查詢介面，邀請少量讀者完成找書及確認館藏的操作，記錄查詢所需時間與遇到的問題。這個測試還沒有正式上線，也尚未公開完整測試結果。', '接下來可比較新舊介面的任務完成率，並確認測試讀者是否涵蓋不同使用習慣。產品在試用階段是否容易使用，仍需檢查公開的測試方式及結果。']
    elif i == 2:
        paragraphs = ['這是功能驗收用的虛構新聞。示範圖書館公開晚間服務的讀者意見彙整，意見包含希望延後閉館、增加自助借書設備，以及保留安靜座位等需求。這份彙整呈現的是收到的意見，並未聲稱代表所有讀者。', '意見收集的期間、方式與回覆人數會影響解讀。讀者可以先確認誰參與回覆，再觀察圖書館如何將建議轉成可評估的服務調整。']
    articles.append({'id':f'stage7-news-{i}','title':headline,'kind':'news','category':'社會與公共政策',
        'source':'虛構發布者 · 功能示範','url':f'https://example.org/stage7-news-{i}',
        'verification':'publisher_domain_checked','reuse_license':'approved','content_complete':True,
        'translation_status':'original_zh_hant','evidence_original':paragraphs,'published_at':'2026-11-20T00:00:00Z'})

event = {'id':'stage7-demo-event','title':'示範圖書館晚間服務試辦','primary_topic':'politics_policy',
         'related_topics':['consumer_lifestyle'],'first_seen_at':'2026-11-19T00:00:00Z',
         'updated_at':'2026-11-20T00:00:00Z','source_count':2,'importance_score':5,
         'importance_factors':{'topical':2,'impact':1,'recency':2,'sources':0},
         'articles':[{'title':'示範圖書館公布晚間試辦範圍','source':'虛構發布者','source_type':'official',
                      'url':'https://example.org/stage7-news-0','published_at':'2026-11-19T00:00:00Z','content_access':'full'},
                     {'title':'試辦後讀者提出服務時段建議','source':'虛構媒體','source_type':'media',
                      'url':'https://example.org/stage7-news-2','published_at':'2026-11-20T00:00:00Z','content_access':'headline_only'}]}
topics = [{'id':key,'label':label} for key,label in [('technology_ai','科技與 AI'),('semiconductors','半導體產業'),('global_finance','全球經濟與金融'),('business_management','企業經營與管理'),('politics_policy','國際政治與政策'),('consumer_lifestyle','生活與消費趨勢')]]
seed = {'saved':[articles[0]['url']],'read':[articles[0]['url']],
        'quizResults':{'stage7-cost':{'score':0,'total':1,'answers':[0],'completedAt':'2026-11-20T00:00:00Z'},
                       'stage7-repeat':{'score':0,'total':1,'answers':[2],'completedAt':'2026-11-19T00:00:00Z'}}}
# Reuse the reviewed fictional reading fixtures; historical observations are simulated separately.
events=[event]
for i,(title,topic) in enumerate([('示例借書介面測試進度','technology_ai'),('示範讀者回饋與生活服務','consumer_lifestyle')],1):
    events.append({**event,'id':f'stage8-demo-{i}','title':title,'primary_topic':topic,'related_topics':[]})
seed_preferences={'watched':[event['id']],'reportPeriod':'7'}
setup=r'''
const previewRecords=new Map([['daily-insight-v1.8',JSON.stringify(__SEED__)],['daily-insight-trends-v2',JSON.stringify(__PREFS__)]]);
const previewStorage={getItem:key=>previewRecords.get(key)??null,setItem:(key,value)=>previewRecords.set(key,value),removeItem:key=>previewRecords.delete(key)};
const previewArticles=__ARTICLES__;
const previewTrends=__TRENDS__;
let previewScenario='complete';
function fixtureHistory(){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const shift=(n)=>{const d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  if(previewScenario==='legacy')return {schema_version:1,days:[{date:shift(-2),total_events:90},{date:shift(-1),total_events:100}]};
  let days=Array.from({length:180},(_,i)=>{
    const count=previewScenario==='zero'?(i>=173?4:0):i>=173?8:i>=166?4:i>=150?3:i>=120?2:1;
    return {date:shift(i-180),observation_version:1,observed_at:shift(i-180)+'T10:00:00Z',closed:true,baseline:false,
      event_stats:previewTrends.events.map((e,k)=>({id:e.id,aliases:[],title:e.title,primary_topic:e.primary_topic,source_groups:['fictional-source'],new_article_keys:Array.from({length:k===0?count:k===1?2:1},(_,j)=>'https://example.org/demo/'+i+'/'+k+'/'+j)}))};
  });
  if(previewScenario==='gap')days=days.filter((_,i)=>i!==177);
  days.push({date:today,observation_version:1,observed_at:new Date().toISOString(),closed:false,baseline:false,event_stats:[]});
  if(previewScenario==='zero')days.forEach((d,i)=>{if(i<173)d.event_stats.forEach(e=>e.new_article_keys=[]);});
  return {schema_version:1,event_metrics_version:1,days};
}
window.fetch=async path=>({ok:true,json:async()=>String(path).includes('trend-history')?fixtureHistory():String(path).includes('source-health')?{schema_version:1,links:{}}:String(path).includes('trends.json')?previewTrends:{items:previewArticles,updated_at:new Date().toISOString()},text:async()=>''});
document.addEventListener('click',async event=>{
 const scenario=event.target.closest('[data-demo-scenario]');
 if(scenario){previewScenario=scenario.dataset.demoScenario;document.querySelectorAll('[data-demo-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(b===scenario)));await window.DailyTrends.refresh();document.getElementById('preview-note').textContent='已切換：'+scenario.textContent+'。所有歷史數值均為驗收模擬資料。';return;}
 const link=event.target.closest('a');if(link){event.preventDefault();document.getElementById('preview-note').textContent='虛構示範來源不開啟外部網站。正式版保留來源連結。';}
},true);
'''
setup=setup.replace('__SEED__',json.dumps(seed,ensure_ascii=False)).replace('__PREFS__',json.dumps(seed_preferences,ensure_ascii=False)).replace('__ARTICLES__',json.dumps(articles,ensure_ascii=False)).replace('__TRENDS__',json.dumps({'schema_version':1,'topics':topics,'events':events,'generated_at':'2026-11-20T00:00:00Z'},ensure_ascii=False))
css=re.sub(r'^\s*@import\s+url\([^)]*\)\s*;', '',(ROOT/'style.css').read_text(),count=1)
html=(ROOT/'index.html').read_text()
html=re.sub(r'<link[^>]+>', '', html)
html=re.sub(r'<script src=[^>]+></script>','',html)
html=html.replace('</head>','<style>'+css+'</style><style>.preview-note{background:#fbefd5;border:1px solid #dcc69c;padding:16px 20px;border-radius:12px;margin-bottom:18px;line-height:1.7}.preview-note p{margin:5px 0}.preview-note strong{font-size:17px}.preview-scenarios{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.preview-scenarios button{min-height:44px;border:1px solid #adbdb3;border-radius:12px;padding:9px 14px;color:#294b40;background:#fffdf7;font:inherit;cursor:pointer}.preview-scenarios button[aria-pressed=true]{background:#294b40;color:white}</style></head>')
html=html.replace('<main id="main">','<aside class="preview-note"><strong>第八階段 · 趨勢升溫與整合驗收</strong><p id="preview-note" role="status">示範資料：所有新聞、事件及歷史統計均為虛構，用於驗收操作，不代表實際新聞趨勢。</p><p>先在下方切換情境，再比較 7／30／90 天；也可到趨勢總覽、事件詳情、我的關注與週月報告。操作僅暫存於此頁，重新開啟即重置。</p><div class="preview-scenarios" role="group" aria-label="驗收資料情境"><button data-demo-scenario="complete" aria-pressed="true">完整資料</button><button data-demo-scenario="gap" aria-pressed="false">缺少日誌</button><button data-demo-scenario="zero" aria-pressed="false">前期零收錄</button><button data-demo-scenario="legacy" aria-pressed="false">歷史不足</button></div></aside><main id="main">')
html=html.replace('<footer>Daily Insight 3.0.1 ·','<footer>第八階段驗收預覽 ·')
html=html.replace('<title>Daily Insight · 每日新知與趨勢情報</title>','<title>Daily Insight 3.0 第八階段驗收預覽</title>')
modules=[setup]
for name in ['personal-data.js','trend-metrics.js','learning.js','trends.js','app.js']:
    code=(ROOT/name).read_text()
    code=re.sub(r'\blocalStorage\b','previewStorage',code)
    if name=='trends.js':code=code.replace("currentTab = 'overview'", "currentTab = 'heat'")
    if name=='app.js':
        code=code.replace("const state={page:'news'", "const state={page:'trends'")
        code=re.sub(r"^if\('serviceWorker'.*?;$",'',code,flags=re.M)
    modules.append(code)
html=html.replace('</body>',''.join('<script>'+code.replace('</script','<\\/script')+'</script>' for code in modules)+'</body>')
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html)
print(f'Built {OUT} ({OUT.stat().st_size:,} bytes)')
