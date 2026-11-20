const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const articles=[
  {title:'示例科技發布先進封裝方案',url:'https://official.example/1',source:'官方',source_type:'official',published_at:'2026-11-19T04:00:00Z',content_access:'headline_only'},
  {title:'示例科技補充先進封裝資訊',url:'https://media.example/2',source:'媒體',source_type:'media',published_at:'2026-11-19T07:00:00Z',content_access:'excerpt'}
];
const event={id:'event-new',aliases:['event-old'],title:'示例科技先進封裝方案',primary_topic:'semiconductors',related_topics:['technology_ai'],importance_score:6,
  importance_factors:{topical:2,impact:1,recency:2,sources:1},first_seen_at:'2026-11-19T04:00:00Z',updated_at:'2026-11-19T07:00:00Z',articles,source_count:2,watchpoint:'觀察後續'};
const data={schema_version:1,generated_at:'2026-11-20T00:00:00Z',topics:[{id:'technology_ai',label:'科技與 AI'},{id:'semiconductors',label:'半導體產業'}],events:[event]};
const reader={read:['old-read'],saved:['old-save'],quizResults:{old:{score:1,total:1}}};
const storage=new Map([
  ['daily-insight-v1.8',JSON.stringify(reader)],
  ['daily-insight-trends-v2',JSON.stringify({topics:['technology_ai','semiconductors'],watched:['event-old'],viewed:{},reportPeriod:'7'})]
]);
const listeners={};let reloads=0;
const context={
  console,Date,Intl,URL,AbortController,setTimeout,clearTimeout,Blob,Math,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  window:{addEventListener(){},scrollTo(){},location:{reload(){reloads++;}}},
  navigator:{},
  document:{
    addEventListener:(type,fn)=>listeners[type]=fn,
    querySelector:()=>({classList:{contains:()=>false}}),
    getElementById:()=>({checked:true})
  },
  fetch:async path=>({ok:true,json:async()=>path.includes('history')?{schema_version:1,days:[]}:path.includes('source-health')?{schema_version:1,links:{}}:data})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('personal-data.js','utf8'),context);
vm.runInContext(fs.readFileSync('trends.js','utf8'),context);
const ui=context.window.DailyTrends;
const button=(dataset,has=[])=>{
  const b={dataset,hasAttribute:attr=>has.includes(attr)};
  return listeners.click({target:{closest:()=>b}});
};
const change=(selector,extra)=>listeners.change({target:{matches:s=>s===selector,...extra}});
const formSubmit=(name,aliases,topics)=>listeners.submit({
  preventDefault(){},target:{id:'trend-term-form',elements:{type:{value:'company'},name:{value:name},aliases:{value:aliases}},querySelectorAll:()=>topics.map(value=>({value}))}
});
ui.render([]);
setImmediate(()=>{(async()=>{
  let home=ui.render([]);
  assert.match(home,/B3 · 個人情報首頁/);
  assert.match(home,/六大情報領域/);
  button({},['data-personal-customize']);
  assert.match(ui.render([]),/首頁模組配置/);
  button({personalMove:'semiconductors',direction:'up'});
  assert.equal(JSON.parse(storage.get('daily-insight-trends-v2')).layout.order[0],'semiconductors');
  change('input[data-personal-show]',{dataset:{personalShow:'semiconductors'},checked:false});
  assert.ok(!ui.render([]).includes('data-trend-topic="semiconductors" class="trend-topic-card"'));
  button({personalPin:'event-new'});
  home=ui.render([]);
  assert.match(home,/置頂追蹤事件/);

  button({trendTab:'watch'});
  let watch=ui.render([]);
  assert.match(watch,/B1 · 企業與關鍵字觀測/);
  formSubmit('示例科技','Example Tech',[]);
  watch=ui.render([]);
  assert.match(watch,/符合觀測字詞的事件/);
  assert.match(watch,/示例科技/);
  const term=JSON.parse(storage.get('daily-insight-trends-v2')).watchTerms[0];
  assert.equal(term.name,'示例科技');
  button({personalToggle:term.id});
  assert.equal(JSON.parse(storage.get('daily-insight-trends-v2')).watchTerms[0].enabled,false);
  button({personalEdit:term.id});
  assert.match(ui.render([]),/編輯企業／關鍵字/);

  button({trendDetail:'event-new'});
  let detail=ui.render([]);
  assert.match(detail,/B4 · 事件進展紀錄/);
  assert.match(detail,/官方／原始發布者資料/);
  assert.match(detail,/沒有新消息不會自動改成/);
  change('select[data-personal-status]',{dataset:{personalStatus:'event-new'},value:'已結束'});
  assert.equal(JSON.parse(storage.get('daily-insight-trends-v2')).eventStates['event-new'],'已結束');
  button({},['data-trend-close']);
  button({trendTab:'watch'});
  button({},['data-personal-backup']);
  assert.match(ui.render([]),/D3 · 資料備份與安全匯入/);
  assert.match(ui.render([]),/2 MB/);
  const existing=context.window.DailyInsightBackup.createExport(context.localStorage);
  existing.reader.read.push('new-read');
  const incoming=JSON.stringify(existing);
  change('input#trend-import-file',{files:[{size:incoming.length,text:async()=>incoming}]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.render([]),/匯入前檢查結果/);
  assert.match(ui.render([]),/略過重複/);
  button({},['data-personal-import-apply']);
  assert.equal(reloads,1);
  assert.deepEqual(JSON.parse(storage.get('daily-insight-v1.8')).read,['old-read','new-read']);
  assert.equal(JSON.parse(storage.get('daily-insight-v1.8')).quizResults.old.score,1);
  assert.equal(JSON.parse(storage.get('daily-insight-trends-v2')).watched.includes('event-old'),true);
  assert.match(fs.readFileSync('index.html','utf8'),/personal-data\.js\?v=trends3-stage6/);
  assert.match(fs.readFileSync('sw.js','utf8'),/personal-data\.js\?v=trends3-stage6/);
  console.log('Passed: stage6 live UI wiring, layout, watch terms, event status, guarded import and original records');
})().catch(e=>{console.error(e);process.exitCode=1;});});
