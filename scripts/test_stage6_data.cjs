const assert=require('node:assert/strict');
const backup=require('../personal-data.js');

const storageMap=new Map([
  ['daily-insight-v1.8',JSON.stringify({read:['news-1'],saved:['saved-1'],quizResults:{'quiz-1':{score:1,total:1}}})],
  ['daily-insight-trends-v2',JSON.stringify({topics:['technology_ai'],watched:['event-old'],viewed:{'event-old':'2026-11-17T00:00:00Z'},
    reportPeriod:'30',watchTerms:[{id:'term-old',type:'company',name:'示例公司',aliases:['Example'],topics:['technology_ai'],enabled:true}],
    layout:{order:['global_finance','technology_ai'],hidden:['business_management'],pinned:['event-old']},eventStates:{'event-old':'待確認'}})]
]);
const storage={getItem:k=>storageMap.get(k)??null,setItem:(k,v)=>storageMap.set(k,v),removeItem:k=>storageMap.delete(k)};
const exported=backup.createExport(storage,new Date('2026-11-20T08:00:00Z'));
assert.equal(exported.schema_version,1);
assert.deepEqual(exported.reader.read,['news-1']);
assert.deepEqual(exported.trends.layout.order.slice(0,2),['global_finance','technology_ai']);
assert.equal(exported.trends.watchTerms.length,1);
const incoming=backup.parseImport(JSON.stringify({
  ...exported,
  reader:{read:['news-1','news-2'],saved:['saved-2'],quizResults:{'quiz-1':{score:0,total:1},'quiz-2':{score:2,total:2}}},
  trends:{...exported.trends,watched:['event-old','event-new'],watchTerms:[
    {...exported.trends.watchTerms[0],aliases:['Modified']},
    {id:'term-new',type:'keyword',name:'先進封裝',aliases:['HBM'],topics:[],enabled:true},
    {id:'term-dupe',type:'company',name:'示例公司',aliases:[],topics:[],enabled:true}
  ],layout:{...exported.trends.layout,order:['semiconductors','global_finance'],hidden:[],pinned:['event-old','event-new']},eventStates:{'event-old':'已結束','event-new':'新事件'}}
}));
const preview=backup.previewMerge(storage,incoming);
assert.equal(preview.added.read,1);
assert.equal(preview.added.quizzes,1);
assert.equal(preview.added.terms,1);
assert.equal(preview.skipped.terms,2);
assert.equal(preview.added.watched,1);
assert.equal(preview.added.pinned,1);
backup.applyImport(storage,incoming);
const reader=JSON.parse(storage.getItem('daily-insight-v1.8'));
const prefs=JSON.parse(storage.getItem('daily-insight-trends-v2'));
assert.deepEqual(reader.read,['news-1','news-2']);
assert.deepEqual(reader.saved,['saved-1','saved-2']);
assert.equal(reader.quizResults['quiz-1'].score,1,'existing quiz result is not overwritten');
assert.equal(reader.quizResults['quiz-2'].score,2);
assert.equal(prefs.watchTerms.length,2);
assert.deepEqual(prefs.watchTerms[0].aliases,['Example'],'existing term is preserved');
assert.equal(prefs.eventStates['event-old'],'待確認','manual status not overwritten');
assert.equal(prefs.eventStates['event-new'],'新事件');
assert.equal(prefs.layout.order[0],'global_finance','local dashboard order wins');
assert.deepEqual(prefs.layout.hidden,['business_management']);
assert.deepEqual(prefs.layout.pinned,['event-old','event-new']);

for (const invalid of [
  '{bad json}', JSON.stringify({...exported,schema_version:999}),
  JSON.stringify({...exported,reader:{...exported.reader,quizResults:{'__proto__':{score:1,total:1}}}}).replace('"quizResults":{}','"quizResults":{"__proto__":{"score":1,"total":1}}'),
  JSON.stringify({...exported,trends:{...exported.trends,watchTerms:[{id:'bad',type:'company',name:'A',aliases:[],topics:[],enabled:true}]}}),
  'x'.repeat(backup.MAX_FILE_SIZE+1)
]) assert.throws(()=>backup.parseImport(invalid));

const beforeReader=storage.getItem('daily-insight-v1.8');
const beforeTrends=storage.getItem('daily-insight-trends-v2');
let failOnce=true;
const failing={
  getItem:storage.getItem,removeItem:storage.removeItem,
  setItem(k,v){if(k==='daily-insight-trends-v2'&&failOnce){failOnce=false;throw Error('quota');}storage.setItem(k,v);}
};
assert.throws(()=>backup.applyImport(failing,incoming),/已嘗試回復/);
assert.equal(storage.getItem('daily-insight-v1.8'),beforeReader);
assert.equal(storage.getItem('daily-insight-trends-v2'),beforeTrends);

const legacy=new Map([['daily-insight-v1.4',JSON.stringify({saved:['legacy'],read:['legacy-read'],quizResults:{}})]]);
assert.deepEqual(backup.createExport({getItem:k=>legacy.get(k)??null}).reader.read,['legacy-read']);
assert.equal(legacy.has('daily-insight-v1.8'),false,'export never migrates or writes legacy storage');
const freshStore=new Map();
const fresh={getItem:k=>freshStore.get(k)??null,setItem:(k,v)=>freshStore.set(k,v),removeItem:k=>freshStore.delete(k)};
backup.applyImport(fresh,incoming);
const restored=JSON.parse(fresh.getItem('daily-insight-trends-v2'));
assert.equal(restored.layout.order[0],'semiconductors','new device restores source layout');
assert.deepEqual(restored.layout.hidden,[]);
assert.deepEqual(restored.topics,incoming.trends.topics,'new device restores source topic selection');
assert.equal(restored.reportPeriod,incoming.trends.reportPeriod);
console.log('Passed: stage6 versioned JSON, preview counts, additive merge, collisions, malicious input and rollback');
