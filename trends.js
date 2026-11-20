/* Daily Insight 3.0 stages 5–6: sourced intelligence and local personalization. */
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
  const defaultLayout = () => ({order:[...DEFAULT_TOPICS],hidden:[],pinned:[]});
  const defaultPrefs = () => ({topics:[...DEFAULT_TOPICS], watched:[], viewed:{}, reportPeriod:'7', lastVisit:null,watchTerms:[],layout:defaultLayout(),eventStates:{}});
  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      return {
        ...defaultPrefs(), ...saved,
        reportPeriod: ['7','30','90'].includes(saved.reportPeriod) ? saved.reportPeriod : '7',
        topics: Array.isArray(saved.topics) ? saved.topics.filter(x => DEFAULT_TOPICS.includes(x)) : [...DEFAULT_TOPICS],
        watched: Array.isArray(saved.watched) ? saved.watched.filter(x => typeof x === 'string') : [],
        viewed: saved.viewed && typeof saved.viewed === 'object' && !Array.isArray(saved.viewed) ? saved.viewed : {},
        watchTerms: Array.isArray(saved.watchTerms) ? saved.watchTerms.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&['company','keyword'].includes(x.type)) : [],
        layout: {
          order: [...new Set([...(Array.isArray(saved.layout?.order)?saved.layout.order:[]).filter(x=>DEFAULT_TOPICS.includes(x)),...DEFAULT_TOPICS])],
          hidden: Array.isArray(saved.layout?.hidden)?saved.layout.hidden.filter(x=>DEFAULT_TOPICS.includes(x)):[],
          pinned: Array.isArray(saved.layout?.pinned)?saved.layout.pinned.filter(x=>typeof x==='string'):[]
        },
        eventStates: saved.eventStates && typeof saved.eventStates==='object' && !Array.isArray(saved.eventStates) ? saved.eventStates : {}
      };
    } catch { return defaultPrefs(); }
  }
  const preferences = readPrefs();
  let data = null, history = null, sourceHealth = null, loading = false, error = '', currentTab = 'overview', selectedTopic = 'all', selectedEvent = null, showOnlyWatched = false;
  let learningMode = 'digest';
  let detailPane = 'evidence', compareLeft = '', compareRight = '';
  let customizeLayout = false, backupOpen = false, backupDraft = null, backupError = '', editingTerm = null;
  let announcement = '', initialized = false, lastFetchedAt = 0;
  function persist() { try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { announcement = '瀏覽器未允許儲存偏好，設定可能無法保留。'; } }
  function repaint() { if (typeof render === 'function' && document.querySelector('[data-page="trends"]')?.classList.contains('active')) render(); }
  function topics() { return data?.topics?.length ? data.topics : TOPIC_FALLBACK; }
  function topicName(id) { return topics().find(x => x.id === id)?.label || '未分類'; }
  function topicIndex(id) { return Math.max(0, DEFAULT_TOPICS.indexOf(id)); }
  function eventList() { return Array.isArray(data?.events) ? data.events : []; }
  function eventIds(e) { return [e.id, ...(Array.isArray(e.aliases) ? e.aliases : [])]; }
  function isWatched(e) { return eventIds(e).some(id => preferences.watched.includes(id)); }
  function isPinned(e) { return eventIds(e).some(id=>preferences.layout.pinned.includes(id)); }
  function watchTerms() { return preferences.watchTerms.filter(x=>x.enabled!==false); }
  function termMatches(term, headline) {
    const normalized = String(headline||'').toLocaleLowerCase('zh-TW');
    return [term.name,...(term.aliases||[])].some(word=>{
      const needle=String(word||'').trim().toLocaleLowerCase('zh-TW');
      if ([...needle].length<2) return false;
      // Short Latin abbreviations must match a whole token, not a substring of another company.
      if (/^[a-z0-9-]+$/.test(needle)) return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^a-z0-9])`,'i').test(normalized);
      return normalized.includes(needle);
    });
  }
  function termMatchesEvent(term,e) {
    return (!term.topics?.length || term.topics.includes(e.primary_topic) || e.related_topics?.some(t=>term.topics.includes(t))) &&
      [e.title,...(e.articles||[]).map(a=>a.title)].some(x=>termMatches(term,x));
  }
  function matchedEvents() {
    const terms=watchTerms();
    return terms.length?eventList().filter(e=>terms.some(t=>termMatchesEvent(t,e))):[];
  }
  function seenAt(e) { return eventIds(e).map(id=>preferences.viewed[id]).filter(Boolean).sort().pop(); }
  function selectedEvents() {
    return eventList().filter(e => (selectedTopic === 'all' || e.primary_topic === selectedTopic || e.related_topics?.includes(selectedTopic)) &&
      (!showOnlyWatched || isWatched(e)) && preferences.topics.includes(e.primary_topic));
  }
  function newUpdates() { return eventList().filter(e => isWatched(e) && (!seenAt(e) || new Date(e.updated_at) > new Date(seenAt(e)))); }
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
      const results = await Promise.allSettled([fetchJson('./data/trends.json'),fetchJson('./data/trend-history.json'),fetchJson('./data/source-health.json')]);
      const fresh = results[0].status === 'fulfilled' ? results[0].value : null;
      if (fresh && fresh.schema_version === 1 && Array.isArray(fresh.events) && Array.isArray(fresh.topics)) data = fresh;
      else if (!data) error = '趨勢資料暫時無法讀取；新聞與知識分頁仍可正常使用。';
      const past = results[1].status === 'fulfilled' ? results[1].value : null;
      if (past && past.schema_version === 1 && Array.isArray(past.days)) history = past;
      const checked = results[2].status === 'fulfilled' ? results[2].value : null;
      if (checked && checked.schema_version === 1 && checked.links && typeof checked.links === 'object') sourceHealth = checked;
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
    return `<section class="trend-hero"><div><p class="trend-eyebrow">DAILY INSIGHT 3.0 · SOURCE INTELLIGENCE</p><h2>智慧趨勢情報中心<span class="trend-hero-star"> ✳</span></h2><p>從日常新聞看見變化脈絡，六大領域同步掌握。整合來源並比對報導差異，所有事件皆可回溯原文。</p></div><div class="trend-hero-meta"><span>情報更新</span><strong>${data ? formatDate(data.generated_at) : '準備中'}</strong><small>規則式來源對照，非 AI 事實查核</small></div></section>
      <div class="trend-tabs" role="group" aria-label="智慧趨勢功能">
      ${[['overview','趨勢總覽'],['heat','趨勢升溫'],['progress','事件進展'],['backup','資料備份'],['learning','閱讀與複習'],['deep','脈絡分析'],['watch','我的關注'],['reports','週月報告'],['network','主題關聯']].map(([id,label])=>`<button type="button" class="trend-tab ${currentTab === id ? 'active' : ''}" data-trend-tab="${id}" aria-pressed="${currentTab === id}">${label}${id === 'watch' && alerts ? `<b class="trend-dot">${alerts}</b>` : ''}</button>`).join('')}</div>`;
  }
  function topicFilters() {
    return `<div class="trend-topic-filters" role="group" aria-label="篩選主題"><button type="button" class="trend-chip ${selectedTopic==='all'?'active':''}" data-trend-topic="all" aria-pressed="${selectedTopic==='all'}">全部主題</button>${topics().map((t,i)=>`<button type="button" class="trend-chip ${selectedTopic===t.id?'active':''}" data-trend-topic="${escapeHtml(t.id)}" aria-pressed="${selectedTopic===t.id}"><span style="color:${TOPIC_COLORS[i]}">${TOPIC_ICON[i]}</span> ${escapeHtml(t.label)}</button>`).join('')}</div>`;
  }
  function topicCards() {
    const counts = Object.fromEntries(topics().map(t=>[t.id,eventList().filter(e=>e.primary_topic===t.id).length]));
    return `<div class="trend-topic-grid">${preferences.layout.order.filter(id=>!preferences.layout.hidden.includes(id)).map(id=>{
      const t=topics().find(x=>x.id===id);if(!t)return '';
      const i=topicIndex(id);return `<button type="button" class="trend-topic-card" data-trend-topic="${escapeHtml(t.id)}"><span class="trend-topic-symbol" style="background:${TOPIC_COLORS[i]}17;color:${TOPIC_COLORS[i]}">${TOPIC_ICON[i]}</span><span>${escapeHtml(t.label)}</span><strong>${counts[t.id]||0} <small>個事件</small></strong></button>`;
    }).join('')||'<div class="empty">目前已隱藏所有領域，請透過「自訂首頁」重新顯示。</div>'}</div>`;
  }
  function eventCard(e, compact=false) {
    const watched = isWatched(e);
    const unseen = newUpdates().some(x=>x.id===e.id);
    const firstHand = (e.articles||[]).filter(x=>x.source_type==='official').length;
    return `<article class="trend-event-card ${compact?'compact':''}"><div class="trend-event-top"><span class="trend-topic-label" style="color:${TOPIC_COLORS[topicIndex(e.primary_topic)]}">${TOPIC_ICON[topicIndex(e.primary_topic)]} ${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}</div>
      <h3><button type="button" data-trend-detail="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></h3>
      <p>已整合 ${e.articles?.length || 0} 篇相關報導、${e.source_count || 0} 個來源${firstHand?`；包含 ${firstHand} 篇官方來源`:''}。可查看報導主張、來源差異與檢查結果。</p>
      <div class="trend-event-bottom"><span>${formatDate(e.updated_at)} 更新 ${unseen?'<b class="trend-unread">有新進展</b>':''}</span><div><button type="button" data-personal-pin="${escapeHtml(e.id)}" aria-pressed="${isPinned(e)}" class="trend-text-btn">${isPinned(e)?'◆ 已置頂':'◇ 置頂'}</button><button type="button" data-trend-watch="${escapeHtml(e.id)}" aria-pressed="${watched}" class="trend-text-btn">${watched?'★ 已關注':'☆ 關注'}</button><button type="button" class="trend-text-btn" data-trend-detail="${escapeHtml(e.id)}">檢視脈絡</button><button type="button" class="trend-text-btn trend-progress-link" data-trend-progress="${escapeHtml(e.id)}">進展紀錄 →</button><button type="button" class="trend-text-btn" data-trend-importance="${escapeHtml(e.id)}">為什麼重要</button></div></div></article>`;
  }
  function overview() {
    const filtered = selectedEvents().filter(e=>selectedTopic!=='all'||!preferences.layout.hidden.includes(e.primary_topic));
    const featured = selectedTopic==='all'
      ? preferences.layout.order.filter(id=>!preferences.layout.hidden.includes(id)).map(id=>filtered.find(e=>e.primary_topic===id)).filter(Boolean)
      : [];
    const top = [...new Map([...featured,...filtered].map(e=>[e.id,e])).values()].slice(0,12);
    const pinned=eventList().filter(isPinned);
    return `<section class="trend-overview"><div class="trend-section-title"><h3>B3 · 個人情報首頁</h3><button type="button" class="btn" data-personal-customize>${customizeLayout?'完成設定':'自訂首頁'}</button></div>
      <p class="trend-muted">保留原有六大領域與事件索引，依你的排序、隱藏及置頂設定顯示。設定只保存在目前瀏覽器。</p>
      ${customizeLayout?layoutControls():''}
      ${window.DailyTrendMetrics?window.DailyTrendMetrics.compact(history,eventList()):''}
      ${pinned.length?`<div class="trend-section-title"><h3>置頂追蹤事件</h3><span>${pinned.length} 個事件</span></div><div class="trend-event-list">${pinned.slice(0,6).map(e=>eventCard(e,true)).join('')}</div>`:''}
      <div class="trend-section-title"><h3>六大情報領域</h3><span>主題為規則式分類，可回溯原文</span></div>${topicCards()}
      <div class="trend-section-title"><h3>重要事件追蹤</h3><span>按重要程度與近期資料整理</span></div>${topicFilters()}
      <div class="trend-event-list">${top.length ? top.map(e=>eventCard(e)).join('') : '<div class="empty">此主題目前沒有符合條件的事件。請切換其他主題。</div>'}</div>
      ${filtered.length>12?`<p class="trend-footnote">顯示 ${top.length} / ${filtered.length} 個事件；更多內容可至「脈絡分析」查看。</p>`:''}
      ${methodNotice()}</section>`;
  }
  function layoutControls() {
    return `<section class="trend-detail-panel trend-personal-layout"><h4>B3 · 首頁模組配置</h4><p>調整優先順序，或暫時隱藏某個領域。不會刪除領域、文章或追蹤紀錄。</p>
      ${preferences.layout.order.map((id,i)=>`<div class="trend-personal-row"><label><input type="checkbox" data-personal-show="${id}" ${preferences.layout.hidden.includes(id)?'':'checked'}> ${escapeHtml(topicName(id))}</label><span class="trend-personal-actions"><button type="button" data-personal-move="${id}" data-direction="up" ${i===0?'disabled':''} aria-label="上移 ${escapeHtml(topicName(id))}">↑</button><button type="button" data-personal-move="${id}" data-direction="down" ${i===preferences.layout.order.length-1?'disabled':''} aria-label="下移 ${escapeHtml(topicName(id))}">↓</button></span></div>`).join('')}
      <button type="button" class="btn" data-personal-reset>恢復六大領域預設排列</button></section>`;
  }
  function methodNotice() {
    return '<p class="trend-footnote">事件整合、重要性分數及標題相似度採可檢查的規則式方法，不代表事實可信度。官方來源的存在、多家媒體的共同用語或連結可用，都不等於本站已獨立證實；請以原始資料核對。</p>';
  }
  function articleMatches(e, news) {
    const present = new Map(news.map(a=>[a.url,a]));
    return (e.articles||[]).map(a=>({a, readable:present.has(a.url)}));
  }
  function sourceTypeName(article) {
    return ({official:'官方／原始發布者',publisher:'發布者摘要',media:'媒體報導',other:'其他來源'})[article.source_type] || '來源類型待分類';
  }
  function accessName(article) {
    return ({licensed_full_text:'授權完整內容',excerpt:'來源摘要',headline_only:'標題索引'})[article.content_access] || '內容範圍未標示';
  }
  function linkState(article) {
    const info = sourceHealth?.links?.[article.url];
    const date = info?.checked_at ? `（檢查時間 ${formatDate(info.checked_at)}）` : '';
    if (info?.status === 'available') return `<span class="trend-link-status good">連結有回應${date}</span>`;
    if (info?.status === 'not_found') return `<span class="trend-link-status bad">伺服器回報 404／410${date}</span>`;
    if (info?.checked_at) return `<span class="trend-link-status pending">暫無法確認${date}</span>`;
    return '<span class="trend-link-status pending">尚未進行連結檢查</span>';
  }
  function evidencePanel(e, reading) {
    const official = (e.articles||[]).filter(a=>a.source_type==='official');
    const groups = Array.isArray(e.headline_groups) ? e.headline_groups : [];
    return `<section class="trend-detail-panel trend-investigation-panel"><h4>A2 · 標題主張與證據對照</h4>
      <div class="trend-proof-summary"><span class="trend-proof-pill ${official.length?'has-primary':'pending'}">${official.length?'有官方／原始發布者來源':'目前僅有媒體或其他來源'}</span><span class="trend-proof-pill pending">未經本站獨立事實查核</span></div>
      <p>以下依原始新聞標題整理共同焦點與不同表述。標題可幫助找到資訊來源，但不能單憑標題推論事實已獲證實、亦不能自動判定說法互相矛盾。</p>
      <div class="trend-claim-groups">${groups.length?groups.map((group,i)=>`<div class="trend-claim-row"><div class="trend-claim-label">${group.article_urls?.length>1?'標題表述相近':'個別報導角度'} · ${i+1}</div><strong>${escapeHtml(group.headline)}</strong><small>${group.article_urls?.length||0} 篇報導 · ${group.source_groups?.length||0} 個來源群組</small><div class="trend-claim-links">${(e.articles||[]).filter(a=>group.article_urls?.includes(a.url)).map(a=>externalLink(a)).join('')}</div></div>`).join(''):'<div class="empty">舊資料尚無標題對照索引，請直接檢視下方來源列表。</div>'}</div>
      <p class="trend-caution">「標題相近」代表文字層面的相似，不是經獨立查證的共同事實；若要確認數字、時間或因果關係，請核對各篇原始資料。</p>
      <h4>來源證據清單</h4><ul class="trend-evidence">${reading.map(({a,readable})=>`<li><div><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.source)} · ${formatDate(a.published_at)} · ${escapeHtml(sourceTypeName(a))}</small></div><div class="trend-inline-actions">${readable?`<button type="button" class="trend-text-btn" data-open="${escapeHtml(a.url)}">站內閱讀</button>`:''}${externalLink(a)}</div></li>`).join('')}</ul></section>`;
  }
  function qualityPanel(e) {
    const articles = e.articles||[];
    return `<section class="trend-detail-panel trend-investigation-panel"><h4>A4 · 來源品質檢核</h4><p>來源類型與授權範圍來自現有館藏欄位。連結狀態為定期、少量的 HTTP HEAD 回應檢查；無法連線、封鎖機器請求等情況一律標示「無法確認」，不判斷內容真偽。</p>
      <div class="trend-quality-list">${articles.map(a=>`<article class="trend-quality-item"><div><strong>${escapeHtml(a.source)}</strong><small>${escapeHtml(a.source_domain||'來源網域未明')} · ${formatDate(a.published_at)}</small></div><div class="trend-quality-badges"><span>${escapeHtml(sourceTypeName(a))}</span><span>${escapeHtml(accessName(a))}</span>${linkState(a)}</div><div class="trend-quality-link">${externalLink(a)}</div></article>`).join('')}</div>
      <p class="trend-footnote">來源檢查只測試連結是否有回應，不下載外站全文；無權重製的內容仍以標題、允許的摘要及外部連結呈現。</p></section>`;
  }
  function comparePanel(e) {
    const articles = e.articles||[];
    if (articles.length < 2) return '<section class="trend-detail-panel trend-investigation-panel"><h4>D1 · 新聞並排比較</h4><div class="empty">目前只有一篇相關報導，需至少兩篇才能比較。</div></section>';
    const left = articles.find(a=>a.url===compareLeft)||articles[0];
    const right = articles.find(a=>a.url===compareRight)||articles.find(a=>a.url!==left.url)||articles[1];
    const options = selected => articles.map((a,i)=>`<option value="${escapeHtml(a.url)}" ${a.url===selected.url?'selected':''}>${escapeHtml(a.source)} · ${i+1}</option>`).join('');
    const same = left.url === right.url;
    const column = (a,side)=>`<div class="trend-compare-column"><label for="trend-compare-${side}">${side==='left'?'左側':'右側'}來源</label><select id="trend-compare-${side}" data-trend-compare="${side}">${options(a)}</select><div class="trend-compare-content"><strong>${escapeHtml(a.title)}</strong><div class="trend-compare-meta">${escapeHtml(a.source)} · ${formatDate(a.published_at)}</div><p>${escapeHtml(sourceTypeName(a))} · ${escapeHtml(accessName(a))}</p><div>${linkState(a)}</div>${externalLink(a)}</div></div>`;
    return `<section class="trend-detail-panel trend-investigation-panel"><h4>D1 · 新聞並排比較</h4><p>選擇兩則報導比較標題、發布時間、資料類型及原文。手機版會改為上下排列，避免壓縮文字。</p><div class="trend-compare-grid">${column(left,'left')}${column(right,'right')}</div>
      <div class="trend-compare-assessment">${same?'目前選到同一篇文章，請在其中一側切換來源。':left.title===right.title?'兩篇標題完全相同；可能是轉載或共同稿源，仍須核對內文。':'兩篇標題的描述不同，這不表示其事實互相矛盾；請依原始報導核對。'}</div>
      <p class="trend-caution">來源並排功能只呈現既有索引中可合法展示的文字，並不自動產生未經證實的差異結論。</p></section>`;
  }
  function investigation(e, reading) {
    const panes = [['evidence','證據對照'],['importance','為什麼重要'],['heat','收錄變化'],['progress','事件進展'],['compare','並排比較'],['quality','來源品質']];
    return `<div class="trend-investigation"><div class="trend-pane-tabs" role="group" aria-label="事件查證功能">${panes.map(([id,label])=>`<button type="button" data-trend-pane="${id}" class="trend-pane-tab ${detailPane===id?'active':''}" aria-pressed="${detailPane===id}">${label}</button>`).join('')}</div>
      ${detailPane==='heat'?(window.DailyTrendMetrics?.panel(history,preferences.reportPeriod,{focus:e,events:[e]})||'<p>趨勢模組尚未載入。</p>'):detailPane==='importance'?(window.DailyLearning?.importanceHtml(e)||'<p>閱讀模組尚未載入。</p>'):detailPane==='progress'?progressPanel(e,[...(e.articles||[])].sort((a,b)=>new Date(a.published_at)-new Date(b.published_at))):detailPane==='quality'?qualityPanel(e):detailPane==='compare'?comparePanel(e):evidencePanel(e,reading)}</div>`;
  }
  function eventStatus(e) {
    const chosen=eventIds(e).map(id=>preferences.eventStates[id]).find(x=>['新事件','持續發展','待確認','已結束'].includes(x));
    if (chosen) return chosen;
    if ((e.articles||[]).length>1) return '持續發展';
    const elapsed=Date.now()-Date.parse(e.first_seen_at||e.updated_at);
    return elapsed>=0&&elapsed<48*3600000?'新事件':'待確認';
  }
  function progressLabel(article,index) {
    if (/更正|修正|澄清|勘誤/.test(article.title||'')) return '內容修正／澄清（標題訊號）';
    if (article.source_type==='official') return /回應|回覆|聲明/.test(article.title||'')?'官方回應（標題訊號）':'官方／原始發布者資料';
    return index===0?'初次收錄':'後續消息';
  }
  function progressPanel(e, sorted) {
    return `<section class="trend-detail-panel trend-progress-panel"><div class="trend-section-title"><h4>B4 · 事件進展紀錄</h4><span>${sorted.length} 筆來源紀錄</span></div>
      <label class="trend-personal-field">追蹤狀態 <select data-personal-status="${escapeHtml(e.id)}">${['新事件','持續發展','待確認','已結束'].map(s=>`<option value="${s}" ${eventStatus(e)===s?'selected':''}>${s}</option>`).join('')}</select></label>
      <ol class="trend-timeline">${sorted.map((a,i)=>`<li><time>${formatDate(a.published_at)}</time><strong>${escapeHtml(progressLabel(a,i))}</strong><span>${escapeHtml(a.title)}</span><small>${escapeHtml(a.source)}</small>${externalLink(a)}</li>`).join('')}</ol>
      <p class="trend-caution">進展類型依標題與來源資料規則式整理，不代表內容已獨立查證。沒有新消息不會自動改成「已結束」；狀態可由你手動調整，新的來源仍會保留。</p></section>`;
  }
  function detail(e, news) {
    const watched = isWatched(e);
    const reading = articleMatches(e,news);
    return `<section class="trend-detail"><button type="button" class="trend-back" data-trend-close>← 返回${currentTab==='deep'?'脈絡分析':currentTab==='progress'?'事件進展':currentTab==='watch'?'我的關注':'情報總覽'}</button>
      <div class="trend-detail-heading"><span class="trend-topic-label">${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}<h3>${escapeHtml(e.title)}</h3><div class="trend-detail-meta">首次資料 ${formatDate(e.first_seen_at)}　最近更新 ${formatDate(e.updated_at)}　${e.source_count} 個來源</div><button type="button" class="btn" data-trend-watch="${escapeHtml(e.id)}">${watched?'★ 取消關注':'☆ 加入我的關注'}</button></div>
      ${investigation(e,reading)}<div class="trend-detail-grid">
      <section class="trend-detail-panel"><h4>觀察方向</h4><p>${escapeHtml(e.watchpoint || '持續追蹤原始來源後續資料。')}</p><p class="trend-caution">這是主題觀察提示，不是個別事件的已證實影響，也不是對未來的預測。</p><h4>分類與排序依據</h4><ul class="trend-small-list"><li>主題符合度：${Number(e.importance_factors?.topical||0)} / 3</li><li>事件影響用語：${Number(e.importance_factors?.impact||0)} / 3</li><li>更新時效：${Number(e.importance_factors?.recency||0)} / 2</li><li>來源數量：${Number(e.importance_factors?.sources||0)} / 2</li></ul></section>
      <section class="trend-detail-panel"><h4>關聯知識</h4>${relatedKnowledge(e,news)}<p class="trend-caution">僅提供背景延伸閱讀，並非事件已完成事實核查。</p></section></div></section>`;
  }
  function relatedKnowledge(e,news) {
    const categories = {technology_ai:['科技與工程','AI與科技'],semiconductors:['科技與工程','AI與科技'],global_finance:['商業與經濟'],business_management:['商業與經濟','心理學與人類行為'],politics_policy:['社會與公共政策','國際與全球趨勢'],consumer_lifestyle:['日常生活與實用技能','醫療與健康']};
    const concepts = [
      ['人工智慧','ai','機器學習','生成式'],['資安','資訊安全','網路安全','身份驗證','身分驗證'],
      ['半導體','晶片','晶圓','積體電路','封裝'],['通膨','物價','消費者物價'],
      ['利率','央行','貨幣政策'],['匯率','外匯','貨幣'],['股票','股市','金融市場','台股'],
      ['供應鏈','產業鏈'],['氣候','環境','永續'],['消費','零售','網購','電子商務'],
      ['政治','選舉','民主','政府'],['法律','法案','法規','政策'],['心理','人力','管理']
    ];
    const related = news.filter(a=>a.kind==='knowledge' && categories[e.primary_topic]?.includes(a.category))
      .map(a=>{
        const eventTitle=e.title.toLowerCase(), articleTitle=a.title.toLowerCase();
        const matches=concepts.filter(group=>group.some(term=>eventTitle.includes(term)) && group.some(term=>articleTitle.includes(term))).length;
        const exact=articleTitle.length>=3 && eventTitle.includes(articleTitle) ? 2 : 0;
        return {a, relevance:matches+exact};
      }).filter(x=>x.relevance>0).sort((a,b)=>b.relevance-a.relevance).slice(0,3).map(x=>x.a);
    return related.length?`<ul class="trend-related">${related.map(a=>`<li><button type="button" data-open="${escapeHtml(a.url)}">${escapeHtml(a.title)}</button><small>${escapeHtml(a.category)}</small></li>`).join('')}</ul>`:'<p>目前知識館藏沒有足夠貼近此事件的專題，因此不提供可能誤導的推薦。可前往「知識」分頁探索完整館藏。</p>';
  }
  function deepAnalysis() {
    const filtered = selectedEvents();
    return `<section class="trend-overview"><div class="trend-section-title"><h3>事件脈絡與來源檢視</h3><span>${filtered.length} 個事件</span></div>${topicFilters()}<p class="trend-muted">選取事件以查看原始報導、時間線、排序依據與關聯知識；不將來源標題視為獨立查核結論。</p><div class="trend-event-list">${filtered.length ? filtered.slice(0,48).map(e=>eventCard(e,true)).join('') : '<div class="empty">目前沒有符合條件的事件。</div>'}</div></section>`;
  }
  function watchTermForm() {
    const editing=preferences.watchTerms.find(x=>x.id===editingTerm);
    return `<section class="trend-detail-panel"><h4>B1 · ${editing?'編輯':'新增'}企業／關鍵字</h4>
      <form id="trend-term-form" class="trend-personal-form">
        <label class="trend-personal-field">追蹤類型<select name="type"><option value="company" ${editing?.type==='company'?'selected':''}>企業</option><option value="keyword" ${editing?.type==='keyword'?'selected':''}>關鍵字</option></select></label>
        <label class="trend-personal-field">名稱<input name="name" type="text" required minlength="2" maxlength="80" value="${escapeHtml(editing?.name||'')}" placeholder="例如：先進封裝"></label>
        <label class="trend-personal-field trend-personal-wide">別名／同義詞（逗號分隔，最多 15 個）<input name="aliases" type="text" maxlength="800" value="${escapeHtml((editing?.aliases||[]).join(', '))}" placeholder="英文名稱、縮寫或常見別稱"></label>
        <fieldset class="trend-personal-wide"><legend>觀測領域（不勾選代表跨所有領域）</legend><div class="trend-preference-grid">${topics().map(t=>`<label><input type="checkbox" name="topic" value="${t.id}" ${editing?.topics?.includes(t.id)?'checked':''}> ${escapeHtml(t.label)}</label>`).join('')}</div></fieldset>
        <div class="trend-personal-actions trend-personal-wide"><button type="submit" class="btn primary">${editing?'儲存變更':'加入觀測清單'}</button>${editing?'<button type="button" class="btn" data-personal-cancel-edit>取消編輯</button>':''}</div>
      </form><p class="trend-footnote">僅搜尋本站已有來源的標題，不抓取外站全文。關鍵字命中不代表事件已查證；不同企業不會因縮寫相似而合併。</p></section>`;
  }
  function termList() {
    const list=preferences.watchTerms;
    return `<section class="trend-detail-panel"><h4>企業與關鍵字觀測清單 · ${list.filter(x=>x.enabled).length} 項啟用</h4>
      ${list.length?list.map(t=>`<div class="trend-personal-row"><div><strong>${escapeHtml(t.name)}</strong><small>${t.type==='company'?'企業':'關鍵字'} · ${t.topics?.length?t.topics.map(topicName).map(escapeHtml).join('、'):'跨所有領域'}<br>別名：${escapeHtml((t.aliases||[]).join('、')||'無')} · ${t.enabled?'追蹤中':'已停用'}</small></div><span class="trend-personal-actions"><button type="button" class="btn" data-personal-edit="${escapeHtml(t.id)}">編輯</button><button type="button" class="btn" data-personal-toggle="${escapeHtml(t.id)}">${t.enabled?'停用':'啟用'}</button></span></div>`).join(''):'<div class="empty">尚未新增觀測項目。先輸入公司名稱或關鍵字即可開始。</div>'}</section>`;
  }
  function backupPage() {
    const engine=window.DailyInsightBackup;
    if (!engine) return '<section class="trend-detail-panel"><h4>資料管理暫時無法使用</h4><p>備份模組尚未載入；現有閱讀和關注功能不受影響。</p></section>';
    let counts=null, problem='';
    try { const local=engine.readCurrent(localStorage);counts={read:local.reader.read.length,saved:local.reader.saved.length,quizzes:Object.keys(local.reader.quizResults).length,terms:local.trends.watchTerms.length,watched:local.trends.watched.length}; }
    catch(err){problem=err.message;}
    const labels={read:'已讀',saved:'收藏',quizzes:'測驗',watched:'關注事件',terms:'企業／關鍵字',pinned:'置頂事件',states:'進展狀態'};
    const summary=counts?`<div class="trend-backup-stats">${Object.entries(counts).map(([k,v])=>`<div><strong>${v}</strong><span>${labels[k]}</span></div>`).join('')}</div>`:'';
    const check=backupDraft?`<section class="trend-backup-preview"><h4>匯入前檢查結果 · 版本 ${engine.VERSION}</h4><div class="trend-backup-table"><div><strong>資料類別</strong><strong>匯入筆數</strong><strong>新增</strong><strong>略過重複</strong></div>${Object.keys(backupDraft.added).map(k=>`<div><span>${labels[k]}</span><span>${backupDraft.imported[k]}</span><span>${backupDraft.added[k]}</span><span>${backupDraft.skipped[k]}</span></div>`).join('')}</div><p class="trend-caution">相同識別碼或相同企業名稱不覆寫現有設定。既有主題排序、隱藏設定、閱讀測驗結果以目前瀏覽器為優先。</p>
      <label class="trend-personal-confirm"><input type="checkbox" id="trend-backup-approve"> 我確認只合併新資料，且了解完成後需要重新載入頁面。</label><button type="button" class="btn primary" data-personal-import-apply>確認安全合併</button></section>`:'';
    return `<section class="trend-overview"><div class="trend-section-title"><h3>D3 · 資料備份與安全匯入</h3><button type="button" class="btn" data-personal-backup-close>${currentTab==='backup'?'返回趨勢總覽':'返回我的關注'}</button></div>
      <p class="trend-muted">只在目前裝置操作，不上傳新聞閱讀紀錄、關注設定或 JSON 到伺服器。匯出可轉移到你自己的其他裝置；匯入前必須檢查。</p><div class="trend-backup-grid"><section class="trend-detail-panel"><h4>匯出完整個人資料</h4>${summary}${problem?`<p class="trend-caution">${escapeHtml(problem)}</p>`:'<button type="button" class="btn primary" data-personal-export>下載 JSON 備份</button>'}<p class="trend-footnote">包含原有已讀、收藏、測驗，以及趨勢關注、觀測清單、事件進展與版面設定。</p></section>
      <section class="trend-detail-panel"><h4>選擇 JSON 備份</h4><label class="trend-personal-field">選擇檔案（上限 2 MB）<input id="trend-import-file" type="file" accept=".json,application/json"></label><p class="trend-muted">先檢查格式版本、筆數與衝突；未經確認不寫入任何紀錄。</p><button type="button" class="btn" data-personal-import-reset>清除匯入預覽</button>${backupError?`<p class="trend-caution" role="alert">${escapeHtml(backupError)}</p>`:''}</section></div>${check}</section>`;
  }
  function watch() {
    const watched = eventList().filter(isWatched);
    const updates = newUpdates();
    const matched=matchedEvents();
    if(backupOpen)return backupPage();
    return `<section class="trend-watch"><div class="trend-section-title"><h3>我的情報關注</h3><button type="button" class="btn" data-personal-backup>D3 · 資料匯出／匯入</button></div><div class="trend-summary-cards"><div><strong>${watched.length}</strong><span>持續關注</span></div><div><strong>${updates.length}</strong><span>尚未查看的更新</span></div><div><strong>${watchTerms().length}</strong><span>企業／關鍵字觀測</span></div></div>
      ${window.DailyTrendMetrics&&watched.length?window.DailyTrendMetrics.compact(history,watched):''}
      <section class="trend-detail-panel"><h4>關注的六大領域</h4><p class="trend-muted">取消勾選的主題將暫時從情報首頁及脈絡分析篩選中隱藏，不會刪除資料。</p><div class="trend-preference-grid">${topics().map(t=>`<label><input type="checkbox" data-trend-pref="${escapeHtml(t.id)}" ${preferences.topics.includes(t.id)?'checked':''}> ${escapeHtml(t.label)}</label>`).join('')}</div></section>
      <div class="trend-section-title"><h3>B1 · 企業與關鍵字觀測</h3><span>支援同義詞、停用與跨領域</span></div><div class="trend-personal-two">${watchTermForm()}${termList()}</div>
      <div class="trend-section-title"><h3>符合觀測字詞的事件</h3><span>${matched.length} 個文字命中</span></div>${matched.length?`<div class="trend-event-list">${matched.slice(0,12).map(e=>eventCard(e,true)).join('')}</div>`:'<div class="empty">目前沒有符合觀測字詞的既有事件。這不代表沒有相關新聞，請調整同義詞或主題範圍。</div>'}
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
    if(window.DailyTrendMetrics){
      const r=window.DailyTrendMetrics.compare(history,preferences.reportPeriod);
      return `Daily Insight · ${r.period} 天收錄變化\n當期 ${r.current.from} 至 ${r.current.to}，完整日誌 ${r.current.coverage}/${r.period} 日\n前期 ${r.previous.from} 至 ${r.previous.to}，完整日誌 ${r.previous.coverage}/${r.period} 日\n${window.DailyTrendMetrics.signal(r)}\n收錄量依本站來源範圍統計。`;
    }
    const r = reportData(preferences.reportPeriod);
    return `Daily Insight 3.0｜${r.period} 天趨勢回顧\n資料涵蓋 ${r.coverage} / ${r.period} 天；每日事件存量，非新增事件件數。\n` + r.leading.map(x=>`${x.label}：${x.value}（各日事件數加總）`).join('\n') + '\n此為規則式分類摘要；原始內容與來源請回網站核對。';
  }
  function reports() {
    if(window.DailyTrendMetrics)return `<section class="trend-reports"><div class="trend-section-title"><h3>情報週報與月報</h3><button type="button" class="btn" data-trend-copy>複製報告摘要</button></div>${heatPage()}</section>`;
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
  function progressPage() {
    const events = selectedEvents().sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
    return `<section class="trend-progress-page"><div class="trend-section-title"><h3>事件進展紀錄</h3><span>${events.length} 個事件</span></div>
      <p class="trend-muted">選擇事件查看按時間排列的來源紀錄，並設定追蹤狀態。</p>
      ${topicFilters()}
      <div class="trend-event-list">${events.map(e=>`<article class="trend-event-card">
        <div class="trend-event-top"><span class="trend-topic-label">${escapeHtml(topicName(e.primary_topic))}</span><span class="trend-impact">${escapeHtml(eventStatus(e))}</span></div>
        <h3><button type="button" data-trend-progress="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></h3>
        <p>${e.articles?.length||0} 筆來源紀錄 · 最近更新 ${formatDate(e.updated_at)}</p>
        <div class="trend-inline-actions"><button type="button" class="btn primary" data-trend-progress="${escapeHtml(e.id)}">查看進展紀錄 →</button><button type="button" class="btn" data-trend-importance="${escapeHtml(e.id)}">為什麼重要</button></div>
      </article>`).join('') || '<div class="empty">這個範圍目前沒有事件，請切換主題或到「我的關注」調整領域。</div>'}</div>
    </section>`;
  }
  function learningPage(news) {
    const learning = window.DailyLearning;
    if (!learning) return '<div class="notice">閱讀模組目前無法載入，請重新整理。</div>';
    const results = typeof state === 'object' ? state.quizResults : {};
    const validArticles = typeof homepageArticles === 'function' ? homepageArticles(news) : news;
    const glossary = article => typeof readerGlossary === 'function'
      ? readerGlossary(article,typeof readerSupplements === 'object' ? readerSupplements[article.id] || {} : {}) : [];
    const quiz = article => typeof quizData === 'function' ? quizData(article) : null;
    return `<section class="learning-home"><div class="trend-pane-tabs" role="group" aria-label="閱讀與複習功能">${[['digest','每日五分鐘'],['glossary','術語與背景'],['review','錯題複習']].map(([id,label])=>`<button type="button" class="trend-pane-tab ${learningMode===id?'active':''}" data-learning-mode="${id}" aria-pressed="${learningMode===id}">${label}</button>`).join('')}</div>
      ${learningMode==='glossary'?learning.glossaryHtml(validArticles,glossary):learningMode==='review'?learning.reviewHtml(validArticles,results,quiz):learning.digestHtml(validArticles)}</section>`;
  }
  function heatPage(){
    return window.DailyTrendMetrics?window.DailyTrendMetrics.panel(history,preferences.reportPeriod,{topics:topics(),events:eventList(),watched:preferences.watched}):'<div class="notice">趨勢模組目前無法載入，請重新整理。</div>';
  }
  function renderPage(news) {
    initialize();
    if (initialized && !loading && Date.now() - lastFetchedAt > 5*60*1000) refresh();
    if (currentTab==='learning') return header()+learningPage(news);
    if (currentTab==='backup') return header()+backupPage();
    if (!data) return header() + `<div class="notice">${escapeHtml(error || (loading?'正在建立趨勢情報畫面…':'尚未取得趨勢資料。'))}<button type="button" class="btn" data-trend-refresh>重新讀取</button></div>`;
    const event = selectedEvent && eventList().find(e=>e.id===selectedEvent);
    if (event) return header()+detail(event,news);
    return header() + (currentTab==='heat'?heatPage():currentTab==='progress'?progressPage():currentTab==='deep'?deepAnalysis():currentTab==='watch'?watch():currentTab==='reports'?reports():currentTab==='network'?network():overview()) + (announcement?`<p class="trend-announcement" role="status">${escapeHtml(announcement)}</p>`:'');
  }
  function switchTab(id, button) {
    const oldTabs = button.closest?.('.trend-tabs');
    const wasPinned = oldTabs?.getBoundingClientRect?.().top <= 1;
    const oldHorizontalScroll = oldTabs?.scrollLeft || 0;
    currentTab = id; selectedEvent = null; selectedTopic = 'all'; backupOpen=false; editingTerm=null; repaint();
    const tabs = document.querySelector('.trend-tabs');
    if (!tabs) return;
    tabs.scrollLeft = oldHorizontalScroll;
    const active = tabs.querySelector?.('.trend-tab.active');
    if (active) {
      const activeLeft = tabs.scrollLeft + active.getBoundingClientRect().left - tabs.getBoundingClientRect().left;
      if (activeLeft < tabs.scrollLeft) tabs.scrollLeft = activeLeft;
      else if (activeLeft + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth)
        tabs.scrollLeft = activeLeft + active.offsetWidth - tabs.clientWidth;
    }
    if (wasPinned && tabs.nextElementSibling?.getBoundingClientRect) {
      const contentTop = tabs.nextElementSibling.getBoundingClientRect().top;
      window.scrollTo(0, Math.max(0, window.scrollY + contentTop - tabs.getBoundingClientRect().height - 10));
    }
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button'); if(!b) return;
    if(b.dataset.trendTab){switchTab(b.dataset.trendTab,b);}
    else if(b.hasAttribute('data-heat-open')){switchTab('heat',b);}
    else if(b.dataset.heatPeriod){const value=b.dataset.heatPeriod;if(['7','30','90'].includes(value)){preferences.reportPeriod=value;persist();repaint();}}
    else if(b.dataset.learningMode){learningMode=b.dataset.learningMode;currentTab='learning';selectedEvent=null;repaint();}
    else if(b.hasAttribute('data-personal-customize')){customizeLayout=!customizeLayout;repaint();}
    else if(b.dataset.personalMove){const i=preferences.layout.order.indexOf(b.dataset.personalMove),j=i+(b.dataset.direction==='up'?-1:1);if(i>=0&&j>=0&&j<preferences.layout.order.length){[preferences.layout.order[i],preferences.layout.order[j]]=[preferences.layout.order[j],preferences.layout.order[i]];persist();repaint();}}
    else if(b.hasAttribute('data-personal-reset')){preferences.layout=defaultLayout();persist();repaint();}
    else if(b.dataset.personalPin){const e=eventList().find(x=>x.id===b.dataset.personalPin);if(!e)return;const ids=eventIds(e);preferences.layout.pinned=isPinned(e)?preferences.layout.pinned.filter(x=>!ids.includes(x)):[...preferences.layout.pinned.filter(x=>!ids.includes(x)),e.id];persist();repaint();}
    else if(b.dataset.personalEdit){editingTerm=b.dataset.personalEdit;repaint();}
    else if(b.dataset.personalToggle){const t=preferences.watchTerms.find(x=>x.id===b.dataset.personalToggle);if(t){t.enabled=!t.enabled;persist();repaint();}}
    else if(b.hasAttribute('data-personal-cancel-edit')){editingTerm=null;repaint();}
    else if(b.hasAttribute('data-personal-backup')){backupOpen=true;backupError='';backupDraft=null;repaint();}
    else if(b.hasAttribute('data-personal-backup-close')){backupOpen=false;backupDraft=null;backupError='';if(currentTab==='backup')currentTab='overview';repaint();}
    else if(b.hasAttribute('data-personal-import-reset')){backupDraft=null;backupError='';repaint();}
    else if(b.hasAttribute('data-personal-export')){
      try {
        const json=JSON.stringify(window.DailyInsightBackup.createExport(localStorage),null,2);
        const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
        anchor.href=url;anchor.download='daily-insight-personal-backup.json';anchor.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(err){backupError='無法建立備份：'+err.message;repaint();}
    }
    else if(b.hasAttribute('data-personal-import-apply')){
      if(!backupDraft)return;
      if(!document.getElementById('trend-backup-approve')?.checked){backupError='請先核對筆數與衝突並勾選確認。';repaint();return;}
      try {window.DailyInsightBackup.applyImport(localStorage,backupDraft.data);window.location.reload();}
      catch(err){backupError=err.message;repaint();}
    }
    else if(b.dataset.trendTopic){selectedTopic=b.dataset.trendTopic;currentTab=currentTab==='network'?'deep':currentTab;selectedEvent=null;repaint();}
    else if(b.dataset.trendDetail||b.dataset.trendProgress||b.dataset.trendImportance){selectedEvent=b.dataset.trendDetail||b.dataset.trendProgress||b.dataset.trendImportance;detailPane=b.dataset.trendImportance?'importance':b.dataset.trendProgress?'progress':'evidence';const e=eventList().find(x=>x.id===selectedEvent);compareLeft=e?.articles?.[0]?.url||'';compareRight=e?.articles?.[1]?.url||compareLeft;preferences.viewed[selectedEvent]=new Date().toISOString();persist();repaint();window.scrollTo(0,0);}
    else if(b.dataset.trendPane){detailPane=b.dataset.trendPane;repaint();}
    else if(b.hasAttribute('data-trend-close')){selectedEvent=null;repaint();window.scrollTo(0,0);}
    else if(b.dataset.trendWatch){const id=b.dataset.trendWatch;const e=eventList().find(x=>x.id===id);if(!e)return;const ids=eventIds(e);preferences.watched=isWatched(e)?preferences.watched.filter(x=>!ids.includes(x)):[...preferences.watched.filter(x=>!ids.includes(x)),id];persist();repaint();}
    else if(b.dataset.trendPeriod){preferences.reportPeriod=b.dataset.trendPeriod;persist();repaint();}
    else if(b.hasAttribute('data-trend-copy')){const value=reportText();if(navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(()=>{announcement='報告摘要已複製。';repaint();}).catch(()=>{announcement='無法複製，請確認瀏覽器權限。';repaint();});else {announcement='此瀏覽器不支援直接複製。';repaint();}}
    else if(b.hasAttribute('data-trend-refresh'))refresh();
  });
  document.addEventListener('input',event=>{
    if (!event.target.matches('[data-learning-search]')) return;
    const section=event.target.closest('.learning-section');
    const query=event.target.value.trim().normalize('NFKC').toLocaleLowerCase('zh-TW');
    const rows=[...section.querySelectorAll('[data-learning-term]')];
    for (const row of rows) row.hidden=!row.textContent.normalize('NFKC').toLocaleLowerCase('zh-TW').includes(query);
    section.querySelector('.learning-search-empty').hidden=rows.some(row=>!row.hidden);
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('input[data-personal-show]')){const id=input.dataset.personalShow;preferences.layout.hidden=input.checked?preferences.layout.hidden.filter(x=>x!==id):[...new Set([...preferences.layout.hidden,id])];persist();repaint();return;}
    if(input.matches('select[data-personal-status]')){const id=input.dataset.personalStatus;const allowed=window.DailyInsightBackup?.STATUSES||['新事件','持續發展','待確認','已結束'];if(allowed.includes(input.value)){preferences.eventStates[id]=input.value;persist();repaint();}return;}
    if(input.matches('input#trend-import-file')){
      const file=input.files?.[0];if(!file)return;
      backupDraft=null;backupError='';
      if(file.size>2*1024*1024){backupError='備份檔案超過 2 MB 上限。';repaint();return;}
      file.text().then(raw=>{
        const parsed=window.DailyInsightBackup.parseImport(raw);
        backupDraft={data:parsed,...window.DailyInsightBackup.previewMerge(localStorage,parsed)};
        backupError='';repaint();
      }).catch(err=>{backupDraft=null;backupError='無法預覽匯入檔案：'+err.message;repaint();});return;
    }
    if(input.matches('select[data-trend-compare]')){
      if(input.dataset.trendCompare==='left')compareLeft=input.value;
      else compareRight=input.value;
      repaint();return;
    }
    if(!input.matches('input[data-trend-pref]'))return;
    const id=input.dataset.trendPref;
    preferences.topics=input.checked?[...new Set([...preferences.topics,id])]:preferences.topics.filter(x=>x!==id);
    persist();repaint();
  });
  document.addEventListener('submit',event=>{
    const form=event.target;
    if(form.id!=='trend-term-form')return;
    event.preventDefault();
    const type=form.elements.type.value,name=form.elements.name.value.trim(),aliases=form.elements.aliases.value.split(/[,，、;；\n]/).map(x=>x.trim()).filter(Boolean),selected=[...form.querySelectorAll('input[name="topic"]:checked')].map(x=>x.value);
    if(!['company','keyword'].includes(type)||[...name].length<2||name.length>80||aliases.length>15||aliases.some(x=>x.length>80)||selected.some(x=>!DEFAULT_TOPICS.includes(x))){announcement='請檢查名稱、別名及觀測主題。';repaint();return;}
    const duplicate=preferences.watchTerms.some(x=>x.id!==editingTerm&&x.type===type&&x.name.toLocaleLowerCase('zh-TW')===name.toLocaleLowerCase('zh-TW'));
    if(duplicate){announcement='此企業或關鍵字已在清單中，可直接編輯或重新啟用。';repaint();return;}
    const item={type,name,aliases:[...new Set(aliases)],topics:[...new Set(selected)],enabled:true};
    if(editingTerm){const x=preferences.watchTerms.find(x=>x.id===editingTerm);if(x)Object.assign(x,item);editingTerm=null;}
    else if(preferences.watchTerms.length<500){item.id='term-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);preferences.watchTerms.push(item);}
    else {announcement='最多可儲存 500 項觀測條件。';repaint();return;}
    announcement='觀測條件已儲存於目前瀏覽器。';persist();repaint();
  });
  window.DailyTrends = {render:renderPage,refresh,getData:()=>data,getPreferences:()=>preferences};
})();
