const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const m=require('../trend-metrics.js');
const now=new Date('2026-11-20T01:00:00Z'), end='2026-11-19';
const history={schema_version:1,days:Array.from({length:180},(_,i)=>({date:m.shift(end,i-179),observation_version:1,closed:true,baseline:false,observed_at:m.shift(end,i-179)+'T10:00:00Z',event_stats:[{id:'old',aliases:[],primary_topic:'technology_ai',new_article_keys:Array.from({length:i>=173?4:1},(_,j)=>`https://example.org/${i}/${j}`)}]}))};
const merged={id:'new',aliases:['old'],title:'示範事件'};
for(const n of [7,30,90]){
  const r=m.compare(history,n,{now,event:merged});
  assert.equal(r.complete,true); assert.ok(r.warming); assert.equal(r.current.coverage,n);
}
assert.equal(m.compare(history,7,{now}).current.count,28);
const gap=structuredClone(history);gap.days.splice(-3,1);
let r=m.compare(gap,7,{now});
assert.equal(r.complete,false); assert.equal(r.percent,null); assert.ok(r.current.points.some(p=>p.count===null));
const legacy=JSON.parse(fs.readFileSync('data/trend-history.json'));
assert.equal(m.compare(legacy,7,{now}).percent,null);
const zero=structuredClone(history);zero.days.forEach((d,i)=>{if(i<173)d.event_stats[0].new_article_keys=[];});
r=m.compare(zero,7,{now});assert.equal(r.label,'前期零收錄');assert.equal(r.percent,null);assert.equal(r.warming,false);
const pending=structuredClone(history);pending.days.at(-1).closed=false;
assert.equal(m.compare(pending,7,{now}).complete,false);
pending.days.at(-1).closed=true;pending.days.push({...pending.days.at(-1),date:'2026-11-20'});
assert.equal(m.compare(pending,7,{now}).current.count,28);
assert.equal(m.localDay('2026-11-19T16:01:00Z'),'2026-11-20');
assert.equal(m.shift('2024-03-01',-1),'2024-02-29');
const baseline=structuredClone(history);baseline.days.at(-1).baseline=true;
assert.equal(m.compare(baseline,7,{now}).current.coverage,6);
const duplicate=structuredClone(history);duplicate.days.push({...duplicate.days.at(-1),observed_at:'2026-11-19T11:00:00Z'});
assert.equal(m.compare(duplicate,7,{now}).current.count,28);
const unsafe=m.panel(history,7,{now,events:[{...merged,title:'<img src=x onerror=bad()>'}]});
assert.ok(!unsafe.includes('<img src=x'));assert.ok(unsafe.includes('&lt;img'));
const html=fs.readFileSync('preview/stage8-acceptance.html','utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
assert.ok(!html.includes('localStorage'));assert.ok(!html.includes('navigator.serviceWorker.register'));
assert.ok(!html.includes('display=swap'));assert.ok(html.includes("currentTab = 'heat'"));
console.log('Passed: 7/30/90 windows, aliases, incomplete logs, zero baseline, Taiwan dates, legacy data, duplicate runs, escaping and isolated preview.');
const handlers={}, saved=new Map([['daily-insight-v1.8',JSON.stringify({read:['keep'],saved:[],quizResults:{}})]]);
const index={schema_version:1,topics:[{id:'technology_ai',label:'科技與 AI'}],events:[{...merged,primary_topic:'technology_ai',articles:[],importance_factors:{}}]};
const sandbox={console,Date,Intl,URL,AbortController,setTimeout,clearTimeout,navigator:{},
 localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
 window:{DailyTrendMetrics:m,addEventListener:()=>{},scrollTo:()=>{}},
 document:{addEventListener:(k,fn)=>handlers[k]=fn,querySelector:()=>({classList:{contains:()=>false}})},
 fetch:async p=>({ok:true,json:async()=>p.includes('history')?history:p.includes('health')?{schema_version:1,links:{}}:index})};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('trends.js','utf8'),sandbox);
const controller=sandbox.window.DailyTrends;
(async()=>{
 await controller.refresh();
 const click=dataset=>handlers.click({target:{closest:()=>({dataset,hasAttribute:()=>false})}});
 click({trendTab:'heat'});assert.ok(controller.render([]).includes('趨勢升溫分析'));
 click({heatPeriod:'90'});assert.equal(controller.getPreferences().reportPeriod,'90');
 click({trendTab:'reports'});assert.ok(controller.render([]).includes('情報週報與月報'));
 assert.ok(controller.render([]).includes('90 天'));
 assert.equal(JSON.parse(saved.get('daily-insight-v1.8')).read[0],'keep');
 click({trendDetail:'new'});click({trendPane:'heat'});
 assert.ok(controller.render([]).includes('事件收錄變化'));
 console.log('Passed: actual controller integrates trends, reports, event detail, persistent period, and preserves reader data.');
})().catch(e=>{console.error(e);process.exitCode=1;});
