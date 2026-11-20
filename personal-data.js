/* Daily Insight 3.0 stage 6 — local-only, versioned backup and additive import. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DailyInsightBackup = api;
})(typeof window !== 'undefined' ? window : null, () => {
  'use strict';
  const READER_KEY = 'daily-insight-v1.8';
  const LEGACY_READER_KEY = 'daily-insight-v1.4';
  const TRENDS_KEY = 'daily-insight-trends-v2';
  const FORMAT = 'daily-insight-personal-backup';
  const VERSION = 1;
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const TOPICS = ['technology_ai','semiconductors','global_finance','business_management','politics_policy','consumer_lifestyle'];
  const STATUSES = ['新事件','持續發展','待確認','已結束'];
  const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const safeKey = x => typeof x === 'string' && x.length <= 2048 && !['__proto__','prototype','constructor'].includes(x);
  const uniqueStrings = (xs, limit = 10000, length = 2048) => {
    if (!Array.isArray(xs) || xs.length > limit || xs.some(x => typeof x !== 'string' || !x || x.length > length)) throw new Error('備份陣列格式或筆數不符。');
    return [...new Set(xs)];
  };
  const validDate = x => typeof x === 'string' && x.length <= 40 && !Number.isNaN(Date.parse(x));
  function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (raw === null) return {};
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('瀏覽器既有資料格式有誤，已停止匯入，避免覆蓋原資料。'); }
    if (!isRecord(value)) throw new Error('瀏覽器既有資料格式有誤，已停止匯入。');
    return value;
  }
  function readerData(value) {
    if (!isRecord(value)) throw new Error('閱讀資料格式不符。');
    const quizzes = {};
    const results = value.quizResults ?? {};
    if (!isRecord(results) || Object.keys(results).length > 10000) throw new Error('測驗資料格式不符。');
    for (const [key, result] of Object.entries(results)) {
      if (!safeKey(key) || !isRecord(result)) throw new Error('測驗識別碼或資料格式不符。');
      if (!Number.isSafeInteger(result.score) || !Number.isSafeInteger(result.total) || result.score < 0 || result.total < result.score || result.total > 100) throw new Error('測驗分數格式不符。');
      if (result.answers !== undefined && (!Array.isArray(result.answers) || result.answers.length > 100 || result.answers.some(x => !Number.isSafeInteger(x) || x < 0 || x > 100))) throw new Error('測驗答案格式不符。');
      if (result.completedAt !== undefined && !validDate(result.completedAt)) throw new Error('測驗時間格式不符。');
      quizzes[key] = {score:result.score,total:result.total};
      if (result.answers !== undefined) quizzes[key].answers = [...result.answers];
      if (result.completedAt !== undefined) quizzes[key].completedAt = result.completedAt;
    }
    return {read:uniqueStrings(value.read ?? []),saved:uniqueStrings(value.saved ?? []),quizResults:quizzes};
  }
  function trendsData(value) {
    if (!isRecord(value)) throw new Error('趨勢偏好格式不符。');
    const viewed = {};
    if (!isRecord(value.viewed ?? {}) || Object.keys(value.viewed ?? {}).length > 10000) throw new Error('事件已讀時間格式不符。');
    for (const [key, date] of Object.entries(value.viewed ?? {})) {
      if (!safeKey(key) || !validDate(date)) throw new Error('事件已讀時間格式不符。');
      viewed[key] = date;
    }
    const watchTerms = value.watchTerms ?? [];
    if (!Array.isArray(watchTerms) || watchTerms.length > 500) throw new Error('企業與關鍵字觀測清單過大。');
    const ids = new Set();
    const terms = watchTerms.map(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('觀測項目 ID 格式或重複有誤。');
      ids.add(item.id);
      if (!['company','keyword'].includes(item.type) || typeof item.name !== 'string' || item.name.trim().length < 2 || item.name.length > 80 || typeof item.enabled !== 'boolean') throw new Error('觀測項目內容不符。');
      const aliases = uniqueStrings(item.aliases ?? [], 15, 80);
      const itemTopics = uniqueStrings(item.topics ?? [], 6, 40);
      if (itemTopics.some(x => !TOPICS.includes(x))) throw new Error('觀測主題不符。');
      return {id:item.id,type:item.type,name:item.name.trim(),aliases,topics:itemTopics,enabled:item.enabled};
    });
    const layout = value.layout ?? {};
    if (!isRecord(layout)) throw new Error('首頁布局格式不符。');
    const order = uniqueStrings(layout.order ?? TOPICS, 6, 40);
    const hidden = uniqueStrings(layout.hidden ?? [], 6, 40);
    const pinned = uniqueStrings(layout.pinned ?? [], 500, 2048);
    if (order.some(x => !TOPICS.includes(x)) || hidden.some(x => !TOPICS.includes(x))) throw new Error('首頁主題設定不符。');
    const statuses = {};
    if (!isRecord(value.eventStates ?? {}) || Object.keys(value.eventStates ?? {}).length > 500) throw new Error('事件進展紀錄格式不符。');
    for (const [id, status] of Object.entries(value.eventStates ?? {})) {
      if (!safeKey(id) || !STATUSES.includes(status)) throw new Error('事件進展狀態不符。');
      statuses[id] = status;
    }
    const topics = uniqueStrings(value.topics ?? TOPICS, 6, 40);
    if (topics.some(x => !TOPICS.includes(x))) throw new Error('領域偏好不符。');
    const reportPeriod = value.reportPeriod === '30' ? '30' : '7';
    return {topics,watched:uniqueStrings(value.watched ?? [],10000),viewed,reportPeriod,
      lastVisit:validDate(value.lastVisit)?value.lastVisit:null,
      watchTerms:terms,layout:{order:[...order,...TOPICS.filter(x=>!order.includes(x))],hidden,pinned},eventStates:statuses};
  }
  function readCurrent(storage) {
    const reader = storage.getItem(READER_KEY) !== null ? readJson(storage,READER_KEY) : readJson(storage,LEGACY_READER_KEY);
    return {reader:readerData(reader),trends:trendsData(readJson(storage,TRENDS_KEY))};
  }
  function createExport(storage, now = new Date()) {
    const existing = readCurrent(storage);
    return {format:FORMAT,schema_version:VERSION,exported_at:now.toISOString(),...existing};
  }
  function parseImport(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FILE_SIZE) throw new Error('請選擇 2 MB 以內的 JSON 備份檔。');
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('不是有效的 JSON 檔案。'); }
    if (!isRecord(value) || value.format !== FORMAT || value.schema_version !== VERSION || !validDate(value.exported_at)) throw new Error('檔案不是支援版本的 Daily Insight 個人備份，未匯入任何資料。');
    return {format:FORMAT,schema_version:VERSION,exported_at:value.exported_at,reader:readerData(value.reader),trends:trendsData(value.trends)};
  }
  function mergeData(existing, incoming, options = {}) {
    const union = (a,b) => [...new Set([...a,...b])];
    const quizzes = {...existing.reader.quizResults};
    for (const [key, val] of Object.entries(incoming.reader.quizResults)) if (!Object.hasOwn(quizzes,key)) quizzes[key] = val;
    const viewed = {...existing.trends.viewed};
    for (const [key, val] of Object.entries(incoming.trends.viewed)) if (!Object.hasOwn(viewed,key)) viewed[key] = val;
    const watchTerms = [...existing.trends.watchTerms];
    const identities = new Set(watchTerms.map(x=>x.type+':'+x.name.toLocaleLowerCase('zh-TW')));
    const termIds = new Set(watchTerms.map(x=>x.id));
    for (const item of incoming.trends.watchTerms) {
      const identity = item.type+':'+item.name.toLocaleLowerCase('zh-TW');
      if (!termIds.has(item.id) && !identities.has(identity)) {watchTerms.push(item);termIds.add(item.id);identities.add(identity);}
    }
    const eventStates = {...existing.trends.eventStates};
    for (const [key,status] of Object.entries(incoming.trends.eventStates)) if (!Object.hasOwn(eventStates,key)) eventStates[key] = status;
    const currentLayout = existing.trends.layout, importedLayout = incoming.trends.layout;
    return {
      reader:{read:union(existing.reader.read,incoming.reader.read),saved:union(existing.reader.saved,incoming.reader.saved),quizResults:quizzes},
      trends:{...existing.trends,topics:options.restoreTopics?incoming.trends.topics:existing.trends.topics,
        reportPeriod:options.restoreReport?incoming.trends.reportPeriod:existing.trends.reportPeriod,
        lastVisit:existing.trends.lastVisit||incoming.trends.lastVisit,
        watched:union(existing.trends.watched,incoming.trends.watched),viewed,watchTerms,
        layout:{order:options.restoreLayout?importedLayout.order:currentLayout.order,
          hidden:options.restoreLayout?importedLayout.hidden:currentLayout.hidden,
          pinned:union(currentLayout.pinned,importedLayout.pinned)},eventStates}
    };
  }
  function restoreOptions(storage) {
    const old = readJson(storage,TRENDS_KEY);
    return {restoreTopics:!Object.hasOwn(old,'topics'),restoreReport:!Object.hasOwn(old,'reportPeriod'),restoreLayout:!Object.hasOwn(old,'layout')};
  }
  function previewMerge(storage, incoming) {
    const current = readCurrent(storage), merged = mergeData(current,incoming,restoreOptions(storage));
    const counts = (value) => ({read:value.reader.read.length,saved:value.reader.saved.length,quizzes:Object.keys(value.reader.quizResults).length,
      watched:value.trends.watched.length,terms:value.trends.watchTerms.length,pinned:value.trends.layout.pinned.length,states:Object.keys(value.trends.eventStates).length});
    const original = counts(current), final = counts(merged), imported = counts(incoming);
    return {original,imported,final,added:Object.fromEntries(Object.keys(final).map(k=>[k,final[k]-original[k]])),
      skipped:Object.fromEntries(Object.keys(final).map(k=>[k,imported[k]-(final[k]-original[k])]))};
  }
  function applyImport(storage, incoming) {
    const current = readCurrent(storage), merged = mergeData(current,incoming,restoreOptions(storage));
    const prevReader = storage.getItem(READER_KEY), prevTrends = storage.getItem(TRENDS_KEY);
    try {
      storage.setItem(READER_KEY,JSON.stringify(merged.reader));
      storage.setItem(TRENDS_KEY,JSON.stringify(merged.trends));
    } catch (err) {
      try {if(prevReader===null)storage.removeItem(READER_KEY);else storage.setItem(READER_KEY,prevReader);}catch{}
      try {if(prevTrends===null)storage.removeItem(TRENDS_KEY);else storage.setItem(TRENDS_KEY,prevTrends);}catch{}
      throw new Error('瀏覽器儲存失敗，已嘗試回復原始紀錄；請保留備份並確認裝置空間。');
    }
    return merged;
  }
  return {FORMAT,VERSION,MAX_FILE_SIZE,TOPICS,STATUSES,createExport,parseImport,previewMerge,applyImport,readCurrent,readerData,trendsData};
});
