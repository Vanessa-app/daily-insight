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
  assert.deepEqual(JSON.parse(saved.get('daily-insight-v1.8')), {read:['old'],saved:['keep'],quizResults:{}});
  console.log('Passed: trends UI, all four phases, source separation, untouched v1.8 progress');
});
