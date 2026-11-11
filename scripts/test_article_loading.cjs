const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('app.js', 'utf8').split('\nrefreshContent();')[0];
const raw = 'https://raw.githubusercontent.com/Vanessa-app/daily-insight/main/data/';
const fixtures = Object.fromEntries(['news', 'taiwan', 'catalog'].map(name => [
  name, JSON.parse(fs.readFileSync('data/' + name + '.json', 'utf8'))
]));
const context = vm.createContext({
  AbortController, URL, Intl, clearTimeout,
  setTimeout: (callback, delay) => setTimeout(callback, Math.min(delay, 40)),
  localStorage: {getItem: () => null},
  document: {addEventListener: () => {}},
  window: {},
  fetch: async (url, {signal}) => {
    if (url.endsWith('catalog.json') && !url.startsWith(raw)) {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      });
    }
    const file = url.split('/').pop().replace('.json', '');
    return {ok: true, json: async () => fixtures[file]};
  }
});
vm.runInContext(code, context);
const run = script => vm.runInContext(script, context);
run('render = () => {}');

(async () => {
  const initial = run('refreshContent()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(run('refreshPending'), true);
  assert.ok(run("homepageArticles(state.news).some(a => a.kind !== 'knowledge')"));
  await initial;
  assert.equal(run('refreshPending'), false);
  assert.equal(run("articleData.get('catalog').items.length"), fixtures.catalog.items.length);

  const count = run('state.news.length');
  context.fetch = async () => ({ok:false, status:503});
  await run('refreshContent(true)');
  assert.equal(run('state.news.length'), count);
  assert.equal(run('failedData.size'), 3);
  assert.equal(run('refreshPending'), false);

  context.fetch = async () => ({ok:true, json:async () => fixtures.news});
  await run('refreshContent(true)');
  assert.equal(run('failedData.size'), 0);
  assert.equal(run('refreshPending'), false);
  console.log('Passed: partial rendering, stalled-request timeout, backup, retention and retry');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
