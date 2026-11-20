const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('preview/stage6-standalone.html', 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'standalone HTML includes inline JS');
new vm.Script(source);
assert.ok(!html.includes('<script src='), 'preview cannot load external scripts');
assert.ok(!html.includes('<link rel="stylesheet"'), 'preview cannot load external styles');
assert.match(html, /非正式網站/);

const events = {};
const elements = new Map();
function elt(id) {
  if (!elements.has(id)) elements.set(id, {
    id, innerHTML: '', checked: false,
    classList: { toggle() {} },
    prepend(node) { this.innerHTML = node.textContent + this.innerHTML; },
  });
  return elements.get(id);
}
const document = {
  getElementById: elt,
  addEventListener(event, fn) { events[event] = fn; },
  createElement() { return { className: '', textContent: '', setAttribute() {} }; },
};
vm.runInNewContext(source, { document, structuredClone, Date, Blob, URL, setTimeout, navigator: {} });

async function click({ act, tab, main, toggle } = {}) {
  const dataset = { act, tab, main, toggle };
  await events.click({ target: { closest: () => ({ dataset }) } });
}

(async () => {
  assert.match(elt('mainnav').innerHTML, /趨勢情報 3.0/);
  assert.match(elt('subnav').innerHTML, /脈絡分析/);
  assert.match(elt('main').innerHTML, /B3 · 個人情報首頁/);
  await click({ tab: 'watch' });
  assert.match(elt('main').innerHTML, /B1 · 企業與關鍵字觀測清單/);
  await events.submit({
    preventDefault() {},
    target: {
      id: 'watch-form',
      elements: {
        type: { value: 'keyword' }, topic: { value: 'ai' },
        name: { value: '測試關鍵字' }, aliases: { value: 'Test Alias' },
      },
    },
  });
  assert.match(elt('main').innerHTML, /測試關鍵字/);
  assert.match(elt('main').innerHTML, /3 項啟用/);
  await click({ act: 'backup' });
  assert.match(elt('main').innerHTML, /D3 · 匯出／匯入與保護機制/);
  await click({ act: 'sample-import' });
  assert.match(elt('main').innerHTML, /偵測 5 筆重複識別碼/);
  await click({ act: 'merge' });
  assert.match(elt('main').innerHTML, /請先勾選確認/);
  elt('approve-merge').checked = true;
  await click({ act: 'merge' });
  assert.match(elt('main').innerHTML, /合併 2 個新追蹤項目/);
  await click({ act: 'goto-timeline' });
  assert.match(elt('main').innerHTML, /B4 · 事件進展紀錄/);
  assert.match(elt('main').innerHTML, /沒有新消息不會自動標示/);
  await click({ tab: 'overview' });
  assert.match(elt('main').innerHTML, /B3 · 個人情報首頁/);
  assert.ok(!html.includes('localStorage.'), 'demo must not alter production browser storage');
  console.log('Passed: stage6 isolated preview tabs, watchlist, guarded import merge, timeline, personalization');
})().catch(err => { console.error(err); process.exitCode = 1; });
