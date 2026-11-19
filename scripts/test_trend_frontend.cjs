const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const trends = JSON.parse(fs.readFileSync('data/trends.json', 'utf8'));
const history = JSON.parse(fs.readFileSync('data/trend-history.json', 'utf8'));
const events = {};
const saved = new Map([['daily-insight-v1.8', JSON.stringify({read:['old'],saved:['keep'],quizResults:{}})]]);
const context = {
  console, Date, Intl, URL, AbortController, setTimeout, clearTimeout,
  localStorage: {getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  window: {addEventListener:()=>{},scrollTo:()=>{}},
  document: {addEventListener:(kind,fn)=>events[kind]=fn,querySelector:()=>({classList:{contains:()=>false}})},
  navigator: {},
  fetch: async path=>({ok:true,json:async()=>path.includes('history')?history:trends})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('trends.js','utf8'),context);
const controller = context.window.DailyTrends;
assert.ok(controller);
const initial = controller.render([]);
assert.ok(initial.includes('智慧趨勢情報中心'));
setImmediate(()=>{
  const overview = controller.render([]);
  assert.ok(overview.includes('六大情報領域'));
  for (const topic of trends.topics) assert.ok(overview.includes(topic.label));
  events.click({target:{closest:()=>({dataset:{trendTab:'watch'},hasAttribute:()=>false})}});
  const watch = controller.render([]);
  assert.ok(watch.includes('站內更新提醒'));
  events.click({target:{closest:()=>({dataset:{trendTab:'reports'},hasAttribute:()=>false})}});
  assert.ok(controller.render([]).includes('情報週報與月報'));
  events.click({target:{closest:()=>({dataset:{trendTab:'network'},hasAttribute:()=>false})}});
  assert.ok(controller.render([]).includes('跨領域知識關聯'));
  const oldTabs = {scrollLeft:30,getBoundingClientRect:()=>({top:0})};
  const nextTabs = {
    scrollLeft:0, clientWidth:200, classList:{contains:()=>false},
    getBoundingClientRect:()=>({left:12,height:60}),
    nextElementSibling:{getBoundingClientRect:()=>({top:-400})},
    querySelector:()=>({getBoundingClientRect:()=>({left:190}),offsetWidth:70})
  };
  let scrolledTo;
  context.window.scrollY = 1000;
  context.window.scrollTo = (x,y)=>{scrolledTo=[x,y]};
  context.document.querySelector = ()=>nextTabs;
  const tabButton = {dataset:{trendTab:'overview'},closest:selector=>selector==='button'?tabButton:oldTabs};
  events.click({target:tabButton});
  assert.equal(nextTabs.scrollLeft, 78, 'selected mobile tab stays horizontally visible');
  assert.deepEqual(scrolledTo, [0,530], 'switching from pinned tabs returns to the content start');
  assert.deepEqual(JSON.parse(saved.get('daily-insight-v1.8')), {read:['old'],saved:['keep'],quizResults:{}});
  console.log('Passed: trends UI, sticky tab return, source separation, untouched v1.8 progress');
});
