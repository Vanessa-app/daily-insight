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
 return ['translated', 'translated_unreviewed', 'translated_editorial', 'human_reviewed_demo'].includes(a.translation_status)
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
 const eligible = items.filter(a => a.kind !== 'knowledge' || a.standalone_reviewed === true);
 const byDate = (a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
 const primary = eligible.filter(a => !a.demo && hasApprovedFullText(a) && hasChinese(a)).sort(byDate);
 const exceptions = eligible.filter(a => editorialReason(a) && !(hasApprovedFullText(a) && hasChinese(a))).sort(byDate);
 return [...primary, ...exceptions];
}
function readingStatus(a) {
 if (hasApprovedFullText(a) && hasChinese(a)) return a.translation_status === 'original_zh_hant' ? '可讀全文 · 繁中原文' : '可讀全文 · 有繁中';
 const reason = editorialReason(a);
 if (!reason) return '';
 return '重要例外 · ' + (hasApprovedFullText(a) ? '可讀全文' : '僅節錄或標題')
   + ' · ' + (hasChinese(a) ? '有繁中' : '尚無繁中');
}
const ILLUSTRATIONS = {
 health: ['#dcebe2','#286452','<rect x="105" y="45" width="112" height="118" rx="13"/><path d="M139 45v-8h44v8M139 96h44m-22-22v44M131 137h60"/>'],
 earth: ['#dceae9','#28627a','<path d="M84 114l47-57 43 44 28-29 34 42M82 138c25-22 44 20 68 0s43 18 69 0 31-2 39 0M82 157c25-22 44 20 68 0s43 18 69 0 31-2 39 0"/><circle cx="211" cy="48" r="12"/>'],
 technology: ['#dbe5f0','#2c5680','<rect x="115" y="59" width="93" height="93" rx="12"/><rect x="142" y="86" width="39" height="39" rx="5"/><path d="M115 84H89m26 42H89m119-42h26m-26 42h26m-97-67V38m47 21V38m-47 114v22m47-22v22"/>'],
 food: ['#f1e5cf','#89592d','<circle cx="161" cy="104" r="55"/><circle cx="161" cy="104" r="36"/><path d="M84 57v35c0 11 9 17 17 17m0-52v102m16-102v35c0 11-8 17-16 17m126 50V57c-15 14-16 43 0 50"/>'],
 history: ['#eee0d0','#86583d','<path d="M92 83l70-39 70 39zm13 13h114m-105 0v47m31-47v47m34-47v47m31-47v47M101 144h122m-133 17h144"/>'],
 rail: ['#eee0d0','#86583d','<rect x="108" y="47" width="107" height="98" rx="18"/><rect x="125" y="67" width="72" height="31" rx="5"/><path d="M138 145l-24 28m71-28 24 28m-88-9h81m-67-46h5m43 0h5"/>'],
 society: ['#e8e4ed','#644c78','<circle cx="126" cy="68" r="20"/><circle cx="197" cy="68" r="20"/><path d="M86 142v-13c0-24 18-38 40-38s39 14 39 38v13zm79-13c0-24 14-38 32-38 22 0 40 14 40 38v13h-72"/>'],
 finance: ['#ebe8cf','#71602f','<path d="M96 148h132M108 148v-35h25v35m17 0V94h25v54m17 0V73h25v75M107 92l49-24 38-25m-24 0h24v23"/>'],
 mind: ['#eae2ef','#744d7e','<path d="M150 153H112v-28l-17-5 13-27c1-29 25-49 54-49 34 0 57 24 57 57 0 21-9 35-25 47v18m-38-78c-8-17-31-10-30 7 1 13 20 25 30 31 10-6 29-18 30-31 1-17-22-24-30-7z"/>'],
 life: ['#dfead3','#42703b','<path d="M161 157V102m0 20c-38 0-64-22-64-63 42 0 64 19 64 63zm0-13c0-37 26-58 67-58 0 38-27 58-67 58zm-36 52h72"/>'],
 logic: ['#e6e1ef','#564d85','<rect x="95" y="42" width="48" height="38" rx="6"/><rect x="182" y="42" width="48" height="38" rx="6"/><rect x="138" y="128" width="48" height="38" rx="6"/><path d="M119 80v22h87V80m-44 22v26m-10-15 10 15 10-15"/>']
};
const TOPIC_ILLUSTRATIONS = {
 '醫療與健康':'health','環境與自然':'earth','科技與工程':'technology',
 '日常生活與實用技能':'food','生活與食品':'food','藝術與歷史':'history','文化與歷史':'history',
 '人文':'history','社會與公共政策':'society','經濟與財政':'finance','商業與經濟':'finance',
 '心理學與人類行為':'mind','生命科學':'life','邏輯學':'logic'
};
// Original editorial motifs keyed to the source article, not photographs of events.
const ARTICLE_ART = new Map([
 ['ey:eb1d2b2d-ef21-4e57-83fc-4d8765a4bfd5',['rail','']],
 ['ey:92740cf4-2585-4cc7-8593-d6d9ffd90f9b',['society','<path d="M160 65c-14-14-30 1 0 24 30-23 14-38 0-24zM242 106v51m0-51c0-13 18-13 18 0"/>']],
 ['knowledge:quake',['earth','<path d="M66 122h41l13-13 13 25 21-62 22 75 14-25h68M91 164h144"/><circle cx="232" cy="58" r="16"/>']],
 ['knowledge:quake2',['earth','<path d="M78 142h172m-147 0V89h43v53m13 0V67h53v75m-86-40h7m49-16h8m-8 20h8M81 162l25-9 25 9 26-9 26 9 25-9 26 9"/>']],
 ['knowledge:food',['food','<rect x="103" y="45" width="115" height="114" rx="12"/><path d="M103 95h115m-98-31v16m0 33v20m44-19v30m-13-22 26 15m0-15-26 15"/>']],
 ['curated:hpa',['health','']],
 ['curated:eq36',['earth','<path d="M74 153h180M93 138v-19h22v19m13 0v-40h22v40m13 0V76h22v62m13 0V53h22v85M86 83l15-12 14 12 17-19"/>']],
 ['curated:finance',['finance','<rect x="92" y="43" width="65" height="114" rx="12"/><path d="M110 111V78m9 33V78m10 33V78m10 33V78m32 24h24m-7-7 7 7-7 7m20-26 25-13 25 13v39h-50zM220 122v-23m13 23V99m13 23V99"/>']],
 ['curated:fapp',['finance','<rect x="119" y="37" width="84" height="128" rx="13"/><path d="M134 66h54m-45 20h36m-38 35 13 13 25-27m-23 46h11M223 54l13-13m-8 32h19M96 57 84 44m8 33H74"/>']],
 ['curated:env',['life','<path d="M161 48v91m-47 0h94m-73-73h52m-52 0-26 43h52zm52 0-25 43h50zM192 54c13-24 31-24 50-22-10 24-24 31-45 29"/>']],
 ['curated:env2',['life','<path d="M98 81h64l11 17v53H90V98zm6-25h51v25m33 28 33-17 32 17v20c0 21-14 34-32 43-18-9-33-22-33-43zm18 21 10 10 20-22"/>']],
 ['library:cpi',['finance','<path d="M77 112l47-44 47 44m-79-14v55h64v-55m-25 55v-28h-17v28m62 0h78m-65-8 15-28 19 9 24-39m-13 0h13v13"/>']],
 ['library:stress',['mind','<path d="M88 108c18-33 38-33 56 0s38 33 56 0 38-33 56 0M99 132c14-19 29-19 43 0s31 19 45 0m17-67 12-19m7 33 24-5M118 63l-12-14"/>']],
 ['library:alcohol',['mind','<path d="M100 55h53l-8 32c-4 12-12 17-19 17s-15-5-19-17zm26 49v34m-19 0h38m48-50c-13-19-37-4-32 15 3 14 20 25 32 34 14-9 31-20 34-34 5-19-19-34-34-15z"/>']],
 ['library:lang',['history','<path d="M84 55h100v63h-52l-26 21v-21H84zm101 33h55v51h-19v18l-23-18h-35v-12m-61-51h61m-61 19h40m47 22h32"/>']],
 ['library:archive',['history','<path d="M85 87h153v67H85zM78 71h167v19H78zm56 38h55v24h-55zM110 61V49h102v12m-59 62h16"/>']],
 ['library:housing',['society','<path d="M79 105l45-43 45 43m-77-12v63h63V93m-39 63v-35h17v35m40-61 37-34 38 34m-66-10v71h57V85m-33 71v-39h13v39"/>']],
 ['library:mydata',['technology','<rect x="99" y="47" width="114" height="112" rx="10"/><path d="M122 72h67m-67 22h43m-43 23h30m18 16 12 12 22-26m-66-72V35h38v12"/>']],
 ['library:tech',['technology','<path d="M117 72l-34 33 34 33m87-66 34 33-34 33m-24-82-35 98"/><circle cx="161" cy="45" r="10"/><circle cx="161" cy="163" r="10"/>']],
 ['library:tsunami',['earth','<path d="M75 132c29 0 45-35 63-56 28-33 71-19 73 13-20-13-46-6-49 17-3 28 53 31 85 31M76 155h172m-120-5 20-19m5 19 20-15"/>']],
 ['library:gastro',['life','<path d="M132 59c1 25 7 31 21 30 18-2 24-22 41-14 34 17 29 66-4 79-37 15-75-5-76-36 0-16 11-23 14-33 3-9 4-17 4-26z"/><circle cx="222" cy="67" r="11"/><path d="M222 51v-6m0 44v-6m-16-16h-6m44 0h-6"/>']],
 ['library:logic',['logic','']],
 ['ey:d6716352-809b-48b5-a600-da100e7c5de0',['earth','<path d="M86 119h148l-22 28H111zm29 0V87h78v32m-53-32V66h27v21m-13-21V49m-69 115c15-13 29 13 44 0s29 13 44 0 29 13 44 0 29 13 44 0"/>']],
 ['nasa:60000835',['technology','<circle cx="210" cy="70" r="28"/><path d="M85 149c19-34 45-56 78-70l12 12c-14 33-37 60-71 79zm17-11-17-6-18 25 20-3m28 3 6 16-25 16 4-19m53-72 20 20m-40 1 14 14"/>']],
 ['moda:21226',['technology','<rect x="105" y="45" width="112" height="114" rx="11"/><path d="M126 69h68m-68 19h50m-50 20h40m21 24 13-13 13 13-13 18z"/>']]
]);
function articleArtwork(a) {
 const topic=topicOf(a);
 const [key,custom]=ARTICLE_ART.get(a.id)||[
   /鐵道|鐵路/.test(a.title)?'rail':Object.hasOwn(TOPIC_ILLUSTRATIONS,topic)?TOPIC_ILLUSTRATIONS[topic]:'society',
   ''
 ];
 const [background,ink,defaultArt]=ILLUSTRATIONS[key];
 return {background,ink,artwork:custom||defaultArt,tailored:ARTICLE_ART.has(a.id)};
}
function imageMarkup(a,cls='card-art'){
 const image=safeUrl(a.image_url), source=safeUrl(a.url), license=safeUrl(a.image_license_url);
 const original=image&&source&&a.image_rights==='approved';
 const {background,ink,artwork,tailored}=articleArtwork(a);
 const generated=a.id==='curated:hpa';
 const illustration=`<div class="topic-art" ${original?'hidden':''} style="--art-bg:${background};--art-ink:${ink}">
   <div class="illustration-frame"><svg viewBox="0 0 324 204" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
     <circle cx="162" cy="102" r="88" fill="currentColor" opacity=".09"/>
     <path d="M47 127v-12m-6 6h12m223-66v-12m-6 6h12m-221 97h23m190-35h-18" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>
     <g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${artwork}</g>
   </svg>${generated?`<img class="generated-illustration" src="./art/preventive-checkup.webp" alt="血壓計、聽診器與健康檢查表插圖" loading="${cls==='reader-cover'?'eager':'lazy'}">`:''}</div>
   <span class="visual-label">${tailored?'文章插圖':'主題插圖'}</span></div>`;
 const photo=original?`<a class="official-photo" href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="開啟官方原文及配圖">
   <img src="${esc(image)}" alt="${esc(a.image_alt||a.title)}" loading="${cls==='reader-cover'?'eager':'lazy'}" referrerpolicy="no-referrer">
   <span class="visual-label">官方原圖 ↗</span></a>`:'';
 const credit=original&&cls==='reader-cover'?`<p class="photo-credit meta">圖片來源：${esc(a.image_credit||a.source)} · ${license?`<a href="${esc(license)}" target="_blank" rel="noopener noreferrer">${esc(a.image_license)}</a>`:esc(a.image_license||'已核對授權')}</p>`:'';
 return `<div class="article-visual"><div class="${cls}">${photo}${illustration}</div>${credit}</div>`;
}
document.addEventListener('error',event=>{
 if(event.target.classList?.contains('generated-illustration')){
   event.target.remove();
   return;
 }
 const photo=event.target.closest?.('.official-photo');
 if(!photo)return;
 photo.parentElement.querySelector('.topic-art').hidden=false;
 photo.closest('.article-visual').querySelector('.photo-credit')?.remove();
 photo.remove();
},true);
function quizData(a){return a.quiz_reviewed===true&&Array.isArray(a.quiz)&&a.quiz.length>0&&a.quiz.every(q=>q.question&&Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length&&q.explanation)?a.quiz:null}
function awards(){const r=Object.values(state.quizResults||{}),perfect=r.filter(x=>x.score===x.total).length;return {xp:r.reduce((s,x)=>s+x.score*20+10,0),completed:r.length,perfect}}
function article(a){const saved=state.saved.includes(a.url),read=state.read.includes(a.url);return `<article class="card">${imageMarkup(a)}<div class="card-body"><div class="meta">${a.demo?'【原創示範】 ':''}${esc(a.category)} · ${esc(a.source)} · ${a.kind==='knowledge'?'知識專題':esc(date(a.published_at))}</div><h3>${esc(a.title)}</h3>${quizData(a)?'<div class="meta">附知識挑戰</div>':''}${readingStatus(a)?`<div class="meta">${esc(readingStatus(a))}</div>`:""}<p>${esc(a.translation_zh_hant||a.excerpt_original||'官方來源目前只提供標題，尚無可展示的內文。')}</p><div class="actions"><button class="btn primary" data-open="${esc(a.url)}">開始閱讀 →</button><button class="btn" data-save="${esc(a.url)}">${saved?'★ 已收藏':'☆ 收藏'}</button>${read?'<span class="meta">✓ 已閱讀</span>':''}</div></div></article>`}
function reader(a){
 const parts=originalParts(a);
 const translations=Array.isArray(a.evidence_zh_hant)?a.evidence_zh_hant:[];
 const nativeChinese=a.translation_status==='original_zh_hant';
 const translated=!nativeChinese&&hasChinese(a,parts);
 const license=safeUrl(a.license_url);
 const source=safeUrl(a.url)||'#';
 const status=nativeChinese?'官方繁中原文':a.translation_status==='human_reviewed_demo'?'原創示範文章：已提供編輯對照譯文':a.translation_status==='translated_editorial'?'Daily Insight 繁中翻譯':translated?'已產生機器翻譯（未經人工校對）':a.translation_status==='translation_pending'?'背景翻譯尚未完成':a.translation_status?.startsWith('provider_error')?'背景翻譯失敗：'+a.translation_status:'目前沒有中文翻譯：'+(a.translation_status||'未知');
 const compare=translated&&state.mode==='both';
 const displayParts=translated&&state.mode==='zh'?translations:parts;
 const panels=parts.length?displayParts.map((part,i)=>{
   const target=`id="article-paragraph-${i+1}" tabindex="-1"`;
   if(!compare)return `<p class="reader-text" ${target}>${esc(part)}</p>`;
   return `<div class="evidence-row compare" ${target}>
     <div class="evidence-zh"><div class="kicker">繁體中文 · 段落 ${i+1}</div><p class="reader-text">${esc(translations[i])}</p></div>
     <div class="evidence-original"><div class="kicker">原始資料 · 段落 ${i+1}</div><p class="reader-text">${esc(part)}</p></div>
   </div>`;
 }).join(''):'<div class="notice">此官方來源沒有提供可用的內文。系統不會自行編造。</div>';
 const quiz=quizData(a), result=(state.quizResults||{})[a.id||a.url];
 const quizHtml=quiz?`<section class="quiz-panel" id="knowledge-quiz"><div class="kicker">LEARN & LEVEL UP</div><h3>🧠 閱讀後的知識挑戰</h3><p>題目取自本篇文章。提交後可核對答案、閱讀解說，並回到相關原文段落。</p>${result?`<div class="notice">🏆 已完成：${result.score}/${result.total} 題正確，獲得 ${result.score*20+10} XP。<button class="btn" data-quiz-reset="${esc(a.id||a.url)}">重新挑戰</button></div><div class="quiz-feedback">${quiz.map((q,i)=>{
 const choice = result.answers?.[i];
 const selected = Number.isInteger(choice) && q.options[choice] !== undefined;
 const paragraph = Number.isInteger(q.paragraph) && q.paragraph >= 1 && q.paragraph <= parts.length ? q.paragraph : null;
 return `<div><p><strong>${i+1}. ${esc(q.question)}</strong></p>
   ${selected ? `<p>你的答案：${esc(q.options[choice])}（${choice===q.answer?'答對':'答錯'}）</p>` : ''}
   <p>正確答案：${esc(q.options[q.answer])}<br>${esc(q.explanation)}</p>
   ${paragraph ? `<button class="btn" data-quiz-paragraph="${paragraph}">查看原文第 ${paragraph} 段</button>` : ''}</div>`;
 }).join('')}</div>`:`${quiz.map((q,i)=>`<fieldset class="quiz-question"><legend>${i+1}. ${esc(q.question)}</legend>${q.options.map((o,j)=>`<label class="quiz-choice"><input type="radio" name="quiz-${i}" value="${j}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}<button class="btn primary" data-quiz-submit="${esc(a.id||a.url)}">提交答案，領取 XP</button><div id="quiz-feedback" aria-live="polite"></div>`}</section>`:`<div class="notice">本篇尚無經過內容審核的專屬測驗，為避免虛構題目，暫不提供挑戰。</div>`;
 return `<section class="reader"><button class="back" data-back="1">← 返回探索</button><div class="kicker">${esc(a.category)} / ${esc(a.source)}</div><h2>${esc(a.title)}</h2>${a.demo?'<div class="notice">此為原創雙語教學示範，不是即時新聞；部署並更新後才會有官方來源內容。</div>':''}${imageMarkup(a,"reader-cover")}<div class="statsline">${a.kind==='knowledge'?'知識專題':`發布：${esc(date(a.published_at))}`} · 來源網域已核對 · 主張未獨立查證</div><div class="notice"><strong>內容範圍：</strong>${a.demo?'Daily Insight 原創教學示範全文（非官方新聞）':hasApprovedFullText(a)?'已核准重製的官方全文':a.content_scope==='official_article_extracted'?'已擷取官方文章正文，但尚未確認完整性或授權':'官方來源摘要或部分內文，並非全文'}。未確認可合法重製的文章不提供全文。<br><strong>翻譯狀態：</strong>${esc(status)}。${nativeChinese?'': '翻譯可能有誤，請以原文為準。'}${license?`<br><strong>全文授權：</strong><a href="${esc(license)}" target="_blank" rel="noopener noreferrer">${esc(a.license_name)}</a>` : ''}</div>${translated?`<div class="filters" style="margin-top:20px"><button class="mode ${state.mode==='zh'?'active':''}" data-mode="zh">繁體中文</button><button class="mode ${state.mode==='both'?'active':''}" data-mode="both">逐段對照</button><button class="mode ${state.mode==='original'?'active':''}" data-mode="original">原文</button></div>`:""}<div class="${compare?'evidence-list':'article-prose'}">${panels}</div><div class="notice"><strong>來源與驗證：</strong>本文文字來自${a.demo?'Daily Insight 原創示範':(hasApprovedFullText(a)||a.content_scope==='official_article_extracted')?'官方文章頁面':'發布者提供的 RSS'}。來源網域檢查不等於事實已查證。若要取得完整全文，必須確認該來源的授權及全文存取方式。</div>${editorialReason(a)&&!(hasApprovedFullText(a)&&translated)?`<div class="notice">重要例外 · ${esc(editorialReason(a))}</div>`:""}${quizHtml}<div class="actions"><a class="btn primary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">查閱官方原始文件 ↗</a><button class="btn" data-save="${esc(a.url)}">${state.saved.includes(a.url)?'★ 已收藏':'☆ 收藏'}</button><button class="btn" data-read="${esc(a.url)}">${state.read.includes(a.url)?'✓ 已閱讀':'完成閱讀'}</button></div></section>`;
}
const TOPICS = new Map([
 ['醫療與健康', ['健康與醫學常識', '醫療與健康']],
 ['環境與自然', ['環境與自然', '地球科學', '水利與工程']],
 ['科技與工程', ['AI與科技', '通訊與防災', '軟體與開源']],
 ['生活與食品', ['食品與生活', '生活與食品']],
 ['文化與歷史', ['文化與歷史']],
 ['社會與公共政策', ['社會與長照', '居住與公共服務', '國際政治與全球趨勢']]
]);
const KNOWLEDGE_TOPICS = new Map([
 ['日常生活與實用技能', ['食品與生活', '生活與食品']],
 ['商業與經濟', ['經濟與財政']],
 ['心理學與人類行為', []],
 ['人文', []],
 ['藝術與歷史', ['文化與歷史']],
 ['生命科學', []],
 ['邏輯學', []],
 ...[...TOPICS].filter(([topic]) => !['生活與食品', '文化與歷史'].includes(topic))
]);
function topicOf(article) {
 const topics = article.kind === 'knowledge' ? KNOWLEDGE_TOPICS : TOPICS;
 return [...topics].find(([topic, categories]) => topic === article.category || categories.includes(article.category))?.[0] || article.category || '其他';
}
function dailyKnowledge(items, now = Date.now()) {
 const groups = new Map();
 for (const a of homepageArticles(items)) {
   if (a.kind !== 'knowledge') continue;
   const topic = topicOf(a);
   if (!groups.has(topic)) groups.set(topic, []);
   groups.get(topic).push(a);
 }
 const topics = [...groups.keys()];
 if (!topics.length) return null;
 const day = Math.floor((now + 8 * 3600000) / 86400000);
 const topic = topics[day % topics.length];
 const articles = groups.get(topic);
 return {topic, article: articles[Math.floor(day / topics.length) % articles.length]};
}
function explore(items) {
 const isKnowledge = state.page === 'knowledge';
 const title = isKnowledge ? '知識' : '新聞';
 const selected = homepageArticles(items).filter(a => (a.kind === 'knowledge') === isKnowledge);
 const topics = ['全部', '有測驗', ...new Set([...(isKnowledge ? KNOWLEDGE_TOPICS : TOPICS).keys(), ...selected.map(topicOf)])];
 const visible = selected.filter(a => state.filter === '全部' ||
   (state.filter === '有測驗' ? quizData(a) : topicOf(a) === state.filter));
 const today = state.filter === '全部' ? dailyKnowledge(items) : null;
 const bad = Object.entries(state.meta?.sources || {}).filter(([, status]) => status.status !== 'ok');
 const controls = `<div class="sectionhead"><h2 id="explore-title">${title}</h2><span class="meta">${visible.length} 篇</span></div>
   <p class="meta">${isKnowledge ? '科普、生活指南與長期可查閱的專題解說。' : `台灣與國際時事、官方公告與政策進展。新聞更新：${esc(date(state.meta?.updated_at))}`}</p>
   <div class="filters explore-topics" aria-label="${title}主題分類">${topics.map(topic =>
     `<button class="filter ${state.filter === topic ? 'selected' : ''}" data-filter="${esc(topic)}" aria-pressed="${state.filter === topic}">${esc(topic)}</button>`).join('')}</div>`;
 const content = `<section class="explore-section" aria-labelledby="explore-title">
   ${!isKnowledge && bad.length ? `<div class="notice">部分來源更新異常：${bad.map(([key]) => esc(key)).join('、')}。不以虛構資料填補。</div>` : ''}
   ${today ? `<div class="notice"><strong>今日知識 · ${esc(today.topic)}</strong><p>${esc(today.article.title)}</p><button class="btn primary" data-open="${esc(today.article.url)}">閱讀今日知識</button></div>` : ''}
   ${visible.length ? `<div class="grid">${visible.map(article).join('')}</div>` : '<p class="empty">此分類目前沒有符合刊登條件的文章。</p>'}
 </section>`;
 return {controls, content};
}
function render(){document.querySelector('#streak').textContent=`已讀 ${state.read.length} 篇`;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));const main=document.querySelector('#main');const toolbar=document.querySelector('#explore-toolbar');const filterOffset=toolbar.dataset.page===state.page?(toolbar.querySelector('.explore-topics')?.scrollLeft||0):0;toolbar.innerHTML='';if(state.selected){const a=state.news.find(x=>x.url===state.selected);if(a){main.innerHTML=reader(a);return}state.selected=null}const n=state.news;if(state.page==='news'||state.page==='knowledge'){
 const {controls, content}=explore(n);
 toolbar.dataset.page=state.page;
 toolbar.innerHTML=controls;
 toolbar.querySelector('.explore-topics').scrollLeft=filterOffset;
 main.innerHTML=content;
}
else if(state.page==='saved'){const a=n.filter(x=>state.saved.includes(x.url));main.innerHTML=`<div class="sectionhead"><h2>我的收藏書架</h2></div>${a.length?`<div class="grid">${a.map(article).join('')}</div>`:'<div class="empty">尚未收藏文章。看到喜歡的主題時，按下「收藏」即可。</div>'}`}
else if(state.page==='stats'){const aw=awards();main.innerHTML=`<div class="sectionhead"><h2>學習足跡</h2><button class="btn primary" data-challenges="1">開始知識挑戰</button></div><div class="grid"><div class="card"><div class="card-body"><div class="stat">${state.read.length}</div><p>已閱讀篇數</p></div></div><div class="card"><div class="card-body"><div class="stat">${state.saved.length}</div><p>收藏文章數</p></div></div></div><div class="badge-grid"><div class="badge-card">🏆 <strong>${aw.xp} XP</strong><small>知識經驗值</small></div><div class="badge-card">📖 <strong>${aw.completed} 篇</strong><small>挑戰完成</small></div><div class="badge-card">⭐ <strong>${aw.perfect} 篇</strong><small>滿分達成</small></div><div class="badge-card ${aw.completed>=1?'unlocked':'locked'}">🏅 <strong>初次探索</strong><small>完成首次挑戰</small></div><div class="badge-card ${aw.perfect>=3?'unlocked':'locked'}">🏅 <strong>理解達人</strong><small>三次滿分</small></div><div class="badge-card ${aw.completed>=5?'unlocked':'locked'}">🏅 <strong>閱讀冒險家</strong><small>完成五篇挑戰</small></div></div><div class="notice">紀錄保存在目前的瀏覽器，不會跨裝置同步。已閱讀不等於完成事實核查。</div>`}
else main.innerHTML=`<div class="sectionhead"><h2>我們如何對待資訊</h2></div><div class="notice">從核准的官方來源取得第一手資料。經核對授權的繁中內容可完整閱讀，並附原始發布頁與授權連結。知識專題須經獨立閱讀審核，正文應涵蓋主題所需內容，原站附件或圖表只能作為補充。文章須先交代核心概念，再按讀者能理解的順序說明。表格資料須保留欄位與數值的對應，純欄位清單或發布規格不作為知識文章。網域核對不能證明所有主張正確；正式新聞翻譯由 GitHub Actions 背景執行，可能因模型或資源限制失敗，不能保證完全準確。無摘要或無翻譯時明確標示，不捏造。完整轉載須確認授權。</div>`}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.challenges){state.page='knowledge';state.filter='有測驗';state.selected=null;render()}else if(b.dataset.page){state.page=b.dataset.page;state.filter='全部';state.selected=null;render()}else if(b.dataset.filter){state.filter=b.dataset.filter;render()}else if(b.dataset.open){state.selected=b.dataset.open;state.mode='zh';render();window.scrollTo(0,0)}else if(b.dataset.back){state.selected=null;render()}else if(b.dataset.mode){state.mode=b.dataset.mode;render()}else if(b.dataset.save){state.saved=state.saved.includes(b.dataset.save)?state.saved.filter(x=>x!==b.dataset.save):[...state.saved,b.dataset.save];persist();render()}else if(b.dataset.quizReset){delete state.quizResults[b.dataset.quizReset];persist();render()}
else if(b.dataset.quizParagraph){
 const paragraph=document.getElementById('article-paragraph-'+b.dataset.quizParagraph);
 paragraph?.focus({preventScroll:true});
 paragraph?.scrollIntoView({block:'center'});
}
else if(b.dataset.quizSubmit){
 const a=state.news.find(x=>(x.id||x.url)===b.dataset.quizSubmit),quiz=a&&quizData(a);if(!quiz)return;
 const choices=quiz.map((_,i)=>document.querySelector(`input[name="quiz-${i}"]:checked`));
 if(choices.some(x=>!x)){document.querySelector('#quiz-feedback').textContent='請先回答全部題目。';return}
 const answers=choices.map(choice=>Number(choice.value));
 const score=quiz.filter((q,i)=>answers[i]===q.answer).length;
 state.quizResults[a.id||a.url]={score,answers,total:quiz.length,completedAt:new Date().toISOString()};persist();render();
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
   readNews(LIVE_DATA + '?refresh=' + Date.now()).catch(() => readNews(DATA)),
   readNews('./data/taiwan.json')
 ]);
 const sources = {...daily.value?.sources};
 if (daily.status === 'rejected') sources.fetch = {status: 'error'};
 if (taiwan.status === 'rejected') sources['台灣全文'] = {status: 'error'};
 state.meta = {updated_at: daily.value?.updated_at, sources};
 const combined = [...(daily.value?.items || []), ...(taiwan.value?.items || [])]
   .filter(a => safeUrl(a.url) && a.verification === 'publisher_domain_checked');
 state.news = [...new Map(combined.map(a => [a.url, a])).values()];
 render();
})();
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
