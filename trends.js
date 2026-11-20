/* Daily Insight 3.0 stage 5: source-grounded event comparison, no AI verification. */
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
  let data = null, history = null, sourceHealth = null, loading = false, error = '', currentTab = 'overview', selectedTopic = 'all', selectedEvent = null, showOnlyWatched = false;
  let detailPane = 'evidence', compareLeft = '', compareRight = '';
  let announcement = '', initialized = false, lastFetchedAt = 0;
  function persist() { try { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { announcement = '瀏覽器未允許儲存偏好，設定可能無法保留。'; } }
  function repaint() { if (typeof render === 'function' && document.querySelector('[data-page="trends"]')?.classList.contains('active')) render(); }
  function topics() { return data?.topics?.length ? data.topics : TOPIC_FALLBACK; }
  function topicName(id) { return topics().find(x => x.id === id)?.label || '未分類'; }
  function topicIndex(id) { return Math.max(0, DEFAULT_TOPICS.indexOf(id)); }
  function eventList() { return Array.isArray(data?.events) ? data.events : []; }
  function eventIds(e) { return [e.id, ...(Array.isArray(e.aliases) ? e.aliases : [])]; }
  function isWatched(e) { return eventIds(e).some(id => preferences.watched.includes(id)); }
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
    const watched = isWatched(e);
    const unseen = newUpdates().some(x=>x.id===e.id);
    const firstHand = (e.articles||[]).filter(x=>x.source_type==='official').length;
    return `<article class="trend-event-card ${compact?'compact':''}"><div class="trend-event-top"><span class="trend-topic-label" style="color:${TOPIC_COLORS[topicIndex(e.primary_topic)]}">${TOPIC_ICON[topicIndex(e.primary_topic)]} ${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}</div>
      <h3><button type="button" data-trend-detail="${escapeHtml(e.id)}">${escapeHtml(e.title)}</button></h3>
      <p>已整合 ${e.articles?.length || 0} 篇相關報導、${e.source_count || 0} 個來源${firstHand?`；包含 ${firstHand} 篇官方來源`:''}。可查看報導主張、來源差異與檢查結果。</p>
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
    const panes = [['evidence','證據對照'],['compare','並排比較'],['quality','來源品質']];
    return `<div class="trend-investigation"><div class="trend-pane-tabs" role="group" aria-label="事件查證功能">${panes.map(([id,label])=>`<button type="button" data-trend-pane="${id}" class="trend-pane-tab ${detailPane===id?'active':''}" aria-pressed="${detailPane===id}">${label}</button>`).join('')}</div>
      ${detailPane==='quality'?qualityPanel(e):detailPane==='compare'?comparePanel(e):evidencePanel(e,reading)}</div>`;
  }
  function detail(e, news) {
    const watched = isWatched(e);
    const sorted = [...(e.articles||[])].sort((a,b)=>new Date(a.published_at)-new Date(b.published_at));
    const reading = articleMatches(e,news);
    return `<section class="trend-detail"><button type="button" class="trend-back" data-trend-close>← 返回${currentTab==='deep'?'脈絡分析':'情報總覽'}</button>
      <div class="trend-detail-heading"><span class="trend-topic-label">${escapeHtml(topicName(e.primary_topic))}</span>${badge(e)}<h3>${escapeHtml(e.title)}</h3><div class="trend-detail-meta">首次資料 ${formatDate(e.first_seen_at)}　最近更新 ${formatDate(e.updated_at)}　${e.source_count} 個來源</div><button type="button" class="btn" data-trend-watch="${escapeHtml(e.id)}">${watched?'★ 取消關注':'☆ 加入我的關注'}</button></div>
      ${investigation(e,reading)}<div class="trend-detail-grid"><section class="trend-detail-panel"><h4>事件發展時間線</h4><ol class="trend-timeline">${sorted.map(a=>`<li><time>${formatDate(a.published_at)}</time><span>${escapeHtml(a.title)}</span><small>${escapeHtml(a.source)}</small></li>`).join('')}</ol></section>
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
  function watch() {
    const watched = eventList().filter(isWatched);
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
  function switchTab(id, button) {
    const oldTabs = button.closest?.('.trend-tabs');
    const wasPinned = oldTabs?.getBoundingClientRect?.().top <= 1;
    const oldHorizontalScroll = oldTabs?.scrollLeft || 0;
    currentTab = id; selectedEvent = null; selectedTopic = 'all'; repaint();
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
    else if(b.dataset.trendTopic){selectedTopic=b.dataset.trendTopic;currentTab=currentTab==='network'?'deep':currentTab;selectedEvent=null;repaint();}
    else if(b.dataset.trendDetail){selectedEvent=b.dataset.trendDetail;detailPane='evidence';const e=eventList().find(x=>x.id===selectedEvent);compareLeft=e?.articles?.[0]?.url||'';compareRight=e?.articles?.[1]?.url||compareLeft;preferences.viewed[selectedEvent]=new Date().toISOString();persist();repaint();window.scrollTo(0,0);}
    else if(b.dataset.trendPane){detailPane=b.dataset.trendPane;repaint();}
    else if(b.hasAttribute('data-trend-close')){selectedEvent=null;repaint();window.scrollTo(0,0);}
    else if(b.dataset.trendWatch){const id=b.dataset.trendWatch;const e=eventList().find(x=>x.id===id);if(!e)return;const ids=eventIds(e);preferences.watched=isWatched(e)?preferences.watched.filter(x=>!ids.includes(x)):[...preferences.watched.filter(x=>!ids.includes(x)),id];persist();repaint();}
    else if(b.dataset.trendPeriod){preferences.reportPeriod=b.dataset.trendPeriod;persist();repaint();}
    else if(b.hasAttribute('data-trend-copy')){const value=reportText();if(navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(()=>{announcement='報告摘要已複製。';repaint();}).catch(()=>{announcement='無法複製，請確認瀏覽器權限。';repaint();});else {announcement='此瀏覽器不支援直接複製。';repaint();}}
    else if(b.hasAttribute('data-trend-refresh'))refresh();
  });
  document.addEventListener('change',event=>{
    const input=event.target;
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
  window.DailyTrends = {render:renderPage,refresh,getData:()=>data,getPreferences:()=>preferences};
})();
