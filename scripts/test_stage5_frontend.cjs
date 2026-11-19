const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const articles = [
  {title:'AI 企業發布新技術計畫',url:'https://agency.example/ai',source:'官方公告',
   published_at:'2026-11-18T09:00:00Z',source_type:'official',content_access:'licensed_full_text',
   source_group:'agency',source_domain:'agency.example'},
  {title:'AI 企業發布新技術計畫',url:'https://press.example/ai',source:'媒體甲',
   published_at:'2026-11-18T10:00:00Z',source_type:'media',content_access:'headline_only',
   source_group:'press',source_domain:'press.example'},
  {title:'AI 企業技術計畫與市場觀察 <script>',url:'https://other.example/ai',source:'媒體乙',
   published_at:'2026-11-18T11:00:00Z',source_type:'media',content_access:'excerpt',
   source_group:'other',source_domain:'other.example'}
];
const event = {id:'trend-new',aliases:['trend-old'],title:'AI 企業發布新技術計畫',
  primary_topic:'technology_ai',related_topics:[],importance_score:7,
  importance_factors:{topical:3,impact:1,recency:2,sources:1},
  updated_at:'2026-11-18T11:00:00Z',first_seen_at:'2026-11-18T09:00:00Z',
  article_urls:articles.map(a=>a.url),source_count:3,articles,
  headline_groups:[{headline:articles[0].title,article_urls:articles.slice(0,2).map(a=>a.url),source_groups:['agency','press'],status:'similar_headline_only',independently_verified:false}],
  evidence_status:'primary_source_available',independently_verified:false,facts:[],watchpoint:'檢查後續原始來源'};
const trendData = {schema_version:1,generated_at:'2026-11-19T00:00:00Z',topics:[{id:'technology_ai',label:'科技與 AI'}],events:[event]};
const history = {schema_version:1,days:[]};
const health = {schema_version:1,links:{
  [articles[0].url]:{status:'available',checked_at:'2026-11-19T01:00:00Z',http_status:200},
  [articles[1].url]:{status:'unknown',checked_at:'2026-11-19T01:00:00Z',http_status:403}
}};
const storage = new Map([
  ['daily-insight-v1.8',JSON.stringify({read:['old-news'],saved:['saved-news'],quizResults:{old:{score:1,total:1}}})],
  ['daily-insight-trends-v2',JSON.stringify({topics:['technology_ai'],watched:['trend-old'],viewed:{'trend-old':'2026-11-17T00:00:00Z'}})]
]);
const listeners = {};
const context = {
  console,Date,Intl,URL,AbortController,setTimeout,clearTimeout,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  window:{addEventListener:()=>{},scrollTo:()=>{}},
  document:{addEventListener:(event,fn)=>listeners[event]=fn,querySelector:()=>({classList:{contains:()=>false}})},
  navigator:{},
  fetch: async url=>({ok:true,json:async()=>url.includes('source-health')?health:url.includes('history')?history:trendData})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('trends.js','utf8'),context);
const controller = context.window.DailyTrends;
const click = dataset=>listeners.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});
const changeCompare = (side,value)=>listeners.change({target:{matches:s=>s==='select[data-trend-compare]',dataset:{trendCompare:side},value}});
controller.render([]);
setImmediate(()=>{
  const overview = controller.render([]);
  assert.ok(overview.includes('★ 已關注'), 'legacy watched event remains visible');
  assert.ok(overview.includes('3 篇相關報導'));
  click({trendDetail:'trend-new'});
  const evidence = controller.render([]);
  assert.ok(evidence.includes('標題主張與證據對照'));
  assert.ok(evidence.includes('未經本站獨立事實查核'));
  assert.ok(evidence.includes('&lt;script&gt;'), 'external article titles are escaped');
  click({trendPane:'compare'});
  let comparison = controller.render([]);
  assert.ok(comparison.includes('新聞並排比較'));
  assert.ok(comparison.includes('trend-compare-left'));
  assert.ok(comparison.includes('trend-compare-right'));
  changeCompare('right',articles[0].url);
  comparison = controller.render([]);
  assert.ok(comparison.includes('選到同一篇文章'));
  changeCompare('right',articles[2].url);
  comparison = controller.render([]);
  assert.ok(comparison.includes('描述不同'));
  click({trendPane:'quality'});
  const quality = controller.render([]);
  assert.ok(quality.includes('來源品質檢核'));
  assert.ok(quality.includes('連結有回應'));
  assert.ok(quality.includes('暫無法確認'));
  assert.ok(quality.includes('尚未進行連結檢查'));
  click({trendWatch:'trend-new'});
  assert.deepEqual(JSON.parse(storage.get('daily-insight-trends-v2')).watched,[]);
  assert.deepEqual(JSON.parse(storage.get('daily-insight-v1.8')),{
    read:['old-news'],saved:['saved-news'],quizResults:{old:{score:1,total:1}}
  });
  console.log('Passed: stage-5 evidence, source quality, compare selectors, legacy aliases and safe text');
});
