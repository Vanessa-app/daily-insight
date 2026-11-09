const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('app.js','utf8').split('\nrefreshContent();')[0];
const context={URL,Intl,Date,Map,Set,console,localStorage:{getItem:()=>null,setItem:()=>{}},document:{addEventListener:()=>{}},window:{}};
vm.createContext(context);vm.runInContext(code,context);
const run=s=>vm.runInContext(s,context);
const curated=JSON.parse(fs.readFileSync('data/taiwan.json')).items;
const catalog=JSON.parse(fs.readFileSync('data/catalog.json')).items;
const news=JSON.parse(fs.readFileSync('data/news.json')).items;
context.fixture=[...curated,...catalog,...news];
run('state.news=mergeArticles(fixture,[]);state.read=[]');
const counts=run(`({news:readingQueue(state.news,'news').length,knowledge:readingQueue(state.news,'knowledge').length})`);
assert.ok(run(`readingQueue(state.news,'news').every(a=>Date.parse(a.published_at)>=Date.now()-7*86400000)`));
assert.ok(counts.news>100);assert.ok(counts.knowledge>=40);
const first=run(`readingQueue(state.news,'knowledge')[0].url`);context.first=first;
run(`state.read.push(first)`);
assert.ok(!run(`readingQueue(state.news,'knowledge').some(a=>a.url===first)`));
assert.equal(run(`readingQueue(state.news,'knowledge').length`),counts.knowledge-1);
assert.equal(run(`readingQueue(state.news,'news').length`),counts.news);
assert.equal(run(`new Set(readingQueue(state.news,'knowledge').slice(0,9).map(topicOf)).size`),9);
const before=run(`readingQueue(state.news,'news').slice(0,12).map(a=>a.url)`);context.before=before;
run(`state.read.push(before[0])`);
const after=run(`readingQueue(state.news,'news').slice(0,12).map(a=>a.url)`);
assert.equal(after.length,12);assert.ok(!after.includes(before[0]));assert.ok(after.some(u=>!before.includes(u)));
assert.ok(run(`explore(state.news).content.includes('推薦未讀')`));
run(`state.page='knowledge'`);
assert.ok(run(`explore(state.news).content.includes('目前推薦 9 篇')`));
run(`state.shelf='library'`);assert.ok(run(`explore(state.news).content.includes('保留全部文章')`));
assert.equal(run(`quizData({quiz_origin:'source_grounded_recall',quiz:[{}]})`),null);
assert.equal(run(`safeUrl('javascript:alert(1)')`),null);
for(const a of catalog.filter(a=>a.kind==='knowledge')){
 context.current=a;
 assert.ok(run('quizData(current)'),a.title+' lacks grounded recall');
 const html=run('reader(current)');
 assert.ok(html.includes('姓名標示與版本'));assert.ok(html.includes('原站圖表'));assert.ok(!html.includes('已核准重製的官方全文'));
}
for(const a of catalog.filter(a=>a.content_scope==='media_headline')){
 context.current=a;
 const html=run('article(current)');assert.ok(html.includes('來源閱讀'));assert.ok(!html.includes('開始閱讀'));
}
console.log('Passed: independent unread queues, automatic refill, topic diversity, library retention, attribution, safe links and grounded quizzes.',counts);
