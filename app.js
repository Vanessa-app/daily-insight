 'use strict';
const KEY='daily-insight-v1.8',DATA='./data/news.json';
const LIVE_DATA='https://raw.githubusercontent.com/Vanessa-app/daily-insight/main/data/news.json';
const state={page:'news',filter:'全部',news:[],meta:null,selected:null,mode:'zh',saved:[],read:[],quizResults:{},...load()};
function load(){try{return JSON.parse(localStorage.getItem(KEY)||localStorage.getItem('daily-insight-v1.4')||'{}')}catch{return {}}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({saved:state.saved,read:state.read,quizResults:state.quizResults}))}catch{}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeUrl(s){try{const u=new URL(s);return u.protocol==='https:'?u.href:null}catch{return null}}
function date(s){if(!s)return '日期不明';const d=new Date(s);return isNaN(d)?'日期不明':new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeZone:'Asia/Taipei'}).format(d)}
// Editorial exceptions are reviewed individually against the official source.
const IMPORTANT_ARTICLES = new Map([
 ['https://www.nasa.gov/missions/artemis/nasa-shares-plans-to-accelerate-artemis-return-to-moon/',
  'NASA 公布載人登月計畫的關鍵時程，涉及 2027 年試飛與 2028 年登月目標。']
]);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
function originalParts(a) {
 if (Array.isArray(a.evidence_original) && a.evidence_original.length) return a.evidence_original;
 return hasText(a.excerpt_original) ? [a.excerpt_original] : [];
}
function hasChinese(a, parts = originalParts(a)) {
 if (a.translation_status === 'original_zh_hant') return parts.length > 0 && parts.every(hasText);
 return ['translated', 'translated_unreviewed', 'human_reviewed_demo'].includes(a.translation_status)
   && parts.length > 0 && parts.every(hasText)
   && Array.isArray(a.evidence_zh_hant) && a.evidence_zh_hant.length === parts.length
   && a.evidence_zh_hant.every(hasText);
}
function hasApprovedFullText(a) {
 return a.content_complete === true && a.reuse_license === 'approved'
   && Array.isArray(a.evidence_original) && a.evidence_original.length > 0
   && a.evidence_original.every(hasText);
}
function editorialReason(a) {
 return a.demo ? undefined : IMPORTANT_ARTICLES.get(safeUrl(a.url));
}
function homepageArticles(items) {
 const byDate = (a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
 const primary = items.filter(a => !a.demo && hasApprovedFullText(a) && hasChinese(a)).sort(byDate);
 const exceptions = items.filter(a => editorialReason(a) && !(hasApprovedFullText(a) && hasChinese(a))).sort(byDate);
 return [...primary, ...exceptions];
}
function readingStatus(a) {
 if (hasApprovedFullText(a) && hasChinese(a)) return a.translation_status === 'original_zh_hant' ? '可讀全文 · 繁中原文' : '可讀全文 · 有繁中';
 const reason = editorialReason(a);
 if (!reason) return '';
 return '重要例外 · ' + (hasApprovedFullText(a) ? '可讀全文' : '僅節錄或標題')
   + ' · ' + (hasChinese(a) ? '有繁中' : '尚無繁中');
}
function imageMarkup(a,cls='card-art'){
 const u=safeUrl(a.image_url);
 return u&&a.image_rights==='approved'?`<div class="${cls} has-photo"><img src="${esc(u)}" alt="${esc(a.image_alt||a.title)}" loading="lazy" referrerpolicy="no-referrer"></div>`:`<div class="${cls}"></div>`;
}
function quizData(a){return a.quiz_reviewed===true&&Array.isArray(a.quiz)&&a.quiz.length>0&&a.quiz.every(q=>q.question&&Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length&&q.explanation)?a.quiz:null}
function awards(){const r=Object.values(state.quizResults||{}),perfect=r.filter(x=>x.score===x.total).length;return {xp:r.reduce((s,x)=>s+x.score*20+10,0),completed:r.length,perfect}}
function article(a){const saved=state.saved.includes(a.url),read=state.read.includes(a.url);return `<article class="card">${imageMarkup(a)}<div class="card-body"><div class="meta">${a.demo?'【原創示範】 ':''}${esc(a.category)} · ${esc(a.source)} · ${a.kind==='knowledge'?'知識專題':esc(date(a.published_at))}</div><h3>${esc(a.title)}</h3>${readingStatus(a)?`<div class="meta">${esc(readingStatus(a))}</div>`:""}<p>${esc(a.translation_zh_hant||a.excerpt_original||'官方來源目前只提供標題，尚無可展示的內文。')}</p><div class="actions"><button class="btn primary" data-open="${esc(a.url)}">開始閱讀 →</button><button class="btn" data-save="${esc(a.url)}">${saved?'★ 已收藏':'☆ 收藏'}</button>${read?'<span class="meta">✓ 已閱讀</span>':''}</div></div></article>`}
function reader(a){
 const parts=originalParts(a);
 const translations=Array.isArray(a.evidence_zh_hant)?a.evidence_zh_hant:[];
 const nativeChinese=a.translation_status==='original_zh_hant';
 const translated=!nativeChinese&&hasChinese(a,parts);
 const license=safeUrl(a.license_url);
 const source=safeUrl(a.url)||'#';
 const status=nativeChinese?'官方繁中原文':a.translation_status==='human_reviewed_demo'?'原創示範文章：已提供編輯對照譯文':translated?'已產生機器翻譯（未經人工校對）':a.translation_status==='translation_pending'?'背景翻譯尚未完成':a.translation_status?.startsWith('provider_error')?'背景翻譯失敗：'+a.translation_status:'目前沒有中文翻譯：'+(a.translation_status||'未知');
 const panels=parts.length?parts.map((part,i)=>{
   const original=`<div class="evidence-original"><div class="kicker">原始資料 · 段落 ${i+1}</div><p class="reader-text">${esc(part)}</p></div>`;
   const zh=`<div class="evidence-zh"><div class="kicker">繁體中文 · 段落 ${i+1}</div><p class="reader-text">${translated?esc(translations[i]):'<span class="translation-missing">未取得翻譯。以下不會以 AI 猜測補寫。</span>'}</p></div>`;
   if(nativeChinese||state.mode==='original')return `<div class="evidence-row">${original}</div>`;
   if(state.mode==='zh')return `<div class="evidence-row">${translated?zh:original}</div>`;
   return `<div class="evidence-row compare">${zh}${original}</div>`;
 }).join(''):'<div class="notice">此官方來源沒有提供可用的內文。系統不會自行編造。</div>';
 const quiz=quizData(a), result=(state.quizResults||{})[a.id||a.url];
 const quizHtml=quiz?`<section class="quiz-panel" id="knowledge-quiz"><div class="kicker">LEARN & LEVEL UP</div><h3>🧠 閱讀後的知識挑戰</h3><p>答題後提供解說，幫助理解文章。</p>${result?`<div class="notice">🏆 已完成：${result.score}/${result.total} 題正確，獲得 ${result.score*20+10} XP。<button class="btn" data-quiz-reset="${esc(a.id||a.url)}">重新挑戰</button></div><div class="quiz-feedback">${quiz.map((q,i)=>`<p><strong>第 ${i+1} 題：</strong>${esc(q.explanation)}</p>`).join('')}</div>`:`${quiz.map((q,i)=>`<fieldset class="quiz-question"><legend>${i+1}. ${esc(q.question)}</legend>${q.options.map((o,j)=>`<label class="quiz-choice"><input type="radio" name="quiz-${i}" value="${j}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}<button class="btn primary" data-quiz-submit="${esc(a.id||a.url)}">提交答案，領取 XP</button><div id="quiz-feedback" aria-live="polite"></div>`}</section>`:`<div class="notice">本篇尚無經過內容審核的專屬測驗，為避免虛構題目，暫不提供挑戰。</div>`;
 return `<section class="reader"><button class="back" data-back="1">← 返回探索</button><div class="kicker">${esc(a.category)} / ${esc(a.source)}</div><h2>${esc(a.title)}</h2>${a.demo?'<div class="notice">此為原創雙語教學示範，不是即時新聞；部署並更新後才會有官方來源內容。</div>':''}${imageMarkup(a,"reader-cover")}${a.image_url&&a.image_rights==="approved"?`<div class="meta">圖片：${esc(a.image_credit||a.source)} · ${esc(a.image_license||"授權已確認")}</div>`:""}<div class="statsline">${a.kind==='knowledge'?'知識專題':`發布：${esc(date(a.published_at))}`} · 來源網域已核對 · 主張未獨立查證</div><div class="notice"><strong>內容範圍：</strong>${a.demo?'Daily Insight 原創教學示範全文（非官方新聞）':hasApprovedFullText(a)?'已核准重製的官方全文':a.content_scope==='official_article_extracted'?'已擷取官方文章正文，但尚未確認完整性或授權':'官方來源摘要或部分內文，並非全文'}。未確認可合法重製的文章不提供全文。<br><strong>翻譯狀態：</strong>${esc(status)}。${nativeChinese?'': '翻譯可能有誤，請以原文為準。'}${license?`<br><strong>全文授權：</strong><a href="${esc(license)}" target="_blank" rel="noopener noreferrer">${esc(a.license_name)}</a>` : ''}</div>${nativeChinese?"":`<div class="filters" style="margin-top:20px"><button class="mode ${state.mode==='zh'?'active':''}" data-mode="zh">繁體中文</button><button class="mode ${state.mode==='both'?'active':''}" data-mode="both">逐段對照</button><button class="mode ${state.mode==='original'?'active':''}" data-mode="original">原文</button></div>`}<div class="evidence-list">${panels}</div><div class="notice"><strong>來源與驗證：</strong>本文文字來自${a.demo?'Daily Insight 原創示範':(hasApprovedFullText(a)||a.content_scope==='official_article_extracted')?'官方文章頁面':'發布者提供的 RSS'}。來源網域檢查不等於事實已查證。若要取得完整全文，必須確認該來源的授權及全文存取方式。</div>${editorialReason(a)&&!(hasApprovedFullText(a)&&translated)?`<div class="notice">重要例外 · ${esc(editorialReason(a))}</div>`:""}${quizHtml}<div class="actions"><a class="btn primary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">查閱官方原始文件 ↗</a><button class="btn" data-save="${esc(a.url)}">${state.saved.includes(a.url)?'★ 已收藏':'☆ 收藏'}</button><button class="btn" data-read="${esc(a.url)}">${state.read.includes(a.url)?'✓ 已閱讀':'完成閱讀'}</button></div></section>`;
}
function render(){document.querySelector('#streak').textContent=`已讀 ${state.read.length} 篇`;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));const main=document.querySelector('#main');if(state.selected){const a=state.news.find(x=>x.url===state.selected);if(a){main.innerHTML=reader(a);return}state.selected=null}const n=state.news;if(state.page==='news'){const selected=homepageArticles(n),cats=['全部','知識專題',...new Set(selected.map(x=>x.category))],visible=selected.filter(x=>state.filter==='全部'||x.category===state.filter||(state.filter==='知識專題'&&x.kind==='knowledge'));const bad=Object.entries(state.meta?.sources||{}).filter(([,v])=>v.status!=='ok');main.innerHTML=`<section class="hero"><div><div class="kicker">YOUR DAILY DOSE OF PERSPECTIVE</div><h2>今天，讓好奇心<br>帶你看得更遠。</h2><p>從第一手官方資訊出發，慢慢讀、深入想。每天 30 分鐘，建立屬於你的世界知識地圖。</p><div class="statsline"><span>◷ 30 分鐘每日閱讀</span><span>✧ 原始來源優先</span><span>↗ 原文可追溯</span></div></div><div class="hero-art" aria-hidden="true"></div></section><div class="sectionhead"><h2>今日探索 <span style="color:#bd7558">/ ${visible.length}</span></h2><span class="meta">資料更新：${esc(date(state.meta?.updated_at))}</span></div><div class="filters">${cats.map(c=>`<button class="filter ${state.filter===c?'selected':''}" data-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>${bad.length?`<div class="notice">部分來源更新異常：${bad.map(([k])=>esc(k)).join('、')}。不以虛構資料填補。</div>`:''}${visible.length?`<div class="grid">${visible.map(article).join('')}</div>`:'<div class="empty">目前沒有符合首頁條件的文章。首頁優先刊登可合法提供全文及繁中內容的官方資料，並保留經審核的重要例外。</div>'}`}
else if(state.page==='saved'){const a=n.filter(x=>state.saved.includes(x.url));main.innerHTML=`<div class="sectionhead"><h2>我的收藏書架</h2></div>${a.length?`<div class="grid">${a.map(article).join('')}</div>`:'<div class="empty">尚未收藏文章。看到喜歡的主題時，按下「收藏」即可。</div>'}`}
else if(state.page==='stats'){const aw=awards();main.innerHTML=`<div class="sectionhead"><h2>學習足跡</h2></div><div class="grid"><div class="card"><div class="card-body"><div class="stat">${state.read.length}</div><p>已閱讀篇數</p></div></div><div class="card"><div class="card-body"><div class="stat">${state.saved.length}</div><p>收藏文章數</p></div></div></div><div class="badge-grid"><div class="badge-card">🏆 <strong>${aw.xp} XP</strong><small>知識經驗值</small></div><div class="badge-card">📖 <strong>${aw.completed} 篇</strong><small>挑戰完成</small></div><div class="badge-card">⭐ <strong>${aw.perfect} 篇</strong><small>滿分達成</small></div><div class="badge-card ${aw.completed>=1?'unlocked':'locked'}">🏅 <strong>初次探索</strong><small>完成首次挑戰</small></div><div class="badge-card ${aw.perfect>=3?'unlocked':'locked'}">🏅 <strong>理解達人</strong><small>三次滿分</small></div><div class="badge-card ${aw.completed>=5?'unlocked':'locked'}">🏅 <strong>閱讀冒險家</strong><small>完成五篇挑戰</small></div></div><div class="notice">紀錄保存在目前的瀏覽器，不會跨裝置同步。已閱讀不等於完成事實核查。</div>`}
else main.innerHTML=`<div class="sectionhead"><h2>我們如何對待資訊</h2></div><div class="notice">從核准的官方來源取得第一手資料。經核對授權的繁中原文可完整閱讀，並附原始發布頁與授權連結。網域核對不能證明所有主張正確；正式新聞翻譯由 GitHub Actions 背景執行，可能因模型或資源限制失敗，不能保證完全準確。無摘要或無翻譯時明確標示，不捏造。完整轉載須確認授權。</div>`}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.page){state.page=b.dataset.page;state.selected=null;render()}else if(b.dataset.filter){state.filter=b.dataset.filter;render()}else if(b.dataset.open){state.selected=b.dataset.open;state.mode='zh';render();window.scrollTo(0,0)}else if(b.dataset.back){state.selected=null;render()}else if(b.dataset.mode){state.mode=b.dataset.mode;render()}else if(b.dataset.save){state.saved=state.saved.includes(b.dataset.save)?state.saved.filter(x=>x!==b.dataset.save):[...state.saved,b.dataset.save];persist();render()}else if(b.dataset.quizReset){delete state.quizResults[b.dataset.quizReset];persist();render()}
else if(b.dataset.quizSubmit){
 const a=state.news.find(x=>(x.id||x.url)===b.dataset.quizSubmit),quiz=a&&quizData(a);if(!quiz)return;
 const choices=quiz.map((_,i)=>document.querySelector(`input[name="quiz-${i}"]:checked`));
 if(choices.some(x=>!x)){document.querySelector('#quiz-feedback').textContent='請先回答全部題目。';return}
 const score=quiz.filter((q,i)=>Number(choices[i].value)===q.answer).length;
 state.quizResults[a.id||a.url]={score,total:quiz.length,completedAt:new Date().toISOString()};persist();render();
 const panel=document.querySelector('#knowledge-quiz');if(panel)panel.scrollIntoView({behavior:'smooth',block:'center'});
}
else if(b.dataset.read){if(!state.read.includes(b.dataset.read))state.read.push(b.dataset.read);persist();render()}});
async function readNews(url) {
 const response = await fetch(url, {cache: 'no-store'});
 if (!response.ok) throw Error('HTTP ' + response.status);
 const data = await response.json();
 if (!Array.isArray(data.items)) throw Error('invalid data');
 return data;
}
(async () => {
 const [daily, taiwan] = await Promise.allSettled([
   readNews(LIVE_DATA).catch(() => readNews(DATA)),
   readNews('./data/taiwan.json')
 ]);
 const sources = {...daily.value?.sources};
 if (daily.status === 'rejected') sources.fetch = {status: 'error'};
 if (taiwan.status === 'rejected') sources['台灣全文'] = {status: 'error'};
 state.meta = {updated_at: daily.value?.updated_at, sources};
 state.news = [...(daily.value?.items || []), ...(taiwan.value?.items || [])]
   .filter(a => safeUrl(a.url) && a.verification === 'publisher_domain_checked');
 render();
})();
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
