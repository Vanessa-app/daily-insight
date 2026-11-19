/* Daily Insight 2.0: independent, source-grounded trend intelligence center. */
(() => {
  'use strict';
  const PREF_KEY = 'daily-insight-trends-v2';
  const TOPIC_COLORS = ['#2b695b', '#9a6942', '#366586', '#6c5989', '#a24e4c', '#747f42'];
  const TOPIC_ICON = ['✳', '▦', '◈', '◇', '◎', '✦'];
  const DEFAULT_TOPICS = ['technology_ai', 'semiconductors', 'global_finance', 'business_management', 'politics_policy', 'consumer_lifestyle'];
  const TOPIC_FALLBACK = [
    {id:'technology_ai',label:'科技與 AI'}, {id:'semiconductors',label:'半導體產業'},
    {id:'global_finance',label:'全球經濟與金融'}, {id:'business_management',label:'企業經營與管理'},
    {id:'politics_policy',label:'國際政治與政策'}, {id:'consumer_lifestyle',label:'生活與消費趨勢'}
  ];
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };
  const formatDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '時間不明' : new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d); };
  const formatDay = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '日期不明' : new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); };
  const defaultPrefs = () => ({topics:[...DEFAULT_TOPICS], watched:[], viewed:{}, reportPeriod:'7', lastVisit:null});
  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return {
        ...defaultPrefs(), ...saved,
        topics: Array.isArray(saved.topics) ? saved.topics.filter(x => DEFAULT_TOPICS.includes(x)) : [...DEFAULT_TOPICS],
        watched: Array.isArray(saved.watched) ? saved.watched.filter(x => typeof x === 'string') : [],
        viewed: saved.viewed && typeof saved.viewed === 'object' && !Array.isArray(saved.viewed) ? saved.viewed : {}
      };
    } catch { return defaultPrefs(); }
  }
  const preferences = readPrefs();
  let data = null, history = null, loading = false, error = '', currentTab = 'overview', selectedTopic = 'all', selectedEvent = null, showOnlyWatched = false;
  let announcement = '', initialized = false, lastFetchedAt = 0;
  function persist() { try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { announcement = '瀏覽器未允許儲存偏好，設定可能無法保留。'; } }
  function repaint() { if (typeof render === 'function' && document.querySelector('[data-page="trends"]')?.classList.contains('active')) render(); }
  function topics() { return data?.topics?.length ? data.topics : TOPIC_FALLBACK; }
  function topicName(id) { return topics().find(x => x.id === id)?.label || '未分類'; }
  function topicIndex(id) { return Math.max(0, DEFAULT_TOPICS.indexOf(id)); }
  function eventList() { return Array.isArray(data?.events) ? data.events : []; }
  function selectedEvents() {
    return eventList().filter(e => (selectedTopic === 'all' || e.primary_topic === selectedTopic || e.related_topics?.includes(selectedTopic)) &&
      (!showOnlyWatched || preferences.watched.includes(e.id)) && preferences.topics.includes(e.primary_topic));
  }
  function newUpdates() { return eventList().filter(e => preferences.watched.includes(e.id) && (!preferences.viewed[e.id] || new Date(e.updated_at) > new Date(preferences.viewed[e.id]))); }
  function importance(score) { return score >= 8 ? '高度關注' : score >= 5 ? '值得注意' : '一般觀察'; }
  function badge(e) { return `<span class="trend-impact ${e.importance_score >= 8 ? 'high' : e.importance_score >= 5 ? 'mid' : ''}">${importance(e.importance_score)}</span>`; }
  function externalLink(article) {
    const url = safeUrl(article.url);
    if (!url) return '';
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="trend-source-link">${escapeHtml(article.source || '原始來源')}：${escapeHtml(article.title)} <span aria-hidden="true">↗</span></a>`;
  }
  async function fetchJson(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function refresh() {
    if (loading) return;
    loading = true; error = '';
    try {
      const results = await Promise.allSettled([fetchJson('./data/trends.json'),fetchJson('./data/trend-history.json')]);
      const fresh = results[0].status === 'fulfilled' ? results[0].value : null;
      if (fresh && fresh.schema_version === 1 && Array.isArray(fresh.events) && Array.isArray(fresh.topics)) data = fresh;
      else if (!data) error = '趨勢資料暫時無法讀取；新聞與知識分頁仍可正常使用。';
      const past = results[1].status === 'fulfilled' ? results[1].value : null;
      if (past && past.schema_version === 1 && Array.isArray(past.days)) history = past;
    } catch { if (!data) error = '趨勢資料無法使用。'; }
    lastFetchedAt = Date.now();
    loading = false; repaint();
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    refresh();
    window.addEventListener('online', () => { if (data) refresh(); });
  }
  function header() {
    const alerts = newUpdates().length;
    return `<section class="trend-hero"><div><p class="trend-eyebrow">DAILY INSIGHT 2.0 · TREND INTELLIGENCE</p><h2>智慧趨勢情報中心<span class="trend-hero-star"> ✳</span></h2><p>從日常新聞看見變化脈絡，六大領域同步掌握。所有事件均可回溯來源。</p></div><div class="trend-hero-meta"><span>情報更新</span><strong>${data ? formatDate(data.generated_at) : '準備中'}</strong><small>既有資料規則式整理，非即時 AI 查證</small></div></section>
      <div class="trend-tabs" role="group" aria-label="智慧趨勢功能">
      ${[['overview','趨勢總覽'],['deep','脈絡分析'],['watch','我的關注'],['reports','週月報告'],['network','主題關聯']].map(([id,label])=>`<button type="button" class="trend-tab ${currentTab === id ? 'active' : ''}" data-trend-tab="${id}" aria-pressed="${currentTab === id}">${label}${id === 'watch' && alerts ? `<b class="trend-dot">${alerts}</b>` : ''}</button>`).join('')}</div>`;
  }
  function topicFilters() {
    return `<div class="trend-topic-filters" role="group" aria-label="篩選主題"><button type="button" class="trend-chip ${selectedTopic==='all'?'active':''}" data-trend-topic="all" aria-pressed="${selectedTopic==='all'}">全部主題</button>${topics().map((t,i)=>`<button type="button" class="trend-chip ${selectedTopic===t.id?'active':''}" data-trend-topic="${escapeHtml(t.id)}" aria-pressed="${selectedTopic===t.id}"><span style="color:${TOPIC_COLORS[i]}">${TOPIC_ICON[i]}</span> ${escapeHtml(t.label)}</button>`).join('')}</div>`;
  }
  function topicCards() {
    const counts = Object.fromEntries(topics().map(t=>[t.id,eventList().filter(e=>e.primary_topic===t.id).length]));
    return `<div class="trend-topic-grid">${topics().map((t,i)=>`<button type="button" class="trend-topic-card" data-trend-topic="${escapeHtml(t.id)}"><span class="trend-topic-symbol" style="background:${TOPIC_COLORS[i]}17;color:${TOPIC_COLORS[i]}">${TOPIC_ICON[i]}</span><span>${escapeHtml(t.label)}</span><strong>${counts[t.id]||0} <small>個事件</small></strong></button>`).join('')}</div>`;
  }
  function eventCard(e, compact=false) {
    const watched = preferences.watched.includes(e.id);
    const unseen = newUpdates().some(x=>x.id===e.id);
    return `<article class="trend-event-card ${compact?'compact':''}"><div class="trend-event-top"><span class="trend-topic-label" style="color:${TOPIC_COLORS[topicIndex(e.primary_topic)]}">${TOPIC_ICON[topicIndex(e.primary_topic)]} ${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}</div>
      <h3><button type="button" data-trend-detail="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></h3>
      <p>已收錄 ${e.articles?.length || 0} 篇關聯報導，來自 ${e.source_count || 0} 個來源；點開可查看事件時間線與資料依據。</p>
      <div class="trend-event-bottom"><span>${formatDate(e.updated_at)} 更新 ${unseen?'<b class="trend-unread">有新進展</b>':''}</span><div><button type="button" data-trend-watch="${escapeHtml(e.id)}" aria-pressed="${watched}" class="trend-text-btn">${watched?'★ 已關注':'☆ 關注'}</button><button type="button" class="trend-text-btn" data-trend-detail="${escapeHtml(e.id)}">檢視脈絡</button></div></div></article>`;
  }
  function overview() {
    const filtered = selectedEvents();
    const featured = selectedTopic==='all'
      ? topics().map(t=>filtered.find(e=>e.primary_topic===t.id)).filter(Boolean)
      : [];
    const top = [...new Map([...featured,...filtered].map(e=>[e.id,e])).values()].slice(0,12);
    return `<section class="trend-overview"><div class="trend-section-title"><h3>六大情報領域</h3><span>主題為規則式分類，可回溯原文</span></div>${topicCards()}
      <div class="trend-section-title"><h3>重要事件追蹤</h3><span>按重要程度與近期資料整理</span></div>${topicFilters()}
      <div class="trend-event-list">${top.length ? top.map(e=>eventCard(e)).join('') : '<div class="empty">此主題目前沒有符合條件的事件。請切換其他主題。</div>'}</div>
      ${filtered.length>12?`<p class="trend-footnote">顯示 ${top.length} / ${filtered.length} 個事件；更多內容可至「脈絡分析」查看。</p>`:''}
      ${methodNotice()}</section>`;
  }
  function methodNotice() {
    return '<p class="trend-footnote">重要性分數依主題符合度、標題訊號、時效與來源數量計算，不等於事實可信度。多家媒體引用同一資訊，亦不代表獨立證實。自動分類與文字連結可能有誤，請以原始來源為準。</p>';
  }
  function articleMatches(e, news) {
    const present = new Map(news.map(a=>[a.url,a]));
    return (e.articles||[]).map(a=>({a, readable:present.has(a.url)}));
  }
  function detail(e, news) {
    const watched = preferences.watched.includes(e.id);
    const sorted = [...(e.articles||[])].sort((a,b)=>new Date(a.published_at)-new Date(b.published_at));
    const reading = articleMatches(e,news);
    return `<section class="trend-detail"><button type="button" class="trend-back" data-trend-close>← 返回${currentTab==='deep'?'脈絡分析':'情報總覽'}</button>
      <div class="trend-detail-heading"><span class="trend-topic-label">${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}<h3>${escapeHtml(e.title)}</h3><div class="trend-detail-meta">首次資料 ${formatDate(e.first_seen_at)}　最近更新 ${formatDate(e.updated_at)}　${e.source_count} 個來源</div><button type="button" class="btn" data-trend-watch="${escapeHtml(e.id)}">${watched?'★ 取消關注':'☆ 加入我的關注'}</button></div>
      <div class="trend-detail-grid"><section class="trend-detail-panel"><h4>已知資訊及證據</h4><p>目前索引的來源標題如下。這些是來源的報導主張，並非本站已獨立核實的結論。</p><ul class="trend-evidence">${reading.map(({a,readable})=>`<li><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.source)} · ${formatDate(a.published_at)}</small></div><div class="trend-inline-actions">${readable?`<button type="button" class="trend-text-btn" data-open="${escapeHtml(a.url)}">站內閱讀</button>`:''}${externalLink(a)}</div></li>`).join('')}</ul></section>
      <section class="trend-detail-panel"><h4>事件發展時間線</h4><ol class="trend-timeline">${sorted.map(a=>`<li><time>${formatDate(a.published_at)}</time><span>${escapeHtml(a.title)}</span><small>${escapeHtml(a.source)}</small></li>`).join('')}</ol></section>
      <section class="trend-detail-panel"><h4>觀察方向</h4><p>${escapeHtml(e.watchpoint || '持續追蹤原始來源後續資料。')}</p><p class="trend-caution">這是主題觀察提示，不是個別事件的已證實影響，也不是對未來的預測。</p><h4>分類與排序依據</h4><ul class="trend-small-list"><li>主題符合度：${Number(e.importance_factors?.topical||0)} / 3</li><li>事件影響用語：${Number(e.importance_factors?.impact||0)} / 3</li><li>更新時效：${Number(e.importance_factors?.recency||0)} / 2</li><li>來源數量：${Number(e.importance_factors?.sources||0)} / 2</li></ul></section>
      <section class="trend-detail-panel"><h4>關聯知識</h4>${relatedKnowledge(e,news)}<p class="trend-caution">僅提供背景延伸閱讀，並非事件已完成事實核查。</p></section></div></section>`;
  }
  function relatedKnowledge(e,news) {
    const categories = {technology_ai:['科技與工程','AI與科技'],semiconductors:['科技與工程','AI與科技'],global_finance:['商業與經濟'],business_management:['商業與經濟','心理學與人類行為'],politics_policy:['社會與公共政策','國際與全球趨勢'],consumer_lifestyle:['日常生活與實用技能','醫療與健康']};
    const matching = news.filter(a=>a.kind==='knowledge' && categories[e.primary_topic]?.includes(a.category)).slice(0,4);
    return matching.length?`<ul class="trend-related">${matching.map(a=>`<li><button type="button" data-open="${escapeHtml(a.url)}">${escapeHtml(a.title)}</button><small>${escapeHtml(a.category)}</small></li>`).join('')}</ul>`:'<p>目前尚無可直接連結的背景知識文章。</p>';
  }
  function deepAnalysis() {
    const filtered = selectedEvents();
    return `<section class="trend-overview"><div class="trend-section-title"><h3>事件脈絡與來源檢視</h3><span>${filtered.length} 個事件</span></div>${topicFilters()}<p class="trend-muted">選取事件以查看原始報導、時間線、排序依據與關聯知識；不將來源標題視為獨立查核結論。</p><div class="trend-event-list">${filtered.length ? filtered.slice(0,48).map(e=>eventCard(e,true)).join('') : '<div class="empty">目前沒有符合條件的事件。</div>'}</div></section>`;
  }
  function watch() {
    const watched = eventList().filter(e=>preferences.watched.includes(e.id));
    const updates = newUpdates();
    return `<section class="trend-watch"><div class="trend-section-title"><h3>我的情報關注</h3><span>設定僅儲存於目前的瀏覽器</span></div><div class="trend-summary-cards"><div><strong>${watched.length}</strong><span>持續關注</span></div><div><strong>${updates.length}</strong><span>尚未查看的更新</span></div></div>
      <section class="trend-detail-panel"><h4>關注的六大領域</h4><p class="trend-muted">取消勾選的主題將暫時從情報首頁及脈絡分析篩選中隱藏，不會刪除資料。</p><div class="trend-preference-grid">${topics().map(t=>`<label><input type="checkbox" data-trend-pref="${escapeHtml(t.id)}" ${preferences.topics.includes(t.id)?'checked':''}> ${escapeHtml(t.label)}</label>`).join('')}</div></section>
      <div class="trend-section-title"><h3>站內更新提醒</h3><span>非推播、Email 或手機通知</span></div>${updates.length?`<div class="trend-event-list">${updates.map(e=>eventCard(e,true)).join('')}</div>`:'<div class="empty">目前沒有未讀的關注更新。關注事件後，如事件資料更新會在這裡標示。</div>'}
      <div class="trend-section-title"><h3>已關注事件</h3></div>${watched.length?`<div class="trend-event-list">${watched.map(e=>eventCard(e,true)).join('')}</div>`:'<div class="empty">尚未關注事件。到「趨勢總覽」點選 ☆ 關注，即可建立清單。</div>'}
      <p class="trend-footnote">本階段採免費的站內提醒機制；只有開啟網站取得最新資料時才會更新提示，不會在背景向裝置發送訊息，也不會讀取其他裝置的偏好。</p></section>`;
  }
  function historyDays(period) {
    const source = Array.isArray(history?.days)?history.days:[];
    const limit = new Date();limit.setUTCHours(0,0,0,0);limit.setUTCDate(limit.getUTCDate()-(Number(period)-1));
    return source.filter(x=>Date.parse(x.date+'T00:00:00Z') >= limit.getTime()).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function reportData(period) {
    const days = historyDays(period);
    const sums = Object.fromEntries(topics().map(t=>[t.id,0]));
    days.forEach(day=>topics().forEach(t=>{sums[t.id]+=Number(day.topic_counts?.[t.id]||0)}));
    const total = Object.values(sums).reduce((a,b)=>a+b,0);
    const leading = topics().map(t=>({...t,value:sums[t.id]})).sort((a,b)=>b.value-a.value);
    return {days,total,leading,coverage:days.length,period:Number(period)};
  }
  function reportText() {
    const r = reportData(preferences.reportPeriod);
    return `Daily Insight 2.0｜${r.period} 天趨勢回顧\n資料涵蓋 ${r.coverage} / ${r.period} 天；每日事件存量，非新增事件件數。\n` + r.leading.map(x=>`${x.label}：${x.value}（各日事件數加總）`).join('\n') + '\n此為規則式分類摘要；原始內容與來源請回網站核對。';
  }
  function reports() {
    const r = reportData(preferences.reportPeriod);
    const max = Math.max(1,...r.leading.map(x=>x.value));
    const first = r.days[0]?.date, last = r.days[r.days.length-1]?.date;
    return `<section class="trend-reports"><div class="trend-section-title"><h3>情報週報與月報</h3><span>基於已累積的每日趨勢快照</span></div><div class="trend-report-controls"><div role="group" aria-label="報告期間"><button type="button" class="trend-chip ${preferences.reportPeriod==='7'?'active':''}" data-trend-period="7">最近 7 天</button><button type="button" class="trend-chip ${preferences.reportPeriod==='30'?'active':''}" data-trend-period="30">最近 30 天</button></div><button type="button" class="btn" data-trend-copy>複製報告摘要</button></div>
      <div class="trend-summary-cards"><div><strong>${r.coverage} / ${r.period}</strong><span>可用資料天數</span></div><div><strong>${r.days.length?r.days[r.days.length-1].total_events:0}</strong><span>最近快照事件數</span></div><div><strong>${escapeHtml(r.leading[0]?.label||'無資料')}</strong><span>累積事件數最多的主題</span></div></div>
      <section class="trend-detail-panel"><h4>主題活躍度</h4><p class="trend-muted">各日索引中的事件數加總，同一事件可能跨日出現；不等同獨立事件增加量，也不能用來預測未來。</p><div class="trend-bars">${r.leading.map((x,i)=>`<div class="trend-bar-row"><span>${escapeHtml(x.label)}</span><div class="trend-bar-rail"><i style="width:${Math.round(x.value/max*100)}%;background:${TOPIC_COLORS[topicIndex(x.id)]}"></i></div><strong>${x.value}</strong></div>`).join('')}</div></section>
      <section class="trend-detail-panel"><h4>歷史資料完整度</h4><p>${first?`${escapeHtml(first)} 至 ${escapeHtml(last)}`:'目前尚無每日快照。'}；已保存 ${r.coverage} 天。</p>${r.coverage<r.period?'<div class="trend-caution">資料尚未涵蓋整個選定期間，因此不提供完整週／月增減率與虛構的歷史比較。</div>':''}</section>
      ${methodNotice()}</section>`;
  }
  function network() {
    const weights = new Map();
    for(const e of eventList()) for(const related of e.related_topics||[]) {
      if (related===e.primary_topic || !DEFAULT_TOPICS.includes(related)) continue;
      const pair = [e.primary_topic,related].sort().join('|');
      weights.set(pair,(weights.get(pair)||0)+1);
    }
    const links = [...weights.entries()].map(([pair,count])=>({nodes:pair.split('|'),count})).sort((a,b)=>b.count-a.count).slice(0,12);
    return `<section class="trend-network"><div class="trend-section-title"><h3>跨領域知識關聯</h3><span>依事件的多重主題標籤產生</span></div><p class="trend-muted">例如半導體與 AI、金融與政策同時出現在事件標籤中時，建立主題關聯。這不是因果關係或人工專家知識圖譜。</p><div class="trend-network-topics">${topics().map((t,i)=>`<button type="button" data-trend-topic="${escapeHtml(t.id)}" class="trend-network-node" style="--node:${TOPIC_COLORS[i]}">${TOPIC_ICON[i]} ${escapeHtml(t.label)}</button>`).join('')}</div>
      <section class="trend-detail-panel"><h4>主要跨主題連結</h4>${links.length?`<ul class="trend-links">${links.map(l=>`<li><span>${escapeHtml(topicName(l.nodes[0]))}</span><span class="trend-link-line"></span><span>${escapeHtml(topicName(l.nodes[1]))}</span><strong>${l.count} 事件</strong></li>`).join('')}</ul>`:'<div class="empty">目前沒有足夠的跨主題資料。</div>'}</section><p class="trend-footnote">點選上方主題，可切換至事件脈絡分析進一步閱讀來源。</p></section>`;
  }
  function renderPage(news) {
    initialize();
    if (initialized && !loading && Date.now() - lastFetchedAt > 5*60*1000) refresh();
    if (!data) return header() + `<div class="notice">${escapeHtml(error || (loading?'正在建立趨勢情報畫面…':'尚未取得趨勢資料。'))}<button type="button" class="btn" data-trend-refresh>重新讀取</button></div>`;
    const event = selectedEvent && eventList().find(e=>e.id===selectedEvent);
    if (event) return header()+detail(event,news);
    return header() + (currentTab==='deep'?deepAnalysis():currentTab==='watch'?watch():currentTab==='reports'?reports():currentTab==='network'?network():overview()) + (announcement?`<p class="trend-announcement" role="status">${escapeHtml(announcement)}</p>`:'');
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button'); if(!b) return;
    if(b.dataset.trendTab){currentTab=b.dataset.trendTab;selectedEvent=null;selectedTopic='all';repaint();}
    else if(b.dataset.trendTopic){selectedTopic=b.dataset.trendTopic;currentTab=currentTab==='network'?'deep':currentTab;selectedEvent=null;repaint();}
    else if(b.dataset.trendDetail){selectedEvent=b.dataset.trendDetail;preferences.viewed[selectedEvent]=new Date().toISOString();persist();repaint();window.scrollTo(0,0);}
    else if(b.hasAttribute('data-trend-close')){selectedEvent=null;repaint();window.scrollTo(0,0);}
    else if(b.dataset.trendWatch){const id=b.dataset.trendWatch;preferences.watched=preferences.watched.includes(id)?preferences.watched.filter(x=>x!==id):[...preferences.watched,id];persist();repaint();}
    else if(b.dataset.trendPeriod){preferences.reportPeriod=b.dataset.trendPeriod;persist();repaint();}
    else if(b.hasAttribute('data-trend-copy')){const value=reportText();if(navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(()=>{announcement='報告摘要已複製。';repaint();}).catch(()=>{announcement='無法複製，請確認瀏覽器權限。';repaint();});else {announcement='此瀏覽器不支援直接複製。';repaint();}}
    else if(b.hasAttribute('data-trend-refresh'))refresh();
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(!input.matches('input[data-trend-pref]'))return;
    const id=input.dataset.trendPref;
    preferences.topics=input.checked?[...new Set([...preferences.topics,id])]:preferences.topics.filter(x=>x!==id);
    persist();repaint();
  });
  window.DailyTrends = {render:renderPage,refresh,getData:()=>data,getPreferences:()=>preferences};
})();
