const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('app.js', 'utf8').split('\nrefreshContent();')[0];
const fixtures = ['news', 'taiwan', 'catalog'].flatMap(name =>
  JSON.parse(fs.readFileSync('data/' + name + '.json')).items);
const context = vm.createContext({
  URL, Intl, fixtures, document:{addEventListener() {}}, window:{},
  localStorage:{getItem() { return null; }}
});
vm.runInContext(code, context);
const run = script => vm.runInContext(script, context);
run('state.news = fixtures');
function layout(id) {
  context.articleId = id;
  return run('readerLayout(fixtures.find(a => a.id === articleId))');
}
const resistance = layout('wiki:3711396');
assert.ok(resistance.includes('文中術語'));
assert.ok(resistance.includes('https://www.who.int/'));
assert.ok(resistance.includes('抗生素使用及抗藥性監測報告'));
assert.ok(!resistance.includes('reader-diagram-dialog'));

const cost = layout('wiki:69319');
assert.ok(cost.includes('讀後') || cost.includes('knowledge-quiz'));
assert.equal((cost.match(/data-diagram-expand/g) || []).length, 1);
assert.ok(cost.includes('放棄「練習英文」會帶來的價值'));
assert.ok(cost.includes('沉沒成本'));
assert.ok(cost.includes('放棄的最佳選項變成「準備簡報」'));

const report = {
  id:'adi:21452', kind:'news', source:'數位產業署', title:'SEMI E187 半導體設備資安',
  url:'https://moda.gov.tw/ADI/news/latest-news/21452', published_at:'2026-11-16'
};
context.report = report;
const news = run('readerLayout(report)');
assert.ok(news.includes('前情') && news.includes('這次進展') && news.includes('接下來觀察'));
assert.ok(news.includes('https://moda.gov.tw/ADI/news/bulletin-board/19284'));
assert.ok(!run('readerLayout({...report, id:"unmatched", title:"一般科技新聞"})').includes('新聞脈絡'));
console.log('Passed: narrow topic matching, sourced supplements, reviewed figure, and omitted unsupported context.');
