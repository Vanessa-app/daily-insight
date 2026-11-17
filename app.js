 'use strict';
const KEY='daily-insight-v1.8';
const DATA_SOURCES = [
 {key:'daily', file:'news.json', label:'新聞資料', backup:true},
 {key:'taiwan', file:'taiwan.json', label:'台灣全文'},
 {key:'catalog', file:'catalog.json', label:'知識與媒體資料', backup:true}
];
const articleData = new Map();
const failedData = new Set();
const RAW_DATA = 'https://raw.githubusercontent.com/Vanessa-app/daily-insight/main/data/';
const state={page:'news',filter:'全部',news:[],meta:null,selected:null,mode:'zh',saved:[],read:[],quizResults:{},...load()};
let explorationScroll = 0;
state.shelf='recommended';
let lastRefresh=0, refreshPending=false;
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
function isTextEdition(a){return a.content_scope==='licensed_text_edition'&&a.reuse_license==='approved'&&a.standalone_text_checked===true&&hasChinese(a)}
function isMedia(a){return a.kind==='news'&&['media_headline','media_rss_excerpt'].includes(a.content_scope)}
function homepageArticles(items) {
 const eligible = items.filter(a => a.kind !== 'knowledge' || a.standalone_reviewed === true || isTextEdition(a));
 const byDate = (a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0);
 const primary = eligible.filter(a => !a.demo && ((hasApprovedFullText(a) && hasChinese(a)) || isTextEdition(a))).sort(byDate);
 const exceptions = eligible.filter(a => editorialReason(a) && !(hasApprovedFullText(a) && hasChinese(a))).sort(byDate);
 const media=eligible.filter(a=>isMedia(a)&&safeUrl(a.url)).sort(byDate);
 return [...primary,...exceptions,...media];
}
function readingStatus(a) {
 if(isMedia(a))return a.content_scope==='media_rss_excerpt'?'媒體 RSS 摘要 · 全文於原站閱讀':'媒體標題索引 · 原站閱讀';
 if(isTextEdition(a))return '開放授權百科文字版 · 繁體中文';
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
const GENERATED_ART = new Map([
 ["curated:hpa", ["preventive-checkup", "血壓計、聽診器與健康檢查表插圖"]],
 ["ey:eb1d2b2d-ef21-4e57-83fc-4d8765a4bfd5", ["railway-museum", "歷史鐵道工場內的退役列車與保存紀錄"]],
 ["ey:92740cf4-2585-4cc7-8593-d6d9ffd90f9b", ["elder-welfare", "長者在服務櫃檯諮詢，旁邊有福利與經費文件"]],
 ["knowledge:quake", ["quake-magnitude", "地下斷層釋放震波，地震儀記下波形"]],
 ["knowledge:quake2", ["quake-impact", "同一次地震對兩處不同地盤與建物造成不同影響"]],
 ["knowledge:food", ["frozen-food", "冷凍櫃內的密封食物與一旁的保冷提袋"]],
 ["curated:eq36", ["quake-intensity", "吊燈、餐具與椅子隨地面搖晃的室內情境"]],
 ["curated:finance", ["cloud-receipt", "手機條碼、雲端發票與匯入銀行帳戶的示意"]],
 ["curated:fapp", ["receipt-app", "用手機檢查發票中獎結果的示意"]],
 ["curated:env", ["carbon-fee", "委員對照排放與費率資料討論，旁有工廠情境"]],
 ["curated:env2", ["approved-products", "網購環境用藥時檢查產品核准標示的示意"]],
 ["library:cpi", ["cpi-housing", "購物籃、租金憑據和房屋買賣契約並列"]],
 ["library:stress", ["stress-response", "放下手機通知，與陪伴者一起平復情緒"]],
 ["library:alcohol", ["alcohol-family", "把酒杯放到一旁的家人對話情境"]],
 ["library:lang", ["taiwan-languages", "不同世代交流，並以手語溝通的情境"]],
 ["library:archive", ["national-archives", "檔案管理人員保存紙本紀錄與古地契"]],
 ["library:housing", ["social-housing", "社會住宅住戶簽租約並領取鑰匙的情境"]],
 ["library:mydata", ["mydata-certificate", "在家透過電腦同意帶入身分資料並申請文件"]],
 ["library:tech", ["public-code", "居民與公部門開發人員一起討論公共服務程式"]],
 ["library:tsunami", ["tsunami-origin", "海床位移推動上方水體，長浪向海岸傳播"]],
 ["library:gastro", ["gastro-transmission", "食物、手部接觸與不同微生物的示意"]],
 ["library:logic", ["logic-sentences", "用陳述卡片和疑問泡泡區分句子是否可判真偽"]],
 ["nasa:60000835", ["artemis-moon", "月球上方的太空船與遠處地球的概念插畫"]],
 ["adi:21252", ["digital-certificate", "電子簽章主題插畫：電腦上的數位憑證與簽署驗證"]],
 ["moda:21226", ["digital-certificate", "電腦上的數位憑證與新舊金鑰替換示意"]],
 ["ey:d6716352-809b-48b5-a600-da100e7c5de0", ["coast-patrol", "沿岸巡邏船、瞭望與海上救援設備"]],
]);
function imageMarkup(a,cls='card-art'){
 const image=safeUrl(a.image_url), source=safeUrl(a.url), license=safeUrl(a.image_license_url);
 const original=image&&source&&a.image_rights==='approved';
 const {background,ink,artwork,tailored}=articleArtwork(a);
 const generated=GENERATED_ART.get(a.id);
 const illustration=`<div class="topic-art" ${original?'hidden':''} style="--art-bg:${background};--art-ink:${ink}">
   <div class="illustration-frame${generated?' has-generated':''}"><svg viewBox="0 0 324 204" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
     <circle cx="162" cy="102" r="88" fill="currentColor" opacity=".09"/>
     <path d="M47 127v-12m-6 6h12m223-66v-12m-6 6h12m-221 97h23m190-35h-18" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/>
     <g fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${artwork}</g>
   </svg>${generated?`<img class="generated-illustration" src="./art/${generated[0]}.webp" alt="${esc(generated[1])}" loading="${cls==='reader-cover'?'eager':'lazy'}">`:''}</div>
   <span class="visual-label">${generated?'AI 文章插圖':tailored?'文章插圖':'主題插圖'}</span></div>`;
 const photo=original?`<a class="official-photo" href="${esc(source)}" target="_blank" rel="noopener noreferrer" aria-label="開啟官方原文及配圖">
   <img src="${esc(image)}" alt="${esc(a.image_alt||a.title)}" loading="${cls==='reader-cover'?'eager':'lazy'}" referrerpolicy="no-referrer">
 </a>`:'';
 const credit=original&&cls==='reader-cover'?`<p class="photo-credit meta">圖片來源：${esc(a.image_credit||a.source)} · ${license?`<a href="${esc(license)}" target="_blank" rel="noopener noreferrer">${esc(a.image_license)}</a>`:esc(a.image_license||'已核對授權')}</p>`:'';
 return `<div class="article-visual"><div class="${cls}">${photo}${illustration}</div>${credit}</div>`;
}
document.addEventListener('error',event=>{
 if(event.target.classList?.contains('generated-illustration')){
   event.target.parentElement.classList.remove('has-generated');
   event.target.remove();
   return;
 }
 const photo=event.target.closest?.('.official-photo');
 if(!photo)return;
 photo.parentElement.querySelector('.topic-art').hidden=false;
 photo.closest('.article-visual').querySelector('.photo-credit')?.remove();
 photo.remove();
},true);
function quizData(a){
 if(!Array.isArray(a.quiz)||!a.quiz.length)return null;
 const valid=a.quiz.every(q=>q&&q.question&&Array.isArray(q.options)&&q.options.length>=2&&Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length&&q.explanation);
 if(!valid)return null;
 if(a.quiz_reviewed===true)return a.quiz;
 return a.quiz_origin==='source_grounded_recall'&&a.quiz.every(q=>typeof q.supporting_quote==='string'&&q.supporting_quote.length>0&&originalParts(a)[q.paragraph-1]?.includes(q.supporting_quote)&&q.options[q.answer]===q.supporting_quote)?a.quiz:null;
}
function awards(){const r=Object.values(state.quizResults||{}),perfect=r.filter(x=>x.score===x.total).length;return {xp:r.reduce((s,x)=>s+x.score*20+10,0),completed:r.length,perfect}}
function hasHeadlineSupplements(article) {
 const supplement = readerSupplements[article.id];
 return Boolean(supplement?.context?.length || supplement?.related?.length
   || reviewedNewsEvents.some(([,ids]) => ids.includes(article.id))
   || reviewedReadingTopics.some(([,ids]) => ids.includes(article.id)));
}

function article(a){const saved=state.saved.includes(a.url),read=state.read.includes(a.url);return `<article class="card">${imageMarkup(a)}<div class="card-body"><div class="meta">${a.demo?'【原創示範】 ':''}${esc(a.category)} · ${esc(a.source)}${a.byline?` / ${esc(a.byline)}`:''} · ${a.kind==='knowledge'?'知識專題':esc(date(a.published_at))}</div><h3>${esc(a.title)}</h3>${quizData(a)?'<div class="meta">附知識挑戰</div>':''}${readingStatus(a)?`<div class="meta">${esc(readingStatus(a))}</div>`:""}<p>${esc(a.translation_zh_hant||a.excerpt_original||(isMedia(a)?'此篇採標題索引，請前往來源網站閱讀全文。':'來源目前沒有提供可展示的內文。'))}</p><div class="actions">${isMedia(a)&&a.content_scope==='media_headline'?`<a class="btn primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">來源閱讀 ↗</a>${hasHeadlineSupplements(a)?`<button class="btn" data-open="${esc(a.url)}">查看延伸資訊</button>`:""}<button class="btn" data-read="${esc(a.url)}">${read?'✓ 已閱讀':'標記已讀'}</button>`:`<button class="btn primary" data-open="${esc(a.url)}">${isMedia(a)?'查看摘要 →':'開始閱讀 →'}</button>`}<button class="btn" data-save="${esc(a.url)}">${saved?'★ 已收藏':'☆ 收藏'}</button>${read?'<span class="meta">✓ 已閱讀</span>':''}</div></div></article>`}
function reader(a){
 const parts=originalParts(a);
 const translations=Array.isArray(a.evidence_zh_hant)?a.evidence_zh_hant:[];
 const nativeChinese=a.translation_status==='original_zh_hant';
 const translated=!nativeChinese&&hasChinese(a,parts);
 const license=safeUrl(a.license_url);
 const source=safeUrl(a.url)||'#';
 const status=nativeChinese?'繁體中文原文／文字用語轉換':a.translation_status==='human_reviewed_demo'?'原創示範文章：已提供編輯對照譯文':a.translation_status==='translated_editorial'?'Daily Insight 繁中翻譯':translated?'已產生機器翻譯（未經人工校對）':a.translation_status==='translation_pending'?'背景翻譯尚未完成':a.translation_status?.startsWith('provider_error')?'背景翻譯失敗：'+a.translation_status:'目前沒有中文翻譯：'+(a.translation_status||'未知');
 const compare=translated&&state.mode==='both';
 const displayParts=translated&&state.mode==='zh'?translations:parts;
 const panels=parts.length?displayParts.map((part,i)=>{
   const target=`id="article-paragraph-${i+1}" tabindex="-1"`;
   if(!compare&&isTextEdition(a)&&/^=+/.test(part))return `<h3 ${target}>${esc(part.replace(/^=+\s*|\s*=+$/g,''))}</h3>`;
   if(!compare)return `<p class="reader-text" ${target}>${esc(part)}</p>`;
   return `<div class="evidence-row compare" ${target}>
     <div class="evidence-zh"><div class="kicker">繁體中文 · 段落 ${i+1}</div><p class="reader-text">${esc(translations[i])}</p></div>
     <div class="evidence-original"><div class="kicker">原始資料 · 段落 ${i+1}</div><p class="reader-text">${esc(part)}</p></div>
   </div>`;
 }).join(''):a.content_scope==='media_headline'
  ? `<div class="notice">這篇新聞為標題索引。<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">前往來源閱讀全文 ↗</a></div>`
  : '<div class="notice">此官方來源沒有提供可用的內文。系統不會自行編造。</div>';
 const quiz=quizData(a), result=(state.quizResults||{})[a.id||a.url];
 const quizHtml=quiz?`<section class="quiz-panel" id="knowledge-quiz"><div class="kicker">LEARN & LEVEL UP</div><h3>🧠 閱讀後的知識挑戰</h3><p>${a.quiz_origin==='source_grounded_recall'?'本篇為自動原文核對題，用於重點回憶，尚非人工審核的深度理解測驗。':'題目取自本篇文章。'}提交後可核對答案、閱讀解說，並回到相關原文段落。</p>${result?`<div class="notice">🏆 已完成：${result.score}/${result.total} 題正確，獲得 ${result.score*20+10} XP。<button class="btn" data-quiz-reset="${esc(a.id||a.url)}">重新挑戰</button></div><div class="quiz-feedback">${quiz.map((q,i)=>{
 const choice = result.answers?.[i];
 const selected = Number.isInteger(choice) && q.options[choice] !== undefined;
 const paragraph = Number.isInteger(q.paragraph) && q.paragraph >= 1 && q.paragraph <= parts.length ? q.paragraph : null;
 return `<div><p><strong>${i+1}. ${esc(q.question)}</strong></p>
   ${selected ? `<p>你的答案：${esc(q.options[choice])}（${choice===q.answer?'答對':'答錯'}）</p>` : ''}
   <p>正確答案：${esc(q.options[q.answer])}<br>${esc(q.explanation)}</p>
   ${paragraph ? `<button class="btn" data-quiz-paragraph="${paragraph}">查看原文第 ${paragraph} 段</button>` : ''}</div>`;
 }).join('')}</div>`:`${quiz.map((q,i)=>`<fieldset class="quiz-question"><legend>${i+1}. ${esc(q.question)}</legend>${q.options.map((o,j)=>`<label class="quiz-choice"><input type="radio" name="quiz-${i}" value="${j}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}<button class="btn primary" data-quiz-submit="${esc(a.id||a.url)}">提交答案，領取 XP</button><div id="quiz-feedback" aria-live="polite"></div>`}</section>`:`<div class="notice">本篇尚無經過內容審核的專屬測驗，為避免虛構題目，暫不提供挑戰。</div>`;
 return `<section class="reader"><div class="kicker">${esc(a.category)} / ${esc(a.source)}</div><h2>${esc(a.title)}</h2>${a.demo?'<div class="notice">此為原創雙語教學示範，不是即時新聞；部署並更新後才會有官方來源內容。</div>':''}${imageMarkup(a,"reader-cover")}<div class="statsline">${a.kind==='knowledge'?'知識專題':`發布：${esc(date(a.published_at))}`} · 來源網域已核對 · 主張未獨立查證</div><div class="notice"><strong>內容範圍：</strong>${a.demo?'Daily Insight 原創教學示範全文（非官方新聞）':isTextEdition(a)?'開放授權百科文字版：保留 API 提供的正文與章節，原站圖表、公式與註腳未收錄；非原頁完整複本':isMedia(a)?'發布者 RSS 摘要，並非全文':hasApprovedFullText(a)?'已核對授權的來源全文':a.content_scope==='official_article_extracted'?'已擷取官方文章正文，但尚未確認完整性或授權':'來源摘要或部分內文，並非全文'}。未確認可合法重製的文章不提供全文。<br><strong>翻譯狀態：</strong>${esc(status)}。${nativeChinese?'': '翻譯可能有誤，請以原文為準。'}${license?`<br><strong>全文授權：</strong><a href="${esc(license)}" target="_blank" rel="noopener noreferrer">${esc(a.license_name)}</a>` : ''}</div>${translated?`<div class="filters" style="margin-top:20px"><button class="mode ${state.mode==='zh'?'active':''}" data-mode="zh">繁體中文</button><button class="mode ${state.mode==='both'?'active':''}" data-mode="both">逐段對照</button><button class="mode ${state.mode==='original'?'active':''}" data-mode="original">原文</button></div>`:""}<div class="${compare?'evidence-list':'article-prose'}">${panels}</div><div class="notice"><strong>來源與驗證：</strong>本文文字來自${a.demo?'Daily Insight 原創示範':isTextEdition(a)?'維基百科中文編者群（經繁體用語轉換的文字版）':(hasApprovedFullText(a)||a.content_scope==='official_article_extracted')?'來源文章頁面':'發布者提供的 RSS'}。來源網域檢查不等於事實已查證。若要取得完整全文，必須確認該來源的授權及全文存取方式。</div>${editorialReason(a)&&!(hasApprovedFullText(a)&&translated)?`<div class="notice">重要例外 · ${esc(editorialReason(a))}</div>`:""}${a.attribution?`<div class="notice"><strong>姓名標示與版本：</strong>${esc(a.attribution)} <a href="${esc(safeUrl(a.history_url)||source)}" target="_blank" rel="noopener noreferrer">編者與修訂歷史 ↗</a> · 取得日期：${esc(date(a.fetched_at))}</div>`:''}${a.references?.length?`<section class="notice"><strong>延伸閱讀與研究：</strong><p>以下為原百科列出的研究、學術或圖書館連結，未另作全文審查；可能是外語或需登入。</p><ul>${a.references.map(r=>safeUrl(r.url)?`<li><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></li>`:'').join('')}</ul></section>`:''}${quizHtml}<div class="actions"><a class="btn primary" href="${esc(source)}" target="_blank" rel="noopener noreferrer">前往來源閱讀 ↗</a><button class="btn" data-save="${esc(a.url)}">${state.saved.includes(a.url)?'★ 已收藏':'☆ 收藏'}</button><button class="btn" data-read="${esc(a.url)}">${state.read.includes(a.url)?'✓ 已閱讀':'完成閱讀'}</button><button class="btn primary" data-next="${esc(a.url)}">完成並閱讀下一篇 →</button></div></section>`;
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
function readingQueue(items,kind,now=Date.now()){
 const unread=homepageArticles(items).filter(a=>(a.kind==='knowledge'?'knowledge':'news')===kind&&!state.read.includes(a.url)&&(kind!=='news'||(Date.parse(a.published_at)>=now-7*86400000&&Date.parse(a.published_at)<=now+10*60000)));
 const day=Math.floor((now+8*3600000)/86400000);
 const ordered=kind==='news'?[...unread].sort((a,b)=>{
   const ageA=(now-Date.parse(a.published_at))/86400000,ageB=(now-Date.parse(b.published_at))/86400000;
   const bandA=ageA<=2?0:1,bandB=ageB<=2?0:1;
   return bandA-bandB || (bandA===0?Number(isMedia(a))-Number(isMedia(b)):0) || Date.parse(b.published_at)-Date.parse(a.published_at);
 }):[...unread].sort((a,b)=>(a.title||'').localeCompare(b.title||'','zh-TW'));
 const groups=new Map();
 for(const a of ordered){const t=topicOf(a);if(!groups.has(t))groups.set(t,[]);groups.get(t).push(a)}
 const topics=[...groups.keys()];
 if(kind==='knowledge'&&topics.length){const shift=day%topics.length;topics.push(...topics.splice(0,shift));for(const group of groups.values()){const n=Math.floor(day/topics.length)%group.length;group.push(...group.splice(0,n))}}
 const queue=[];let remaining=true;
 while(remaining){remaining=false;for(const t of topics){const group=groups.get(t);if(group.length){queue.push(group.shift());remaining=true}}}
 return queue;
}
function dailyKnowledge(items){const article=readingQueue(items,'knowledge')[0];return article?{topic:topicOf(article),article}:null}
function checkedTime(s){const d=new Date(s);return !s||isNaN(d)?'尚未取得':new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'short',hour12:false,timeZone:'Asia/Taipei'}).format(d)}
function mergeArticles(curated, live){
 const merged=new Map(curated.map(a=>[a.url,a]));
 for(const a of live){
  const previous=merged.get(a.url);
  if(previous?.kind==='knowledge')continue;
  const next={...previous,...a};
  if(previous?.image_rights==='approved')for(const key of Object.keys(previous).filter(k=>k.startsWith('image_')))next[key]=previous[key];
  if(previous && JSON.stringify(previous.evidence_original)!==JSON.stringify(a.evidence_original)){next.quiz=[];next.quiz_reviewed=false;}
  merged.set(a.url,next);
 }
 return [...merged.values()].filter(a=>safeUrl(a.url)&&a.verification==='publisher_domain_checked');
}
function explore(items) {
 const isKnowledge=state.page==='knowledge', kind=isKnowledge?'knowledge':'news',title=isKnowledge?'知識':'新聞';
 const selected=homepageArticles(items).filter(a=>(a.kind==='knowledge')===isKnowledge).sort((a,b)=>isKnowledge?(Date.parse(b.added_at)||0)-(Date.parse(a.added_at)||0):(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0));
 const topics=['全部','有測驗',...new Set([...(isKnowledge?KNOWLEDGE_TOPICS:TOPICS).keys(),...selected.map(topicOf)])];
 const matches=a=>state.filter==='全部'||(state.filter==='有測驗'?quizData(a):topicOf(a)===state.filter);
 const unread=selected.filter(a=>!state.read.includes(a.url));
 const recommended=state.shelf!=='library';
 const queue=readingQueue(items,kind).filter(matches);
 const limit=isKnowledge?9:12;
 const visible=recommended?queue.slice(0,limit):selected.filter(matches);
 const today=isKnowledge&&state.filter==='全部'&&recommended?dailyKnowledge(items):null;
 const bad=Object.entries(state.meta?.sources||{}).filter(([,status])=>status.status==='error');
 const time=isKnowledge?state.meta?.catalog_at:state.meta?.updated_at;
 const emptyMessage = selected.length
   ? '這個範圍目前沒有符合條件的文章，可切換主題或查看全部館藏。'
   : refreshPending ? '正在取得文章，資料載入後會顯示在這裡。'
   : failedData.size ? '目前無法取得此區文章，請按「重新取得內容」重試。'
   : '此區目前沒有可讀文章。';
 const latest=selected.reduce((d,a)=>Date.parse(a.published_at)>(Date.parse(d)||0)?a.published_at:d,null);
 const controls=`<div class="sectionhead"><h2 id="explore-title">${title}</h2><span class="meta">${selected.length} 篇 · 未讀 ${unread.length} 篇</span></div>
 <p class="meta">${isKnowledge?'跨主題開放知識，依閱讀進度補充未讀推薦。':'新聞與可信媒體索引；站內全文及原站閱讀均清楚標示。'} 最近檢查：${esc(checkedTime(time))}（台灣時間）${!isKnowledge?` · 最新發布：${esc(date(latest))}`:''}</p>
 <div class="filters explore-topics" aria-label="${title}主題分類">${topics.map(topic=>`<button class="filter ${state.filter===topic?'selected':''}" data-filter="${esc(topic)}">${esc(topic)}</button>`).join('')}</div>`;
 const content=`<section class="explore-section" aria-labelledby="explore-title">
 <div class="actions reading-options"><button class="btn ${recommended?'primary':''}" data-shelf="recommended">推薦未讀</button><button class="btn ${!recommended?'primary':''}" data-shelf="library">全部館藏（含已讀）</button><button class="btn" data-refresh="1">重新取得內容</button></div>
 <p class="meta">此區已讀 ${selected.length-unread.length} 篇；${!isKnowledge&&recommended?'推薦最近七日新聞；舊聞保留在全部館藏。':''}${recommended?`目前推薦 ${visible.length} 篇，完成一篇即補下一篇。`:'保留全部文章與收藏。'}閱讀進度保存在目前瀏覽器。背景每日 08:00、13:00、18:00 擴充資料，免費排程可能延遲。</p>
 ${state.refreshMessage?`<p role="status" class="meta">${esc(state.refreshMessage)}</p>`:''}
 ${bad.length?`<div class="notice">部分來源暫時無法取得：${bad.map(([key])=>esc(key)).join('、')}。其他來源繼續更新，保留先前可用內容。</div>`:''}
 ${today?`<div class="notice"><strong>今日知識 · ${esc(today.topic)}</strong><p>${esc(today.article.title)}</p><button class="btn primary" data-open="${esc(today.article.url)}">閱讀今日知識</button></div>`:''}
 ${visible.length?`<div class="grid">${visible.map(article).join('')}</div>`:`<div class="empty">${emptyMessage}</div>`}
 </section>`;
 return {controls,content};
}

const openStaxCost = {
 title:'選擇、機會成本與沉沒成本',
 source:'OpenStax', language:'英文',
 url:'https://openstax.org/books/principles-economics-3e/pages/2-1-how-individuals-make-choices-based-on-the-budget-constraint'
};
const whoResistance = {
 title:'抗微生物藥物抗藥性概覽', source:'WHO', language:'英文',
 url:'https://www.who.int/news-room/fact-sheets/detail/antimicrobial-resistance'
};
const taiwanResistance = {
 title:'抗生素使用及抗藥性監測報告',source:'台灣疾管署',language:'繁中',
 url:'https://www.cdc.gov.tw/Category/Page/tx7G1t-G3lyodZ8m8uoYMA'
};
const semiRule = {
 title:'SEMI E187 半導體設備資安標準驗證制度', source:'數位產業署', language:'繁中',
 url:'https://moda.gov.tw/ADI/news/bulletin-board/19284'
};
const imdBackground = {
 title:'數位調查與應用計畫', source:'數位發展部', language:'繁中',
 url:'https://moda.gov.tw/digital-affairs/digital-strategy/operations/41'
};

// Editorially checked supplements. An illustration is enabled only after
// reading it on its own, checking its takeaway against the source, and QA.
const readerSupplements = {
 'wiki:3711396': {
  terms:[
   ['抗生素抗藥性','細菌對特定抗生素的反應下降，原本能抑制它的藥物可能變得較難奏效。'],
   ['多重抗藥性','同一菌株對多種抗菌藥物呈現抗藥性，可能使可選用的治療藥物變少。']
  ],
  source:whoResistance,
  related:[
   {...taiwanResistance, reason:'從台灣的監測報告了解抗生素使用與抗藥性如何被追蹤。'},
   {...whoResistance, reason:'把細菌的抗生素抗藥性放到全球抗微生物藥物抗藥性的脈絡中。'},
   {title:'世界抗生素週：防疫一體齊行動',source:'台灣疾管署',language:'繁中',
    url:'https://www.cdc.gov.tw/Bulletin/Detail/2zXzowzH8aqg-ZSNRtViAw?typeid=9',
    reason:'了解台灣如何向民眾宣導抗藥性防治。'}
  ]
 },
 'wiki:69319': {
  related:[{...openStaxCost, reason:'用另一個生活案例比較機會成本與沉沒成本。'}],
  diagram:'opportunity-cost'
 },
 'wiki:174242': {
  terms:[['沉沒成本','已經付出且無法收回的成本，例如一張不可退款、也不能轉售的票。'],
   ['機會成本','做出選擇時，所放棄的最佳可行方案帶來的價值。']],
  source:openStaxCost
 },
 'wiki:1512891': {
  terms:[['確認偏誤','較容易注意、相信或記住支持原本看法的資訊。'],
   ['選擇性蒐集資訊','搜尋時偏向找支持原先看法的證據，可能因而漏掉相反資訊。']]
 },
 'wiki:262983': {
  terms:[['中性刺激','在建立連結之前，尚不會引發所觀察反應的刺激。'],
   ['制約反應','學到刺激之間的連結後，由原先的中性刺激引發的反應。']]
 },
 'wiki:6066875': {
  terms:[['間隔效應','把學習分散在多次時段，通常比集中在一次更有利於長期記憶。'],
   ['間隔重複','把複習安排在不同時間，並依記憶狀況調整下一次複習的間隔。']]
 },
 'adi:21452': {
  related:[{...semiRule, reason:'查閱臺灣如何安排半導體設備資安驗證。'}],
  context:[
   {label:'前情',date:'2026-03-24',text:'數位產業署公告驗證制度，由全國認證基金會擔任認證機構。',link:semiRule},
   {label:'這次進展',date:'2026-11-13',text:'數位產業署在維也納的 SEMI 國際政策高峰會分享臺灣的制度與實務經驗。'},
   {label:'接下來觀察',text:'可留意是否有海外設備商或驗證機構公布採用或合作安排。'}
  ]
 },
 'moda:21450': {
  related:[{...imdBackground,reason:'了解數位發展部如何追蹤國際數位競爭力評比與指標。'}],
  context:[
   {label:'前情',date:'2017',text:'IMD 自 2017 年起發布世界數位競爭力評比，早期採知識、科技與未來整備度三個構面。',link:imdBackground},
   {label:'這次進展',date:'2026-11-16',text:'數位發展部公布 2026 年結果。用新架構回算，臺灣 2025 年第 12，2026 年第 13。'},
   {label:'接下來觀察',text:'比較排名時，可一起觀察各構面分數，以及下一次評比是否沿用相同指標。'}
  ]
 }
};

const carbonFeeGuide = {title:'臺灣碳費制度與施行時程',source:'環境部氣候變遷署',language:'繁中',
 url:'https://www.cca.gov.tw/affairs/carbon-fee-fund/2301.html',
 reason:'對照碳費適用對象、徵收時程、自主減量計畫與優惠費率。'};
const railMuseumBrief = {title:'國家鐵道博物館設置條例草案說明',source:'行政院',language:'繁中',
 url:'https://www.ey.gov.tw/Page/4EC2394BE4EE9DD0/9fbbfd2d-2a52-4583-b9a5-b9711e9a00c7',
 reason:'閱讀草案的立法目的、博物館任務與規劃的組織架構。'};
const taxiDraft = {title:'網路預約叫車管理草案預告',source:'交通部',language:'繁中',
 url:'https://www.motc.gov.tw/ch/app/news_list/view?id=14&module=news&serno=f2444dd7-f8b3-446b-9346-4a2dfcaa2bf5',
 reason:'比對草案提出的平臺營運責任、乘客保障及駕駛接單規劃。'};
const artemisBrief = {title:'NASA 的 Artemis 任務簡報',source:'NASA',language:'英文',
 url:'https://www.nasa.gov/blogs/missions/2026/10/23/nasa-shares-artemis-acceleration-plans-for-moon-missions/',
 reason:'分清 Artemis III 的低地球軌道測試及 Artemis IV 的登月目標。'};
const archivesGuide = {title:'國家檔案資訊網操作指引',source:'國家發展委員會檔案管理局',language:'繁中',
 url:'https://aa.archives.gov.tw/Home/PublishDetail?cnid=109779&pid=13',
 reason:'用簡易或進階搜尋找到國家檔案目錄。'};
const artTimeline = {title:'大都會藝術博物館藝術史年表',source:'大都會藝術博物館',language:'英文',
 url:'https://www.metmuseum.org/essays/timeline-of-art-history',
 reason:'用有年代與地區標示的館藏作品，對照藝術史教材的分期方式。'};
const japonisme = {title:'日本藝術如何影響歐洲藝術',source:'大都會藝術博物館',language:'英文',
 url:'https://www.metmuseum.org/essays/japonisme',
 reason:'藉由實際館藏看浮世繪如何影響印象派及後印象派的主題與構圖。'};
const gastroGuide = {title:'病毒性腸胃炎疾病介紹',source:'台灣疾管署',language:'繁中',
 url:'https://www.cdc.gov.tw/En/Category/Page/sndL3ibQOtZXgLelyyteHQ',
 reason:'對照諾羅病毒、輪狀病毒的流行情形與傳播方式。'};
const alcoholGuide = {title:'過度飲酒的生理機制與後果',source:'美國國家酒精濫用與酒精中毒研究所',language:'英文',
 url:'https://www.niaaa.nih.gov/about-niaaa/strategic-plan-fiscal-years-2024-2028/research-goals/goal-1-elucidate-biological-mechanisms-and-consequences-alcohol-misuse',
 reason:'了解研究如何看待以飲酒因應壓力，以及這種做法與酒精使用問題的關聯。'};
const thoughtExperimentGuide = {title:'思想實驗在科學和哲學中的用法',source:'史丹佛哲學百科',language:'英文',
 url:'https://plato.stanford.edu/archives/sum2022/entries/thought-experiment/',
 reason:'透過經典案例判斷思想實驗能回答什麼，以及哪些結論仍需要實際證據。'};

// Each recommendation identifies what the reader can learn from its source.
function readingReference(title, source, language, url, reason) {
 return {title,source,language,url,reason};
}

const prospectTheory = readingReference('展望理論原始論文','Econometrica，UCLA 公開版','英文 PDF',
 'https://www.anderson.ucla.edu/faculty_pages/keith.chen/negot.%20papers/KahnemanTversky_ProsTheory79.pdf',
 '閱讀作者如何用一系列選擇題觀察人們對得利和損失的不同反應。');

Object.assign(readerSupplements,{
 'ey:eb1d2b2d-ef21-4e57-83fc-4d8765a4bfd5':{
  related:[railMuseumBrief],
  context:[
   {label:'園區開放',date:'2025-07-31',text:'由臺北機廠轉型的國家鐵道博物館園區開始分階段開放。',link:railMuseumBrief},
   {label:'草案送審',date:'2026-11-05',text:'行政院通過博物館設置條例草案，並將草案送立法院審議。',link:railMuseumBrief},
   {label:'接下來觀察',text:'可從立法院審議追蹤博物館的法定任務、組織設計與監督方式。'}
  ]
 },
 'curated:env':{
  related:[carbonFeeGuide],
  context:[
   {label:'開始計費',date:'2025-01-01',text:'臺灣碳費費率生效，2025 年排放量納入碳費計算，首次繳納安排在 2026 年。',link:carbonFeeGuide},
   {label:'這次審議',date:'2026-11-02',text:'審議會比較一般費率及優惠費率的調整方案，要求補充資料後再審。'},
   {label:'接下來觀察',text:'可查下一次審議的決議與公告，確認適用費率和生效時間。'}
  ]
 },
 'nasa:60000835':{
  related:[artemisBrief],
  context:[
   {label:'公布任務規劃',date:'2026-10-23',text:'NASA 簡報說明 Artemis III 預計在 2027 年於低地球軌道測試關鍵系統。',link:artemisBrief},
   {label:'更新登月時程',date:'2026-11-04',text:'NASA 整理加速規劃，將 Artemis IV 的登月任務目標訂在 2028 年。'},
   {label:'接下來觀察',text:'可追蹤 Artemis III 測試進度與 Artemis IV 的正式任務更新。'}
  ]
 },
 'ey:3e1ca979-057e-4b00-81be-3d061228db6e':{
  context:[
   {label:'協定簽署',date:'2021',text:'臺灣與韓國完成租稅協定的異地簽署，協定自 2024 年適用。'},
   {label:'這次修正',date:'2026-11-12',text:'行政院備查修正協議，主要更新韓國主管機關名稱。'}
  ]
 },
 'ey:15b1a3a9-8715-46a3-9a37-0e793d927592':{
  context:[
   {label:'核定計畫',date:'2020 年 6 月',text:'行政院核定五股交流道增設匝道改善工程。'},
   {label:'匝道通車',date:'2026-11-11',text:'新增與改善的匝道完工通車，另有新五路拓寬工程仍在施工。'}
  ]
 },
 'ey:a7b879bd-bf74-4fde-9c8a-5a98c6889dcc':{
  context:[
   {label:'首段通車',date:'2005',text:'八卦山隧道完工後，台 19 線以東到草屯的路段先通車。'},
   {label:'延伸段通車',date:'2026-11-07',text:'台 19 線以西的延伸段通車，向西銜接台 61 線。'}
  ]
 },
 'ey:a06fa469-f8de-4831-9bcf-6e599f9d3ba2':{
  context:[
   {label:'既有工程',date:'2020',text:'蘇花改全線通車，先改善蘇澳至東澳、南澳至和平、和中至大清水三段。'},
   {label:'新工程動土',date:'2026-11-04',text:'蘇花安東澳至南澳段啟動第一標工程，後續可追蹤各標段施工進度。'}
  ]
 },
 'moda:21234':{
  context:[
   {label:'示範站完工',date:'2026 年 6 月',text:'嘉太變電所的高抗災基地臺完工，電信業者設置第二傳輸路由。'},
   {label:'訪查成果',date:'2026-11-03',text:'數發部訪查電力、傳輸及結構，並說明基地臺在兩次颱風期間持續提供服務。'}
  ]
 },
 'moda:21226':{
  context:[
   {label:'規格通報',date:'2026-10-30',text:'數發部接獲通報，部分已簽發的網站憑證，其序號的有效亂數長度低於標準要求。'},
   {label:'督促換發',date:'2026-11-02',text:'數發部說明已督促 TWCA 產製合規的新憑證，並通知各機關更換。'}
  ]
 },
 'moda:21142':{
  context:[
   {label:'建置語料庫',date:'2025 年底',text:'數發部推出臺灣主權 AI 訓練語料庫，初期以政府語料為主。'},
   {label:'跨部會座談',date:'2026-10-16',text:'數發部、文化部與智慧局邀內容權利人和 AI 業者交換授權與權益保護意見。'},
   {label:'接下來觀察',text:'可關注後續徵集辦法如何處理自願授權、使用範圍和費用。'}
  ]
 },
 'library:archive':{related:[archivesGuide]},
 'wiki:6983700':{related:[artTimeline]},
 'wiki:5622':{related:[artTimeline]},
 'wiki:154555':{related:[japonisme]},
 'wiki:18302':{related:[japonisme]},
 'library:gastro':{related:[gastroGuide]},
 'library:alcohol':{
  related:[alcoholGuide],
  terms:[
   ['酒癮','難以控制飲酒，即使飲酒已造成健康、工作或家庭困擾，仍可能持續喝酒。'],
   ['家庭治療','讓家庭成員參與治療，協助調整互動方式並建立可持續的支持。']
  ]
 },
 'library:stress':{related:[readingReference('突發事件後的壓力調適','美國物質濫用與心理健康服務署','英文',
  'https://www.samhsa.gov/mental-health/disaster-preparedness/coping-tips','對照事件後常見的心理反應，以及不同階段可採取的照顧方式。')]},
 'library:lang':{related:[readingReference('國家語言發展法','全國法規資料庫','繁中',
  'https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode=H0170143','查看國家語言的法律定義以及教育、傳承和公共服務的規定。')]},
 'wiki:276979':{related:[readingReference('公共財與搭便車問題','OpenStax《經濟學原理》','英文',
  'https://openstax.org/books/principles-economics-2e/pages/13-3-public-goods','用具體案例區分非排他性與非競爭性，理解公共財為何難以由市場單獨供給。')]},
 'wiki:1176897':{source:prospectTheory,related:[prospectTheory],terms:[
  ['損失規避','和同等大小的收益相比，人們往往更在意損失給自己帶來的影響。','損失迴避','損失趨避','損失厭惡'],
  ['展望理論','描述人在風險下如何以某個參考點判斷得失，並對機率給予不同於客觀數值的權重。','前景理論'],
  ['參考點','人用來判斷一個結果算收益還是損失的比較基準。']
 ]},
 'wiki:12252':{related:[readingReference('亞里斯多德的倫理學','史丹佛哲學百科','英文',
  'https://plato.stanford.edu/entries/aristotle-ethics/','循著幸福、品格和實踐智慧理解德性倫理學。')]},
 'wiki:196075':{related:[readingReference('細胞凋亡與發育','OpenStax《生物學概念》','英文',
  'https://openstax.org/books/concepts-biology/pages/17-key-terms','對照凋亡、細胞分化與胚胎發育等概念。')]},
 'wiki:1784149':{related:[readingReference('什麼是群體免疫','世界衛生組織','英文',
  'https://www.who.int/news-room/questions-and-answers/item/herd-immunity-lockdowns-and-COVID-19','理解群體免疫如何間接保護他人，以及免疫比例如何隨疾病特性改變。')]},
 'wiki:5595393':{related:[readingReference('1960 至 1970 年代的反文化運動','牛津研究百科','英文',
  'https://academic.oup.com/edited-volume/61644/chapter-abstract/539885250','從公開摘要理解運動的歷史背景和影響。')]},
 'wiki:34459':{related:[readingReference('絲綢之路如何連接不同文明','UNESCO','英文',
  'https://www.unesco.org/en/silk-roads/about-silk-roads','對照陸路與海路如何傳遞商品、技術及文化。')]},
 'wiki:504859':{related:[readingReference('東方主義與十九世紀藝術','大都會藝術博物館','英文',
  'https://www.metmuseum.org/essays/orientalism-in-nineteenth-century-art','從博物館藏品辨認歐洲藝術如何描繪所謂的東方。')]},
 'wiki:538379':{related:[readingReference('龐培古物與「秘密展室」','那不勒斯國立考古博物館','英文',
  'https://www.museoarcheologiconapoli.it/en/portfolio-item/secret-room/','了解文中提到的古羅馬藏品在近代如何受到限制保存與展示。')]},
 'wiki:8818339':{related:[readingReference('動物的交配系統','Wiley 生命科學百科','英文',
  'https://onlinelibrary.wiley.com/doi/10.1002/9780470015902.a0022553','從公開摘要比較不同交配系統如何描述個體的配對及交配行為。')]},
 'wiki:9592055':{related:[readingReference('《女史箴圖》卷上的題跋與印章','大英博物館','英文',
  'https://www.britishmuseum.org/collection/image/901936001','在實際館藏作品上觀察後人加寫的題跋如何成為流傳紀錄。')]},
 'wiki:265218':{related:[thoughtExperimentGuide]}
});

for (const id of ["ltn-life:1237a713a3415e0b", "yahoo-lifestyle:4661365ce120c73e"]) {
 readerSupplements[id] = {
  related:[taxiDraft],
  context:[
   {label:'草案預告',date:'2026-10-22',text:'交通部提出計程車客運服務業修正草案，將網路預約叫車平臺的營運責任納入規範。',link:taxiDraft},
   {label:'本次報導',text:'根據本篇來源，修正規定於 11 月 19 日起施行，業者有一年時間取得營業執照。',useArticleDate:true}
  ]
 };
}

// Reviewed collections use stable article IDs so future headlines cannot be grouped by a coincidental keyword.
const reviewedNewsEvents = [
 ["網路叫車平台納管", ["ltn-life:1237a713a3415e0b", "yahoo-lifestyle:4661365ce120c73e"]],
 ["AI 語料授權與著作權政策", ["moda:21142", "ltn-politics:fc6e855ea863f673"]],
 ["松山機場遷建政見", ["ltn-politics:172f78cad7e6bfa2", "ltn-politics:f8b80354b6d27bf1", "ltn-politics:fbb16960cc4a2cd1", "ltn-politics:0a4fd6106588cac6"]],
 ["台股震盪、融資與護盤報導", ["ltn-business:22e4fec9f82e5012", "ltn-business:61f7f3a98203e1e2", "ltn-business:48fe5fbe51d8053d", "ltn-business:57e4073f10345938", "yahoo-finance:9f6b443f6d022627", "ltn-business:70b852c4fa1d9d67", "yahoo-finance:b08a8e126d1d7262", "ltn-business:dbd03b5ed2370543"]],
 ["2026 年度青奧台灣隊返國", ["ltn-sports:43afbfe85f485bb0", "yahoo-sports:94ec87a82e99a147", "yahoo-sports:09d8c2e020b142d1"]],
 ["2026 年亞冠賽台灣隊與南韓隊交手", ["ltn-sports:2246b2c8ce4fdbdf", "ltn-sports:1dcb008a8b97e61d", "ltn-sports:63866ca15d836ad6", "ltn-sports:06232a391b14f341"]],
 ["李洋參與選舉車掃後的行政中立討論", ["ltn-politics:618d80769d347951", "ltn-politics:602f4c0bc942f1e1"]],
 ["翡翠水庫光電設置討論", ["ltn-politics:f8b80354b6d27bf1", "ltn-business:c0931fdda60952e9", "ltn-politics:71c797cdacc5659d"]],
 ["育兒減時與職代津貼", ["ltn-business:92f2f468266abc6e", "yahoo-lifestyle:7f8f22d1228b9979"]],
 ["輝達季度持股申報", ["ltn-business:e6a0306ee798f35c", "yahoo-finance:efa04cade8f8df7b", "yahoo-finance:ac8017791e7c14ef"]],
 ["黃仁勳的輝達職務變動與公開回應", ["ltn-business:52863b7a553d4b6a", "ltn-business:0179731d57a51345", "ltn-business:7b2f76ecf49c8f96", "ltn-business:343fd2140c196812", "ltn-world:e9e80734a3d772db", "yahoo-finance:51674a1756e68c1a", "yahoo-finance:eabd0971d014d1e1", "ltn-world:cfd9e5858133bc16", "yahoo-finance:82280d2582ac1534", "yahoo-finance:95f645ac2b809a98", "yahoo-finance:9379300f5f0dae6a", "ltn-business:42947610e89ab5b4"]],
 ["台北 101 點燈聲援黃仁勳", ["ltn-politics:81eccc18af348dec", "yahoo-lifestyle:51ea4d5ae1a7a1a5", "ltn-business:2bb824fb4eb6c81d", "ltn-business:cedb55475f33b034"]],
 ["美國先進 AI 算力出口管制", ["ltn-world:182be4dcee102cb2", "ltn-business:100ae1b192cf90c0", "ltn-world:d416eb5e55d6d1d7", "yahoo-finance:c8812798d5af36b8", "yahoo-finance:2fd5ead994851a4d", "yahoo-finance:2a683e203515274d", "ltn-world:35e0ff65345ea2f6"]],
 ["2026 APEC 與美中俄領袖會談規劃", ["ltn-world:3b113548fc5c9804", "yahoo-finance:75a19015174954dd", "ltn-world:dc4209cac431bafe", "ltn-world:41feeb93209523d2", "ltn-world:12938780e7c17014", "ltn-world:30c04eef121dcb6f", "ltn-world:ff651f1defb623f0", "ltn-world:9802ae2b527a1fa1"]],
 ["2026 年 11 月 19 日前後冷空氣", ["ltn-life:17837f3363fbddec", "ltn-life:a117432a100405e1", "yahoo-lifestyle:48b023815b4ee174", "yahoo-lifestyle:ab8b821968e9097f", "yahoo-lifestyle:e297183809709670", "yahoo-lifestyle:a2d46030b97c1b5b", "yahoo-lifestyle:9ba4ec32e40a3591", "ltn-life:da16ef5af6e6bdd9"]],
 ["台中林皇宮停業與婚宴受影響", ["ltn-life:60e94eb65fce8f6b", "yahoo-lifestyle:63921dbf58664644", "yahoo-lifestyle:9cf73e3f2f413b72"]],
 ["仁愛國中午餐食安事件", ["ltn-life:5dfe6952e8607a42", "ltn-life:2a286ca0e43ab302"]],
 ["普發兩萬元提案的立院討論", ["ltn-politics:7a1fadfe132fc035", "ltn-politics:f7f83e869604fdf2", "ltn-politics:d64dff4fe2f68cb2"]],
 ["2027 美國棒球名人堂候選名單", ["ltn-sports:b05acd13cb9913dd", "yahoo-sports:850fceb054b32d80"]],
 ["2026 年網球年終賽艾卡拉茲對蒂亞弗", ["ltn-sports:518e5f43ce3a3763", "yahoo-sports:b01f5f136ec1361c", "ltn-sports:f5964beed433d10b"]],
 ["魔術對塞爾提克一役", ["ltn-sports:a14bb45f86e606ea", "yahoo-sports:513fd119ed514cfc"]],
 ["廣島球團前球員與煙彈風波", ["ltn-sports:369eb2bc1edc37c8", "yahoo-sports:0c6612b57111f224"]],
 ["冬盟邱立璿對日職聯隊投球", ["ltn-sports:ac5248560d57ba13", "ltn-sports:c6a0554b45ce9a54"]],
 ["2026 年兒科住院醫師招收", ["yahoo-health:15dc271c2c0c2b5b", "yahoo-lifestyle:1ff85fc0812bce8a"]],
 ["2026 年森林護管員甄試", ["ltn-life:df36b6c1338dee16", "ltn-life:1e62689c5f522b68"]],
 ["台中 16 個公民團體選前訴求", ["ltn-politics:698eef77dd352075", "ltn-politics:8c3fdf72035883fd"]],
 ["台北市社工座談取消爭議", ["ltn-politics:995f2a1b75797d5b", "ltn-politics:f890f9d8c1fa8d9d"]],
 ["2026 年台北市長選舉封關民調", ["ltn-politics:214bff83ba169fce", "ltn-politics:a51926bf0f5babea", "ltn-politics:41fbf491b7ba2030", "ltn-politics:41b2622a7ddcddf1"]],
 ["蔣萬安選前之夜與柯文哲站台安排", ["ltn-politics:f145e08d84b5dcce", "ltn-politics:329e612849e10f65", "ltn-politics:864755630b3d185b", "ltn-politics:30139c67190b846e", "ltn-politics:603d40f45d01fecc"]],
 ["旺矽與漢測的矽光子布局", ["ltn-business:948337728ca43ebb", "ltn-business:a780568a40a0701a", "ltn-business:a49206e71692d668"]],
 ["2026 年亞太股市半導體賣壓", ["ltn-business:9fb15b13c7ba9a1b", "ltn-business:e11e711edc3907ad", "yahoo-finance:bd2d4365ba33840b", "ltn-business:c566d81e41aa673d", "ltn-business:a3b557cfe092add6"]],
 ["臺灣半導體設備資安標準赴歐交流", ["adi:21452", "ltn-business:840f8f5a0b92caa4"]],
 ["觀光雙輪方案及國旅補助延長", ["ey:c81e8f01-4e9a-49f6-be89-36159c050384", "yahoo-technology:c0478a8c60da72cb"]],
];

const reviewedReadingTopics = [
 ["地震的觀測與災害判讀", ["knowledge:quake", "knowledge:quake2", "curated:eq36", "library:tsunami", "ltn-life:0461dedf45c43297", "ltn-life:a2c6ea7fcde001c6"]],
 ["冷凍食品與冷藏保存", ["knowledge:food", "yahoo-lifestyle:33920e7c518712ba"]],
 ["感染性腸胃炎的傳播與預防", ["library:gastro", "ltn-life:5dfe6952e8607a42", "ltn-life:2a286ca0e43ab302", "yahoo-health:07a9937c4df974b5"]],
 ["醫療研究的比較方法", ["wiki:268050", "wiki:1048831", "wiki:9350690", "wiki:5665054", "wiki:8123487"]],
 ["政府資料授權與線上申辦", ["library:mydata", "moda:21078"]],
 ["社會住宅與居住負擔", ["library:housing", "library:cpi", "moda:21078"]],
 ["機會成本與資源配置", ["wiki:69319", "wiki:174242", "wiki:530888", "wiki:7686564"]],
 ["行為經濟學與決策", ["wiki:1176897", "wiki:6988071", "wiki:7179170", "wiki:2998143"]],
 ["記憶與學習", ["wiki:262983", "wiki:6066875", "wiki:7615098"]],
 ["證據如何支持科學推論", ["wiki:265218", "wiki:38594", "wiki:427871", "wiki:893357"]],
 ["人如何被語言與框架影響", ["wiki:328749", "wiki:2998133", "wiki:2998143", "wiki:686505"]],
 ["藝術史的風格與分期", ["wiki:6983700", "wiki:5622", "wiki:8633463", "wiki:20344", "wiki:6679001"]],
 ["羅馬式藝術與建築", ["wiki:1301067", "wiki:590366", "wiki:19159"]],
 ["視覺藝術與新媒材", ["wiki:20114", "wiki:5316768", "wiki:5622"]],
 ["跨文化接觸與藝術流通", ["wiki:154555", "wiki:18302", "wiki:34459", "wiki:504859"]],
 ["洞穴藝術與圖像紀錄", ["wiki:109603", "wiki:1549872", "wiki:611166"]],
 ["史料查證與文化保存", ["library:archive", "wiki:3043439", "wiki:8674660", "ey:eb1d2b2d-ef21-4e57-83fc-4d8765a4bfd5"]],
 ["族群遺傳與物種形成", ["wiki:1058905", "wiki:148129", "wiki:1517531", "wiki:235282", "wiki:1287455"]],
 ["環境、基因與生物演化", ["wiki:328845", "wiki:8651778", "wiki:235282"]],
 ["內共生與物種互惠", ["wiki:132312", "wiki:115456"]],
 ["如何測量與保育生物多樣性", ["wiki:225481", "wiki:976495", "wiki:339957", "wiki:7968028", "wiki:7967293", "wiki:211417", "wiki:51834"]],
 ["生態棲地與物種適應", ["wiki:557786", "wiki:3909011", "wiki:135153", "wiki:6339319", "wiki:847712", "wiki:7967866", "wiki:131050"]],
 ["生態位、物種互動與食物網", ["wiki:48330", "wiki:115456", "wiki:115442", "wiki:593101", "wiki:131050", "wiki:9112513", "wiki:230932"]],
 ["能量流動與物質循環", ["wiki:361801", "wiki:835122", "wiki:6907881", "wiki:7884004", "wiki:544037", "wiki:151581", "wiki:1011731"]],
 ["地景與生態調查方法", ["wiki:9495542", "wiki:7968911", "wiki:1613200", "wiki:216424", "wiki:5719542", "wiki:7307618", "wiki:1260045"]],
 ["棲地品質如何影響物種選擇", ["wiki:7965268", "wiki:847712", "wiki:7967866", "wiki:7967293"]],
 ["人類活動與環境永續", ["wiki:6331045", "wiki:7639737", "wiki:1641164", "wiki:7963776", "wiki:309892", "wiki:336347", "wiki:29876"]],
 ["降水、地形與水資源", ["wiki:209823", "wiki:371710", "wiki:309892", "wiki:336347"]],
 ["人為或封閉的生態環境", ["wiki:579734", "wiki:835122", "wiki:7963776", "wiki:230932"]],
 ["極端環境與未知微生物", ["wiki:135153", "wiki:6339319", "wiki:7884004", "wiki:3182293"]],
 ["污染在生態系中累積", ["wiki:1295869", "wiki:151581", "ltn-life:bbcc0da81f964425"]],
 ["數位身分驗證與憑證", ["wiki:133681", "wiki:5416739", "wiki:345276", "wiki:754555", "adi:21252", "moda:21226"]],
 ["社交工程與資安防護", ["wiki:3477276", "wiki:16768", "wiki:9037503", "wiki:9510362", "wiki:3830104", "wiki:9498385", "wiki:2943698"]],
 ["網路安全事件與防護",["wiki:4087369","wiki:9037503","wiki:16768"]],
 ["地下棲地與物種適應",["wiki:9033928","wiki:847712","wiki:7967866"]],
 ["漏洞通報與修補治理", ["wiki:4482573", "wiki:5394451", "wiki:7137902", "wiki:3458476", "wiki:1440868"]],
 ["公共數位服務與數位韌性", ["library:tech", "wiki:100892", "wiki:7428926", "wiki:3458476", "wiki:1414152", "moda:21234", "adi:21104"]],
 ["事後判斷與選擇性取樣", ["wiki:1512891", "wiki:5416618", "wiki:3014095", "wiki:3043439", "wiki:2980313", "wiki:7615098"]],
 ["從模糊線索看出模式", ["wiki:6355357", "wiki:537977", "wiki:6101291", "wiki:5540313", "wiki:5666947"]],
 ["印象如何影響對人的評價", ["wiki:1737303", "wiki:464317", "wiki:7083050", "wiki:6339319", "wiki:6395167", "wiki:399061"]],
 ["社會期待與歸因", ["wiki:1040979", "wiki:1220462", "wiki:5372438", "wiki:8669487", "wiki:1182059"]],
 ["團體壓力與社會知覺", ["wiki:1040979", "wiki:7055751", "wiki:5372438", "wiki:553937", "wiki:241006", "wiki:6339319"]],
 ["媒體呈現與議題判斷", ["wiki:7559698", "wiki:7615202", "wiki:2998133", "wiki:2998143", "wiki:7410241", "wiki:686505"]],
 ["認知偏誤與思考習慣", ["wiki:1194763", "wiki:7179170", "wiki:8603124", "wiki:1695367", "wiki:6253734", "wiki:3815273"]],
 ["論證結構與推理入門", ["library:logic", "wiki:710125", "wiki:167926", "wiki:3040997", "wiki:8021120"]],
 ["類比、樣本與因果判斷", ["wiki:721613", "wiki:3052286", "wiki:3043623", "wiki:3042214", "wiki:3044820", "wiki:7686564"]],
 ["轉移話題與離題論證", ["wiki:3041365", "wiki:336589", "wiki:3041034", "wiki:2829438", "wiki:3041936", "wiki:3044370", "wiki:70716", "wiki:1619758"]],
 ["偷換概念與操弄定義", ["wiki:3050961", "wiki:3045338", "wiki:3944452", "wiki:1566425", "wiki:3041391", "wiki:3041031", "wiki:7121404"]],
 ["形式推理的有效性", ["library:logic", "wiki:3041695", "wiki:3041324", "wiki:3041557", "wiki:3041723"]],
 ["假兩難與二分法", ["wiki:92219", "wiki:6510067", "wiki:3044089", "wiki:3043142", "wiki:7410241"]],
 ["情感訴求與恐懼", ["wiki:70716", "wiki:1619758", "wiki:74330", "wiki:3042900"]],
 ["條件機率與選擇偏差", ["wiki:3014095", "wiki:443079", "wiki:135557"]],
 ["線上交易如何降低資訊落差", ["ey:6fbb449f-ff98-4e02-9133-bff21db15033", "adi:21446", "curated:env2", "wiki:242261"]],
 ["中小企業轉型與創新育成", ["adi:21444", "adi:21430", "ey:1ada6479-77ae-4da3-b912-84af5f3eda80", "ey:008fe836-d6f6-4636-8805-2d8066f35e97", "ey:2e50c1f3-7a72-49d1-8795-0868b814a667", "adi:21110", "ltn-life:379f37dad061d6f3"]],
 ["數位科技的教學與體驗", ["ey:2bf5da95-69d8-49ba-9a19-53a611672d0b", "adi:21432", "adi:21104", "ltn-life:12f9ce090a7a00a5", "yahoo-lifestyle:9fb40fc03b8f563a"]],
 ["選務安全與疏運", ["ey:ce11120b-83d3-4d4d-9340-cca8c5c51415", "ey:a08549b5-0783-46c4-bb1d-22d8f6fb7184", "ltn-life:62c3752258650b2e", "ltn-politics:6765b88e01a63f3d"]],
 ["反毒的檢驗與跨部會協作", ["ey:daf51ed4-4237-415b-89d6-7bc2ea2aed56", "ey:c464a954-14fe-455d-bb90-69726cd5f921"]],
 ["海巡任務與人力保障", ["ey:6e44d303-bf53-4e75-9264-c0cc8fedf7d6", "ey:d6716352-809b-48b5-a600-da100e7c5de0"]],
 ["台灣衛星產業的供應鏈", ["adi:21280", "yahoo-finance:cb3155e844501ade"]],
 ["智慧農業的資料與設備應用", ["ey:b1d9bf7a-04f1-4242-b8fa-bb5fafb8cdce", "moda:21064", "ltn-life:3d837bfdf82f2ca6"]],
 ["電價與能源成本", ["ltn-business:c812ae92931834a1", "yahoo-lifestyle:c398ecccf4e4ba6a"]],
 ["醫療人力與照護服務", ["curated:hpa", "ey:e1dc1a32-20ed-4956-821b-2964eec44250", "yahoo-health:15dc271c2c0c2b5b", "yahoo-lifestyle:1ff85fc0812bce8a"]],
 ["亞太區域峰會與雙邊會談", ["ltn-world:f6d3deb84aa82011", "ltn-world:06b48f929c26795b", "ltn-world:c017b257bc7520fd", "yahoo-finance:75a19015174954dd", "ltn-world:dc4209cac431bafe", "ltn-world:41feeb93209523d2", "ltn-world:12938780e7c17014", "ltn-world:30c04eef121dcb6f", "yahoo-finance:f710e0f224f403db", "ltn-world:ff651f1defb623f0", "ltn-world:9802ae2b527a1fa1"]],
];

const readingThemes = [
 {name:'地震規模、震度與災害', match:/地震規模|地震震度|海嘯.*形成|地震規模與災害/},
 {name:'做選擇時的取捨', match:/^(機會成本|沉沒成本|比較優勢)$/},
 {name:'資訊判斷與認知偏誤', match:/^(認知偏誤|確認偏誤|後見之明偏誤|支援選擇偏誤)$/},
 {name:'推論與常見謬誤', match:/^(稻草人論證|訴諸人身|你也一樣謬誤|非形式邏輯|滑坡謬誤)$/},
 {name:'住房負擔與租屋政策', match:/社會住宅與租屋政策|住房成本/},
 {name:'細胞起源與演化', match:/^(共生體學說|內共生學說|遺傳漂變|粒線體|葉綠體)$/},
 {name:'2026 資訊月與臺灣教育科技展', match:/115資訊月暨臺灣教育科技展|數發部數產署主題館開幕/, event:true},
 {name:'SEMI E187 半導體設備資安制度', match:/SEMI\s*E187|數位產業署深耕歐洲.*半導體供應鏈資安/, event:true},
 {name:'抗生素抗藥性與防治', match:/抗生素抗藥性|抗藥性監測|世界抗生素週/},
 {name:'國家鐵道博物館', match:/國家鐵道博物館|國家鐵博/},
 {name:'環境用藥與網購安全', match:/環境用藥.*(?:網購|電商|核准)|(?:網購|電商).*環境用藥/},
 {name:'食品保存與冷凍食品', match:/冷凍食品|食物冷凍|冷凍保存/},
 {name:'電子簽章與數位驗證', match:/電子簽章|數位簽章/},
 {name:'碳費制度', match:/碳費費率|碳費制度/},
 {name:'臺灣語言政策', match:/國家語言|原住民族語|客語政策/},
 {name:'社會住宅與租屋政策', match:/社會住宅|(?<!公)包租代管/},
 {name:'手機條碼與雲端發票', match:/雲端發票|統一發票兌獎/}
];

function sourcesForReader(article) {
 const title = article.title || '';
 const themes = readingThemes.filter(theme => theme.match.test(title));
 const events = reviewedNewsEvents.filter(([,ids]) => ids.includes(article.id));
 const topics = reviewedReadingTopics.filter(([,ids]) => ids.includes(article.id));
 const text = article.kind === 'knowledge' ? glossaryPassages(article).join('\n') : '';
 const related = [];
 for (const candidate of homepageArticles(state.news)) {
  if (candidate.url === article.url || !candidate.title || candidate.title === title) continue;
  const event = events.find(([,ids]) => ids.includes(candidate.id));
  const topic = topics.find(([,ids]) => ids.includes(candidate.id));
  const theme = themes.find(entry => entry.match.test(candidate.title));
  const citedConcept = candidate.kind === 'knowledge' && /^[\p{Script=Han}]{4,14}$/u.test(candidate.title)
   && (findGlossaryWord(title, candidate.title) >= 0
    || text.split(candidate.title).length >= 3);
  if (!event && !topic && !theme && !citedConcept) continue;
  const onSite = candidate.content_scope !== 'media_headline';
  const name = event?.[0] || topic?.[0] || theme?.name;
  const sameEvent = Boolean(event || theme?.event);
  related.push({
   ...candidate, onSite, sameEvent,
   relevance:event ? 4 : topic ? 3 : theme ? 2 : 1,
   reason:sameEvent ? `對照「${name}」的另一則報導。`
    : name ? `從${candidate.kind === 'knowledge' ? '相關概念' : '實際案例'}延伸了解${name}。`
    : `深入閱讀本文提到的「${candidate.title}」。`
  });
 }
 return related.sort((a,b) => Number(state.read.includes(a.url))-Number(state.read.includes(b.url))
   || b.relevance-a.relevance || Number(b.onSite)-Number(a.onSite)
   || (Date.parse(b.published_at)-Date.parse(a.published_at) || 0));
}

function readerLink(link, label, extraClass='') {
 const url = safeUrl(link?.url);
 if (!url) return '';
 return `<a class="${extraClass}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
}

function relatedReaderItems(related, editorial) {
 const seen = new Set(), titles = new Set();
 const full = related.filter(item => hasApprovedFullText(item) || isTextEdition(item));
 return [...editorial, ...full, ...related]
  .filter(item => {
   const key = safeUrl(item.url);
   if (!key || seen.has(key) || titles.has(item.title)) return false;
   seen.add(key); titles.add(item.title); return true;
  }).slice(0,3);
}

function relatedReaderContent(related, editorial) {
 const items = relatedReaderItems(related, editorial);
 if (!items.length) return '';
 return `<ul class="reader-related">${items.map(item => `<li>
  ${item.onSite ? `<button class="reader-related-link" type="button" data-open="${esc(item.url)}">${esc(item.title)}</button>`
    : readerLink(item, item.title, 'reader-related-link')}
  <span class="reader-context-meta">${esc(item.source)} · ${esc(item.onSite
    ? isTextEdition(item) ? '站內文字版' : hasApprovedFullText(item) ? '站內全文' : '站內摘要'
    : (item.language ? item.language + ' · ' : '') + '原站閱讀')}</span>
  <p>${esc(item.reason)}</p>
 </li>`).join('')}</ul>`;
}

function reviewedCostDiagram(showExpand = true) {
 return `<figure class="reader-diagram">
  <p class="diagram-question">只剩 1 小時，三件事只能做一件。</p>
  <ol class="diagram-options" aria-label="依你重視的程度排列">
   <li><span>首選</span><strong>準備簡報</strong><small>你選了這項</small></li>
   <li class="diagram-forgone"><span>次選</span><strong>練習英文</strong><small>放棄的最佳選項</small></li>
   <li><span>第三</span><strong>看一集劇</strong></li>
  </ol>
  <figcaption>準備簡報的機會成本，是放棄「練習英文」會帶來的價值。</figcaption>
  <details class="diagram-check">
   <summary>換你想：如果選練英文？</summary>
   <p>放棄的最佳選項變成「準備簡報」。機會成本也跟著換成準備簡報的價值。</p>
  </details>
  ${showExpand ? '<button type="button" class="diagram-expand" data-diagram-expand>放大圖解</button>' : ''}
  <span class="reader-context-meta">${readerLink(openStaxCost,'概念來源：OpenStax（英文）')}</span>
 </figure>`;
}

function relatedNewsContext(article, related) {
 const reported = Date.parse(article.published_at);
 if (!Number.isFinite(reported)) return [];
 const day = date(article.published_at);
 const links = related.filter(item => item.sameEvent && item.kind === 'news'
   && Math.abs(Date.parse(item.published_at)-reported) <= 14*86400000
   && safeUrl(item.url));
 const linksByDate = [...links].sort((a,b) => Date.parse(a.published_at)-Date.parse(b.published_at));
 const previous = linksByDate.find(item => Date.parse(item.published_at) < reported && date(item.published_at) !== day);
 const next = linksByDate.find(item => Date.parse(item.published_at) > reported && date(item.published_at) !== day);
 const sameDay = links.find(item => date(item.published_at) === day && item.source !== article.source)
   || links.find(item => date(item.published_at) === day);
 const row = (label, item) => ({label,date:date(item.published_at),text:item.title,link:item});
 if (!previous && !next && !sameDay) return [];
 return [
  ...(previous ? [row('前情報導',previous)] : []),
  row('本篇報導',article),
  ...(sameDay && (!previous || !next) ? [row('同日相關報導',sameDay)] : []),
  ...(next ? [row('後續報導',next)] : [])
 ];
}

function contextRows(article, rows) {
 return `<dl class="reader-context-rows">${rows.map(row => {
 const published = row.useArticleDate ? date(article.published_at) : row.date;
 return `<div>
  <dt>${esc(row.label)}${published ? `<span class="reader-context-meta">${esc(/^\d{4}-\d{2}-\d{2}$/.test(published) ? date(published) : published)}</span>` : ''}</dt>
  <dd>${esc(row.text)}${published ? `<span class="reader-context-meta">${readerLink(row.link || article,(row.link || article).source)}</span>` : ''}</dd>
 </div>`;
 }).join('')}</dl>`;
}

// Reviewed one-sentence definitions. Alternate spellings are matched in the
// actual article, and only the first occurrence of a concept is listed.
const glossaryGroups = [
 {scope:/地震|海嘯|地球科學/,terms:[
  ['震源','地底岩層開始破裂並釋放地震波的位置。'],
  ['震央','地表上位於震源正上方的地點。'],
  ['震源深度','從地表到地震破裂起點的垂直距離。'],
  ['矩震級','根據斷層破裂面積、位移量和岩石性質估計地震大小的量尺。','矩震級規模'],
  ['液化','地震搖晃使飽含水分的鬆散土壤暫時失去原有承載力的現象。','土壤液化'],
  ['海嘯','大量海水因海底地震、山崩等事件突然位移而形成的一系列長波。']
 ]},
 {scope:/環境|生命科學|生態|地球科學/,terms:[
  ['物種豐富度','一定區域內出現的物種數量。'],
  ['物種均勻度','衡量群落中各物種的個體數彼此有多接近。','均勻度'],
  ['優勢種','在群落中數量、覆蓋範圍或生態影響特別大的物種。'],
  ['指標物種','其出現、數量或健康狀況可以反映環境條件的物種。','指標種'],
  ['原生物種','因自然演化或擴散而出現在某地的物種。','原生種'],
  ['入侵種','被引入原有分布範圍之外，並對當地環境、生物或人類活動造成影響的物種。','入侵物種'],
  ['特有種','自然分布侷限在特定地理範圍的物種。'],
  ['棲地破碎化','連續棲地被道路、開發或其他阻隔切成更小而隔離的區塊。','棲息地破碎化'],
  ['群落','在同一區域生活並互相作用的不同物種族群。','生物群落'],
  ['生物量','某一區域或某個生態層級中，生物體有機物質的總量。'],
  ['營養級','生物在食物鏈中的位置，例如生產者、初級消費者或次級消費者。','營養階層'],
  ['食物網','由多條互相交錯的食物鏈組成的能量與物質傳遞關係。'],
  ['優養化','水中氮、磷等養分過多，使藻類快速增生，並可能導致水中缺氧的過程。','富營養化'],
  ['固碳','把空氣或水中的無機碳轉為有機物的過程。','碳固定'],
  ['碳匯','吸收的碳在一定時間內多於釋放量的系統，例如持續蓄積碳的森林。'],
  ['分布區','一個物種自然出現的地理範圍。','分布範圍'],
  ['生殖隔離','不同族群之間因行為、時間或生理等差異而難以交配或產生可繁殖後代。'],
  ['基因流','基因因個體或配子移動及繁殖而在族群之間傳遞。','基因交流'],
  ['族群瓶頸','族群規模短時間大幅減少，使原本的遺傳變異可能隨之流失。','瓶頸效應'],
  ['雜交','來自不同遺傳背景的生物交配並產生後代。'],
  ['共演化','彼此互動的物種對對方造成選擇壓力，因而相互影響演化。','共同演化'],
  ['內共生','一種生物長期生活在另一種生物體內的共生關係。'],
  ['生物放大','某些不易分解或排出的物質，隨生物在食物鏈的位置升高而出現更高濃度。'],
  ['生態演替','一地的物種組成和群落結構隨時間逐步改變的過程。','演替']
 ]},
 {scope:/心理|偏誤|實驗|研究|醫療|安慰劑|科學方法/,terms:[
  ['負增強','當某行為能移除令人不舒服的刺激，使該行為之後更常出現。','負強化'],
  ['操作制約','行為因它帶來的後果而逐漸變得更常或更少出現的學習方式。','操作性制約'],
  ['外在效度','研究結果能延伸到其他人群、情境或時間的程度。'],
  ['內在效度','研究結果中的變化有多大把握可歸因於研究所測試的因素。'],
  ['隨機分派','用隨機程序將參與者分到不同研究組，以減少組間初始差異帶來的影響。','隨機分配'],
  ['樣本偏差','取樣方式讓某些人或資料容易被選中，使樣本不易代表目標群體。','抽樣偏差','取樣偏差'],
  ['隨機抽樣','從目標群體依隨機程序挑選樣本，讓抽樣機率可事先界定。'],
  ['混淆因子','同時與待研究的原因及結果有關，可能扭曲兩者關係的因素。','混雜因子','混雜變項'],
  ['統計顯著性','在指定模型與假設下，觀察到的差異達到了預先設定的統計門檻。','統計顯著'],
  ['效應量','用數字表示差異或關聯的大小。','效果量'],
  ['自我歸因','人利用內在特質或外在情境解釋自己為何有某種行為或結果。'],
  ['內隱聯想','人未必察覺，卻會自動把某一類事物和特定特質或評價連在一起。'],
  ['情緒調節','影響自己何時產生情緒、感受多強，以及如何表達情緒的過程。'],
  ['壓力反應','面對威脅或壓力時出現的身體、情緒或行為變化。'],
  ['酒精依賴','即使飲酒已造成生活困擾，仍很難控制飲酒，酒量下降時也可能出現戒斷。'],
  ['戒斷症狀','身體已習慣某種物質後，在減量或停止使用時出現的不適。','戒斷'],
  ['酒精使用障礙','飲酒行為長期難以控制並造成生活功能受損或明顯困擾的臨床狀況。']
 ]},
 {scope:/藝術|歷史|美術|建築/,terms:[
  ['舊石器時代','以打製石器為辨識特徵的人類史前時期，起訖年代因地區而異。'],
  ['圖像學','研究藝術作品中的圖像、符號和主題如何傳達文化意涵。'],
  ['藝術史','透過作品、史料與創作背景研究藝術形式及其歷史變化的學科。'],
  ['透視法','用線條、比例或明暗等方式，在平面表現物體深度與遠近。'],
  ['木刻版畫','在木板雕刻圖像，將墨轉印到紙張等表面所形成的作品。','木版畫'],
  ['後印象派','對印象派有所承繼又各自發展的藝術家及作品的概稱，常見對色彩、結構或表現方式的探索。','後印象主義'],
  ['壁畫','直接製作於牆壁或天花板等建築表面的圖像。'],
  ['彩繪玻璃','用有色玻璃拼組圖樣、文字或場景的裝飾工藝。'],
  ['拱頂','用拱形結構覆蓋室內空間的建築頂部。'],
  ['維多利亞時代','英國維多利亞女王在位的 1837 到 1901 年。'],
  ['浮世繪','日本江戶時代興盛的繪畫與版畫，常見題材包括城市生活、演員及風景。']
 ]},
 {scope:/科技|資安|程式|數位|加密|身分/,terms:[
  ['雙因素驗證','用兩種不同類型的證明確認身分，例如密碼與實體安全金鑰。','雙重驗證','兩因素驗證'],
  ['私鑰','非對稱密碼系統中由持有人保密的金鑰，可依用途用於簽署或解密。','私密金鑰'],
  ['公開金鑰','與私鑰成對並可公開分享的金鑰，可依用途驗證簽章或加密資料。','公鑰'],
  ['數位憑證','由發行機構簽發、將個人、機構或網站的身分與一把公開金鑰連結的電子文件。'],
  ['雜湊碰撞','兩筆不同輸入經同一雜湊函式處理後，得到相同輸出。'],
  ['最小權限原則','讓每個帳號或程式只取得完成指定工作所需的權限。','最小權限'],
  ['權限提升','帳號或程式取得比它原先擁有的層級更高的權限。','提升權限'],
  ['風險評估','辨識威脅，再衡量事件發生的可能性與造成的影響。'],
  ['災難復原','服務或資料受重大故障影響後，依計畫回復關鍵功能和資料的過程。','災害復原']
 ]},
 {scope:/邏輯|推理|謬誤|哲學|人文/,terms:[
  ['前提','在一段論證中用來支持結論的陳述。'],
  ['演繹論證','如果推理有效，只要各前提為真，結論也必須為真的論證。','演繹推理'],
  ['歸納推理','根據觀察到的案例推估較一般的結論，結論的可靠性取決於證據。','歸納論證'],
  ['充分條件','只要條件成立，就足以使另一個結果成立。'],
  ['必要條件','某項結果成立時必定要具備的條件。'],
  ['反例','一個足以顯示某項普遍主張有例外的個案。'],
  ['循環論證','用必須先接受結論的理由來支持結論，因此缺乏獨立的論證基礎。','循環推理'],
  ['外延','一個概念實際涵蓋的對象集合。'],
  ['內涵','決定哪些對象符合一個概念的特徵或條件。'],
  ['等價','在指定的條件下，兩個命題具有相同的真假結果，因而可互相推出。','邏輯等價']
 ]},
 {scope:/商業|經濟|住房|成本/,terms:[
  ['公共財','難以排除他人使用，且多一人使用通常不減少其他人可使用程度的財貨。','公共物品'],
  ['搭便車','在未負擔相應成本的情況下，享受他人出資或付出所帶來的利益。','免費搭車'],
  ['非排他性','一項財貨供應後，很難排除未付費者使用。','非排除性'],
  ['非競爭性','多一個人使用某項財貨時，其他人可使用的程度通常不會降低。','非敵對性'],
  ['逆向選擇','交易前一方資訊較少，可能使高風險或低品質的選項更容易留下來。'],
  ['道德風險','在風險由他人分擔時，當事人的行為可能因而改變並承擔更多風險。'],
  ['消費者物價指數','用有代表性的消費品與服務組合追蹤家庭消費價格變動的指標。','CPI'],
  ['權重','某項價格納入整體指標時所占的比重。']
 ]},
 {
  scope:/抗生素|微生物|醫療|生命科學|公共衛生/i,
  source:{url:'https://www.cdc.gov/narms/glossary/',source:'美國 CDC 抗藥性詞彙表（英文）'},
  terms:[
   ['抗生素','能殺死細菌或阻止細菌生長的一類藥物。'],
   ['抗生素抗藥性','細菌能抵抗原本用來對付它的抗生素，使藥物較難奏效。','抗藥性','抗藥'],
   ['抗微生物藥物','對付微生物的藥物總稱，包括對付細菌的抗生素、抗病毒藥與抗黴菌藥。','抗微生物製劑'],
   ['多重抗藥性','同一菌株對多類抗微生物藥物具有抗藥性，因此可選用的藥物可能變少。','MDR'],
   ['病原體','能引起疾病的生物或感染因子，例如某些細菌、病毒或寄生蟲。','病原微生物','致病菌'],
   ['菌株','同一種細菌中可個別辨識和研究的一個分支。'],
   ['藥物敏感性','描述特定藥物對這株細菌是否仍有效。','感受性','藥物感受性'],
   ['藥物敏感性試驗','在實驗室測試某株細菌對不同藥物的反應，協助判斷可能有效的選擇。','藥敏試驗','抗生素敏感性測試'],
   ['廣效抗生素','能對多種不同細菌發揮作用的抗生素。','廣效'],
   ['MIC','最低抑菌濃度，指在檢測條件下可以阻止細菌可見生長的最低藥物濃度。','最低抑菌濃度']
  ]
 },
 {scope:/抗生素抗藥性/, terms:[
   ['第一線藥物','針對特定疾病通常優先考慮使用的藥物。','第一線抗生素'],
   ['二線藥物','第一線藥物不適用或效果不足時，醫師可能改用的替代藥物。','二線抗生素','第二線'],
   ['選汰壓力','環境使某些個體比其他個體更容易存活或繁殖，久而久之會改變族群組成。','選擇壓力','選擇性壓力','自然選擇'],
   ['基因突變','遺傳物質的序列發生改變，結果可能影響某項特徵，也可能沒有明顯影響。','突變'],
   ['質體','有些細菌體內可獨立複製的小型 DNA 分子。','質粒'],
   ['院內感染','接受醫療照護期間取得的感染，在開始照護時通常尚未發生。','醫療照護相關感染']
 ]},
 {scope:/醫療|生命科學|研究|科學方法|試驗/,terms:[
   ['隨機分派','用機會決定參與者分到哪一組，讓各組在試驗開始時較能公平比較。','隨機分配'],
   ['對照組','用來和接受研究處置的組別比較的組別，可接受標準處置、安慰劑或其他設計指定的條件。','控制組'],
   ['安慰劑','外觀或施用方式與受測處置相近，但缺少研究要檢驗的特定有效成分或作用的對照。'],
   ['雙盲','研究的兩方不知道受試者分組，通常指參與者與負責評估或施作的人。','雙盲試驗'],
   ['混雜因子','同時與可能原因及研究結果有關，因而可能使兩者關係看起來比實際更強或更弱的因素。','混雜變數'],
   ['統計顯著','在指定的模型和門檻下，觀察結果足以提供反對虛無假設的證據。','統計顯著性'],
   ['樣本量','研究實際納入的觀察單位數量，例如參與者人數。','樣本數'],
   ['等位基因','同一個基因在族群中可能存在的不同版本。'],
   ['表觀遺傳','在 DNA 序列維持原樣時，細胞調控基因表現的方式及其變化。','表觀遺傳學'],
   ['基因表現','細胞使用基因上的資訊產生 RNA 或蛋白質的過程。','基因表達'],
   ['粒線體','多數真核細胞中負責把養分中的能量轉成細胞可用形式的構造。','線粒體'],
   ['細胞凋亡','細胞依照內部訊號啟動的一種受控制死亡過程。','計畫性細胞死亡','程式性細胞死亡'],
   ['表型','個體可觀察或可量測的特徵，通常同時受遺傳與環境影響。','表現型'],
   ['基因型','個體在一個或多個基因位置所擁有的遺傳版本組合。'],
   ['遺傳漂變','由於繁殖帶有隨機性，某種基因版本即使沒有優勢，也可能在族群中逐代變多或變少。','基因漂變']
 ]},
 {scope:/地震|海嘯/,source:{url:'https://scweb.cwa.gov.tw/zh-tw/guidance/faqdetail/26',source:'中央氣象署地震測報中心'},terms:[
   ['地震規模','表示一次地震釋放能量大小的數值，同一場地震的規模不因觀測地點而異。','規模'],
   ['震度','表示某個地點實際搖晃的強弱，因此同一場地震在各地的震度可能不同。'],
   ['震源','地下開始破裂並引發地震的位置。'],
   ['震央','震源垂直投影到地表的位置。'],
   ['振幅','振動偏離平衡位置的最大程度。','震波振幅']
 ]},
 {scope:/生態|環境|生物多樣性|演化|碳循環|碳迴圈/,terms:[
   ['生態系統','同一區域的生物與水、土壤、氣候等非生物環境彼此作用形成的系統。','生態系'],
   ['棲息地','一種生物可以生活、取得資源並繁衍的地方。','棲地'],
   ['生態位','一種生物在生態系中的生活方式，包括它如何取用資源、適應環境與其他生物互動。'],
   ['食物網','多條食物鏈交織而成的取食關係。'],
   ['營養級','生物在食物鏈中的位置，例如植物位於生產者層，吃植物的動物位於下一層。'],
   ['生物累積','某物質被生物吸收後，若進入的速度比排出或分解快，就會在體內逐漸堆積。'],
   ['物種豐富度','某個地點或群落包含的不同物種數量。'],
   ['地方特有種','自然分布限於特定地區的物種。','特有種'],
   ['光合作用','植物等生物利用光能，把二氧化碳等原料轉成可儲存能量的有機物。'],
   ['初級生產','自營生物把環境中的能量轉成有機物的過程，構成許多食物網的基礎。']
 ]},
 {scope:/經濟|住房|租屋|成本|選擇/,terms:[
   ['機會成本','做出選擇時，所放棄的最佳可行方案能帶來的價值。'],
   ['沉沒成本','過去已經付出，目前無法收回的成本。'],
   ['比較優勢','在生產某項物品時，放棄其他產出的代價比另一個人或地區低。'],
   ['公共財','很難阻止未付費者使用，且一個人使用通常不會減少別人可用量的財或服務。','公共物品'],
   ['資訊不對等','交易雙方掌握的相關資訊不同，使其中一方在判斷或議價時處於不利。','資訊不對稱'],
   ['消費者物價指數','衡量一般家庭購買的一籃子商品與服務，其價格平均如何隨時間變動的指標。','CPI'],
   ['權數','用來表達不同項目對總指標影響程度的比重。','權重'],
   ['通貨膨脹','整體價格水準持續上漲，使相同金額通常買到較少商品與服務。','通膨'],
   ['社會住宅','由政府興辦或利用民間住宅提供、以出租為主並依制度分配的住宅。','社宅'],
   ['包租代管','由專業業者承租後轉租，或受房東委託處理招租、簽約與租屋管理。']
 ]},
 {scope:/心理|人類行為|學習|偏誤|思維/,terms:[
   ['認知偏誤','人們在理解資訊或做判斷時，出現有規律的偏差。','認知偏差'],
   ['確認偏誤','偏向尋找或相信支持原本看法的資訊，較少重視相反證據。','確認偏差','證實偏差'],
   ['損失規避','同樣金額的損失與獲益相比，損失往往帶來更強烈的感受。'],
   ['倖存者偏差','只觀察留下來或看得見的案例，忽略被淘汰的案例，因而誤判整體。','倖存者偏誤'],
   ['間隔效應','把學習分散在多次時段，通常比集中在一次更有利於長期記憶。'],
   ['間隔重複','在不同時間點重新回想所學內容，並逐步調整下次複習時間的做法。'],
   ['中性刺激','在建立連結前，尚不會引發研究所關注反應的刺激。'],
   ['制約刺激','經過學習後，原先中性的刺激本身就能引發特定反應。','條件刺激'],
   ['制約反應','由學習得到的連結所引起的反應。','條件反射','條件反應'],
   ['無條件刺激','未經學習就能自然引出特定反應的刺激。','非制約刺激','無制約刺激'],
   ['無條件反應','不必經過學習，受到某個刺激時自然出現的反應。','非制約反應','無制約反應']
 ]},
 {scope:/邏輯|謬誤|論證|哲學|科學方法/,terms:[
   ['前提','論證中拿來支持某個結論的理由或起始陳述。'],
   ['結論','論證試圖用理由支持的主張。'],
   ['演繹推理','如果推理形式有效，只要前提為真，結論就必定為真。','演繹論證'],
   ['歸納推理','從觀察的例子整理出較一般的判斷，結論可以有理由支持但仍可能出錯。','歸納論證'],
   ['反例','一個與普遍主張相矛盾的例子，可用來檢查該主張是否成立。'],
   ['稻草人論證','把對方原本的觀點改成比較容易批評的版本，再反駁這個版本。','稻草人謬誤'],
   ['滑坡謬誤','在缺少各環節證據時，斷言第一步必定一路導致嚴重後果。'],
   ['人身攻擊','用個人身分或特質否定其主張，卻沒有處理主張本身的證據與理由。','訴諸人身'],
   ['可證偽性','一個主張在原則上允許人們設計觀察或試驗，檢查它是否可能被推翻。','可否證性']
 ]},
 {scope:/科技|資訊|資安|加密|數位|程式|驗證/,terms:[
   ['雜湊函式','把輸入資料轉成固定長度指紋的函式，常用來檢查資料有沒有改動。','雜湊函數','哈希函數'],
   ['公開金鑰','加密系統中可以公開分享的一把金鑰，常用來驗證簽章或將資料加密給持有私鑰的人。','公鑰'],
   ['私密金鑰','和公開金鑰配對、需妥善保密的一把金鑰，常用來簽章或解密。','私鑰','私有金鑰'],
   ['多因素身分驗證','以兩種以上不同類型的證明確認身分，例如密碼加上手機或安全金鑰。','多因素身份驗證','雙因素驗證','多重身分驗證','MFA','2FA'],
   ['數位簽章','用密碼學證明文件由持有相應金鑰的人簽署，並讓收件者檢查內容是否被改動。','數位簽名'],
   ['社交工程','藉由利用人的信任或判斷習慣，誘使對方透露資訊或採取行動。','社會工程學'],
   ['零日漏洞','一般指軟體供應商或使用者尚未有足夠時間因應或修補的安全弱點。','零時差漏洞'],
   ['版本控制','記錄檔案每次修改及其時間、內容與作者，方便比較、協作和還原。','版本管理'],
   ['異地備援','在不同地點準備可接手的資料或系統，以降低單一地點事故造成的停擺風險。']
 ]},
 {scope:/藝術|人文|歷史|語言|檔案/,terms:[
   ['浮世繪','興盛於日本江戶時代、描繪當時城市生活與風景等題材的藝術，常以木版畫流傳。'],
   ['印象派','十九世紀形成的藝術流派，常透過色彩與筆觸捕捉光線和景物的瞬間變化。','印象主義'],
   ['文藝復興','歐洲部分地區重新重視古典文化並推動藝術、學術與思想轉變的一段歷史時期。'],
   ['人文主義','把人的經驗、理性與能力視為研究和教育重心的一類思想取向。'],
   ['透視法','在平面上用線條、大小與位置表現物體遠近和空間深度的方法。','線性透視'],
   ['題跋','寫在書畫或文獻前後的短文，可記下創作背景、收藏經過或觀看心得。'],
   ['典藏','機構對具保存價值的物件或文件進行有系統的保存、整理和管理。'],
   ['國家檔案','經鑑定具有永久保存價值、由國家檔案主管機關接收管理的機關檔案。']
 ]},
 {scope:/心理|思維|人類行為|壓力/,terms:[
   ['批判性思維','根據證據檢查一個主張的理由、假設和可能的反面解釋，再形成自己的判斷。','批判性思考'],
   ['團體迷思','團體為了維持一致而忽略不同意見，因而降低判斷品質的現象。'],
   ['巴納姆效應','人們容易把普遍適用的模糊描述當成只符合自己的個性分析。','巴納姆效果','佛瑞效果'],
   ['生日數字效應','人們在部分任務中傾向偏好出現在自己生日日期中的數字。','生日數字效果'],
   ['估計量','用樣本資料計算未知母體特徵的一個公式或規則。'],
   ['估計量偏差','重複抽樣時，估計量的平均結果和要估計的真值之間的差。','估計量的偏誤','估計量的偏差'],
   ['控制點','描述一個人傾向把結果歸因於自己的行動，還是運氣、他人等外在因素。','控制源'],
   ['觀察者偏差','觀察者原有的期待可能影響自己記錄、解讀或判定看到的結果。'],
   ['虛假平衡','把證據強弱差很多的兩種說法放在同等位置，讓讀者誤以為兩邊同樣可信。'],
   ['自證預言','一個原本未必正確的期待影響了行為，反而讓期待的結果更容易出現。'],
   ['空想性錯視','從隨機圖案或聲音中感覺到熟悉形象或訊息，例如把雲看成人臉。','空想性錯覺'],
   ['冷處理','刻意減少話題的曝光、回應與宣傳，讓公眾注意力逐漸轉移。'],
   ['姓名決定論','探討姓名與職業或生活選擇是否存在關聯的一種假說。'],
   ['議題設定','媒體透過選擇報導哪些議題及報導份量，影響大眾認為哪些事情重要。'],
   ['急性壓力反應','受到突發事件刺激後短時間內出現的情緒、身體或思考變化。','壓力反應'],
   ['酒精使用疾患','飲酒模式持續造成明顯困擾或功能受損的一類健康問題。','酒精使用障礙','酒精成癮']
 ]},
 {scope:/藝術|歷史|人文|語言/,terms:[
   ['語言相對論','主張人使用的語言可能影響他注意、分類或理解事物的方式。','沙皮爾-沃爾夫假說'],
   ['包豪斯','德國在二十世紀初創辦的藝術與設計學校，強調結合設計、工藝與實作。','包浩斯','Bauhaus'],
   ['絲綢之路','古代跨越歐亞等地、用於交換商品、技術與文化的多條商旅路線。','絲路'],
   ['羅馬式美術','中世紀歐洲的藝術傳統，常見於教堂雕刻、壁畫與手抄本。','羅曼式美術'],
   ['羅曼式建築','中世紀歐洲常見的一種建築風格，教堂多見厚牆、圓拱和較小窗戶。','羅馬式建築'],
   ['洞穴壁畫','繪在洞穴岩壁或頂部的圖像，可提供研究史前生活與藝術的線索。','岩洞壁畫'],
   ['媒體藝術','以影像、聲音、電腦等媒介或技術作為創作材料的藝術。','新媒體藝術','數位藝術'],
   ['穴怪圖','歐洲裝飾藝術中常見把人物、動植物和奇幻想像重新組合的紋飾。','穴怪影象','穴怪圖像'],
   ['國家語言','依臺灣《國家語言發展法》，指臺灣各固有族群使用的自然語言及臺灣手語。'],
   ['語言復振','透過教學、媒體和公共使用等方式，讓日漸少用的語言重新有人學習和使用。','復振']
 ]},
 {scope:/環境|生態|氣候/,terms:[
   ['城市承載力','在現有資源、技術和生活條件下，一座城市能長期支持的人口與活動規模。','城市負載力'],
   ['副極地氣候','通常出現在較高緯度的氣候，特徵是冬季漫長寒冷、夏季短。','亞寒帶氣候'],
   ['異域物種形成','同一族群因地理阻隔而分開演化，久後可能變成彼此難以交配繁殖的不同物種。','異域種化'],
   ['物種形成','族群隨時間分化，最終成為不同物種的演化過程。','種化'],
   ['物候學','研究開花、落葉或候鳥遷徙等週期性現象何時發生，以及它們如何隨環境改變。','物候'],
   ['反文化','以生活方式、藝術或集體行動挑戰主流社會價值與規範的文化。','反文化運動'],
   ['屍體腐敗','死亡後，微生物等逐步分解身體組織的過程。'],
   ['分解者','把死亡生物或有機廢物分解成更簡單物質的生物，例如某些細菌和真菌。'],
   ['灌溉','用人工方式將水送到農地，以補充作物生長所需的水分。']
 ]},
 {scope:/邏輯|謬誤|機率|推理|定義/,terms:[
   ['謬誤','推理或論證中的漏洞，會讓結論看似有道理卻缺乏適當支持。'],
   ['言詞謬誤','因詞語含糊或前後用法不同，導致推論不成立。'],
   ['假合取','把選項說成必須整套接受或拒絕，卻忽略其中各項可以分開判斷。'],
   ['定義謬誤','對詞語採用太窄、太廣或有偏向的定義，使後續推理建立在不合適的意思上。'],
   ['條件機率','在已知某件事發生的前提下，另一件事會發生的機率。'],
   ['賽局理論','研究不同參與者彼此影響時，各自如何選擇策略的學問。','博弈論'],
   ['破窗謬論','只看見修復破壞帶來的支出，忽略同一筆資源原本可創造的其他價值。'],
   ['說服性定義','用帶有褒貶的用語替一個詞下定義，藉此讓讀者更容易接受某種立場。']
 ]},
 {scope:/科技|資安|程式|MyData|數位/,terms:[
   ['行政法人','依法律設立，承擔特定公共任務並有一定運作自主性的組織。'],
   ['有線電視','透過實體線路而非空中廣播將電視訊號送到訂戶的一種服務。'],
   ['混淆代理人問題','系統中的代辦程式誤把自己的權限用在未獲授權的請求上。','混淆代理問題'],
   ['數位浮水印','把可辨識的資訊嵌入圖片、聲音或影像，方便標示來源或識別資料。'],
   ['威脅模型','整理系統中值得保護的資產、可能威脅與風險的表示方式，用來規劃防護。','威脅模型分析'],
   ['公共程式','政府開發且依規定釋出的程式原始碼，讓外界能檢視、重用或共同改進。'],
   ['開放原始碼','以允許檢視、使用、修改與分享的授權提供程式原始碼。','開源'],
   ['公民科技','以數位工具和開放協作改善公共服務或促進民眾參與的做法。'],
   ['身分驗證','確認正在使用服務的人確實是其聲稱身分的程序。','身份驗證'],
   ['自主同意','由本人了解資料用途與傳送對象，再決定是否允許分享資料。'],
   ['警察刑事紀錄證明','俗稱良民證，由警察機關依規定核發，用來證明申請人的刑事紀錄情形。','良民證'],
   ['MyData','讓民眾完成身分驗證與同意後，取得或傳送個人政府資料以辦理指定服務的平台。']
 ]},
 {scope:/食品|醫療|保健/,terms:[
   ['冷鏈','在運送、儲存與販售的各個環節維持所需低溫的一套流程。'],
   ['冷凍食品','用低溫使食物凍結，並須按標示條件運輸及保存的食品。'],
   ['預防保健','在症狀出現前，以健康檢查、諮詢或其他措施提早發現與降低健康風險。'],
   ['健康篩檢','在尚未出現明顯症狀的人群中，用檢查找出可能需要進一步評估的人。','篩檢'],
   ['糞口傳染','病原從感染者排出的糞便污染手、食物或水，之後經另一個人的口進入體內。','糞口']
 ]}
];

function knowledgeTextParts(article) {
 return hasChinese(article) && article.translation_status !== 'original_zh_hant'
  ? article.evidence_zh_hant : originalParts(article);
}

function glossaryPassages(article) {
 const parts = knowledgeTextParts(article);
 const end = parts.findIndex(part => /^=+\s*(?:參考|外部連結|延伸閱讀|腳註|註釋|注釋)/.test(part.trim()));
 return end < 0 ? parts : parts.slice(0,end);
}

function findGlossaryWord(text, word) {
 if (!/^[A-Za-z0-9-]+$/.test(word)) return text.indexOf(word);
 const match = text.match(new RegExp('(^|[^A-Za-z0-9])'+word+'(?=$|[^A-Za-z0-9])','i'));
 return match ? match.index + match[1].length : -1;
}

// An article can supply a new term only when its introduction explicitly
// defines that term in a complete, short sentence.
function sourceDefinition(article) {
 const term = (article.title || '').trim();
 if (!/^[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·-]{1,23}$/u.test(term)) return null;
 const lead = knowledgeTextParts(article).find(hasText)?.trim() || '';
 if (!lead.startsWith(term)) return null;
 const firstSentence = lead.match(/^[^。！？；\n]{8,140}。/)?.[0];
 if (!firstSentence) return null;
 const rest = firstSentence.slice(term.length)
  .replace(/^(?:\s*[（(][^）)]{1,100}[）)])*[，,、\s]*/, '')
  .replace(/^(?:(?:亦稱為?|又稱為?|或稱為?|也稱為?|也被稱為|亦作)[^。；]{1,45}?[，,]\s*)/, '');
 if (!/^(?:通常指|泛指|係指|是指|指的是|指|是一種|是一個|是由|是一門|是在|是一項|為一種)/.test(rest)) return null;
 const definition = rest.replace(/\s*\[\d+\]/g, '');
 return {term, definition:term+definition, source:article, fromSource:true};
}

function definitionsInArticle(parts, article) {
 const terms = [];
 // A bilingual name plus explicit definition at the start of a sentence
 // distinguishes a term from ordinary phrases that merely contain 「是」.
 const definition = /^([\p{Script=Han}]{2,16})\s*[（(](?=[^）)]{0,70}[A-Za-z])[^）)]{2,74}[）)]\s*[，,]?\s*((?:係指|是指|指的是|指|是一種|是一個|是一門)[^。！？；]{4,110}。)$/u;
 for (const paragraph of parts) {
  for (const sentence of paragraph.match(/[^。！？\n]+。/g) || []) {
   const match = sentence.trim().match(definition);
   if (match) terms.push({term:match[1], definition:match[1]+match[2], source:article});
  }
 }
 return terms;
}

function readerGlossary(article, supplement) {
 const parts = glossaryPassages(article);
 const text = parts.join('\n');
 const title = article.title || '';
 const position = term => findGlossaryWord(text, term);
 const matches = new Map();
 const covered = new Set();
 function add(term, definition, source, aliases=[], fromSource=false) {
  if (covered.has(term)) return;
  const words = [term, ...aliases];
  const found = words.map(word => ({word, index:position(word)})).filter(item => item.index >= 0)
   .sort((a,b) => a.index-b.index || b.word.length-a.word.length);
  if (!found.length) return;
  matches.set(term,{term,definition,source,fromSource,index:found[0].index,
   variant:found.some(item => item.word === term) ? null : found[0].word});
  words.forEach(word => covered.add(word));
 }
 for (const [term,definition] of supplement.terms || []) add(term,definition,supplement.source);
 for (const group of glossaryGroups) {
  if (!group.scope.test([title,article.category,topicOf(article)].join(' '))) continue;
  for (const [term, definition, ...aliases] of group.terms) add(term,definition,group.source,aliases);
 }
 for (const def of definitionsInArticle(parts,article)) {
  add(def.term,def.definition,def.source,[],true);
 }
 for (const entry of [article,...state.news.filter(candidate => candidate.url !== article.url
   && candidate.kind === 'knowledge' && topicOf(candidate) === topicOf(article)
   && (hasApprovedFullText(candidate) || isTextEdition(candidate)) && hasChinese(candidate))]) {
  const def = sourceDefinition(entry);
  if (def) add(def.term,def.definition,def.source,[],true);
 }
 return [...matches.values()].sort((a,b) => a.index-b.index || b.term.length-a.term.length);
}

function glossaryContent(terms) {
 if (!terms.length) return '';
 return `<section class="reader-glossary" aria-label="術語解釋">
  ${terms.length > 1 ? `<label class="glossary-filter">搜尋 ${terms.length} 個術語<input type="search" data-glossary-search placeholder="輸入關鍵字"></label>` : ''}
  <dl class="reader-context-rows">${terms.map(item => `<div data-glossary-row>
   <dt>${esc(item.term)}${item.variant ? ` <small>（文中：${esc(item.variant)}）</small>` : ''}</dt>
   <dd>${esc(item.definition)}${item.source ? `<span class="reader-context-meta">${readerLink(item.source,item.fromSource?'定義來源｜'+item.source.title:item.source.source)}</span>` : ''}</dd>
  </div>`).join('')}</dl>
  <p class="glossary-no-results" hidden>找不到符合的術語。</p>
 </section>`;
}

function filterReaderGlossary(input) {
 const glossary = input.closest('.reader-glossary');
 const query = input.value.trim().normalize('NFKC').toLocaleLowerCase('zh-TW');
 const rows = [...glossary.querySelectorAll('[data-glossary-row]')];
 for (const row of rows) row.hidden = !row.textContent.normalize('NFKC').toLocaleLowerCase('zh-TW').includes(query);
 glossary.querySelector('.glossary-no-results').hidden = rows.some(row => !row.hidden);
}

function readerAside(title, content, side) {
 if (!content) return '';
 return `<aside class="reader-aside reader-aside-${side}" aria-label="${esc(title)}">
  <button class="reader-float-button" type="button" data-reader-panel="${side}" aria-haspopup="dialog">${esc(title)}</button>
  <div class="reader-aside-inner"><h2>${esc(title)}</h2><div class="reader-aside-content">${content}</div></div>
 </aside>`;
}

function readerLayout(article) {
 const supplement = readerSupplements[article.id] || {};
 const related = sourcesForReader(article);
 const left = readerAside('延伸閱讀',relatedReaderContent(related,supplement.related || []),'left');
 let right = '';
 let diagramDialog = '';
 if (article.kind === 'knowledge') {
  const terms = glossaryContent(readerGlossary(article,supplement));
  let diagram = '';
  if (supplement.diagram === 'opportunity-cost') {
   diagram = `<section class="reader-panel-diagram"><h3>圖解 · 機會成本</h3>${reviewedCostDiagram()}</section>`;
   diagramDialog = `<dialog class="reader-diagram-dialog" aria-labelledby="diagram-title">
    <form method="dialog"><button class="btn" type="submit">關閉</button></form>
    <h2 id="diagram-title">機會成本</h2>${reviewedCostDiagram(false)}
   </dialog>`;
  }
  right = readerAside(terms?'術語解釋':'圖解',diagram+terms,'right');
 } else {
  const rows = supplement.context || relatedNewsContext(article,related);
  if (rows.length) right = readerAside('新聞脈絡',contextRows(article,rows),'right');
 }
 const panelDialog = left || right ? `<dialog class="reader-panel-dialog" id="reader-panel-dialog" aria-labelledby="reader-panel-title">
  <header class="reader-panel-header">
   <h2 id="reader-panel-title"></h2>
   <form method="dialog"><button class="btn" value="close" autofocus>關閉</button></form>
  </header>
  <div class="reader-panel-body"></div>
 </dialog>` : '';
 return `<div class="reader-layout${left || right ? ' has-reader-asides' : ''}">
  ${reader(article)}${right}${left}${panelDialog}${diagramDialog}
 </div>`;
}

function openReaderPanel(trigger) {
 const dialog = document.querySelector('.reader-panel-dialog');
 const aside = trigger.closest('.reader-aside');
 if (!dialog || !aside || dialog.open) return;
 dialog.querySelector('h2').textContent = aside.getAttribute('aria-label');
 const content = aside.querySelector('.reader-aside-content');
 const clone = content.cloneNode(true);
 const search = clone.querySelector('[data-glossary-search]');
 if (search) {
  search.value = '';
  filterReaderGlossary(search);
 }
 const body = dialog.querySelector('.reader-panel-body');
 body.replaceChildren(clone);
 dialog.showModal();
 body.scrollTop = 0;
}

document.addEventListener('input',event => {
 if (event.target.matches('[data-glossary-search]')) filterReaderGlossary(event.target);
});
const readerDesktop = window.matchMedia?.('(min-width: 1200px)');

function render(){document.querySelector('#streak').textContent=`已讀 ${state.read.length} 篇`;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));const main=document.querySelector('#main');const toolbar=document.querySelector('#explore-toolbar');const filterOffset=toolbar.dataset.page===state.page?(toolbar.querySelector('.explore-topics')?.scrollLeft||0):0;toolbar.innerHTML='';if(state.selected){const a=state.news.find(x=>x.url===state.selected);if(a){
 toolbar.innerHTML='<button type="button" class="back reader-back" data-back="1">← 返回探索</button>';
 main.innerHTML=readerLayout(a);
 return;
 }state.selected=null}const n=state.news;if(state.page==='news'||state.page==='knowledge'){
 const {controls, content}=explore(n);
 toolbar.dataset.page=state.page;
 toolbar.innerHTML=controls;
 toolbar.querySelector('.explore-topics').scrollLeft=filterOffset;
 main.innerHTML=content;
}
else if(state.page==='saved'){const a=n.filter(x=>state.saved.includes(x.url));main.innerHTML=`<div class="sectionhead"><h2>我的收藏書架</h2></div>${a.length?`<div class="grid">${a.map(article).join('')}</div>`:'<div class="empty">尚未收藏文章。看到喜歡的主題時，按下「收藏」即可。</div>'}`}
else if(state.page==='stats'){const aw=awards();main.innerHTML=`<div class="sectionhead"><h2>學習足跡</h2><button class="btn primary" data-challenges="1">開始知識挑戰</button></div><div class="grid"><div class="card"><div class="card-body"><div class="stat">${state.read.length}</div><p>已閱讀篇數</p></div></div><div class="card"><div class="card-body"><div class="stat">${state.saved.length}</div><p>收藏文章數</p></div></div></div><div class="badge-grid"><div class="badge-card">🏆 <strong>${aw.xp} XP</strong><small>知識經驗值</small></div><div class="badge-card">📖 <strong>${aw.completed} 篇</strong><small>挑戰完成</small></div><div class="badge-card">⭐ <strong>${aw.perfect} 篇</strong><small>滿分達成</small></div><div class="badge-card ${aw.completed>=1?'unlocked':'locked'}">🏅 <strong>初次探索</strong><small>完成首次挑戰</small></div><div class="badge-card ${aw.perfect>=3?'unlocked':'locked'}">🏅 <strong>理解達人</strong><small>三次滿分</small></div><div class="badge-card ${aw.completed>=5?'unlocked':'locked'}">🏅 <strong>閱讀冒險家</strong><small>完成五篇挑戰</small></div></div><div class="notice">紀錄保存在目前的瀏覽器，不會跨裝置同步。已閱讀不等於完成事實核查。</div>`}
else main.innerHTML=`<div class="sectionhead"><h2>我們如何對待資訊</h2></div><div class="notice">來源包括政府機關、具編輯責任的可信媒體，以及開放授權百科。Yahoo 為新聞聚合平台，原始媒體及全文以原站標示為準；媒體報導不等於研究共識，百科也可能有錯。以不同來源互相核對。經核對授權的繁中內容可完整閱讀，並附原始發布頁與授權連結。官方知識專題經閱讀審核；百科文字版會檢查正文長度與段落，排除消歧義與公式依賴頁面，這項自動檢查不等於人工事實審查，原站附件或圖表只能作為補充。文章須先交代核心概念，再按讀者能理解的順序說明。表格資料須保留欄位與數值的對應，純欄位清單或發布規格不作為知識文章。網域核對不能證明所有主張正確；中文來源優先；英文資料未完成中文翻譯時不作一般推薦，翻譯可能因模型或資源限制失敗，不能保證完全準確。無摘要或無翻譯時明確標示，不捏造。完整轉載須確認授權。</div>`}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.refresh){refreshContent(true)}else if(b.dataset.shelf){state.shelf=b.dataset.shelf;render()}else if(b.dataset.next){const a=state.news.find(x=>x.url===b.dataset.next);if(!state.read.includes(b.dataset.next))state.read.push(b.dataset.next);persist();const next=readingQueue(state.news,a?.kind==='knowledge'?'knowledge':'news')[0];state.selected=next?.url||null;state.mode='zh';render();window.scrollTo(0,0)}else if(b.dataset.challenges){state.page='knowledge';state.filter='有測驗';state.selected=null;render()}else if(b.dataset.page){state.page=b.dataset.page;state.filter='全部';state.selected=null;render()}else if(b.dataset.filter){state.filter=b.dataset.filter;render()}else if(b.dataset.readerPanel){openReaderPanel(b)}else if(b.hasAttribute('data-diagram-expand')){document.querySelector('.reader-diagram-dialog')?.showModal?.()}else if(b.dataset.open){if(!state.selected)explorationScroll=window.scrollY;state.selected=b.dataset.open;state.mode='zh';render();window.scrollTo(0,0)}else if(b.dataset.back){state.selected=null;render();window.scrollTo(0,explorationScroll)}else if(b.dataset.mode){state.mode=b.dataset.mode;render()}else if(b.dataset.save){state.saved=state.saved.includes(b.dataset.save)?state.saved.filter(x=>x!==b.dataset.save):[...state.saved,b.dataset.save];persist();render()}else if(b.dataset.quizReset){delete state.quizResults[b.dataset.quizReset];persist();render()}
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
 const controller = new AbortController();
 const deadline = setTimeout(() => controller.abort(), 12000);
 try {
  const response = await fetch(url, {cache:'no-store', signal:controller.signal});
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data?.items)) throw new Error('invalid article data');
  const items = data.items.filter(item => item && typeof item.url === 'string');
  if (data.items.length && !items.length) throw new Error('invalid articles');
  return {...data, items};
 } finally {
  clearTimeout(deadline);
 }
}

async function readArticleSource(source) {
 try {
  return await readNews('./data/' + source.file);
 } catch (error) {
  if (!source.backup) throw error;
  return readNews(RAW_DATA + source.file);
 }
}

function applyArticleData() {
 const daily = articleData.get('daily');
 const taiwan = articleData.get('taiwan');
 const catalog = articleData.get('catalog');
 const sources = {...daily?.sources, ...catalog?.sources};
 for (const source of DATA_SOURCES) {
  if (failedData.has(source.key)) sources[source.label] = {status:'error'};
 }
 const dates = [daily?.updated_at, catalog?.updated_at].filter(Boolean).sort();
 state.meta = {updated_at:dates.at(-1), catalog_at:catalog?.updated_at, sources};
 state.news = mergeArticles(taiwan?.items || [], [
  ...(daily?.items || []), ...(catalog?.items || [])
 ]);
}

async function refreshContent(manual=false) {
 if (refreshPending) return;
 refreshPending = true;
 const previous = new Set(state.news.map(article => article.url));
 state.refreshMessage = manual ? '正在取得最新新聞與知識…' : '';
 try {
  if (!state.selected) render();
  await Promise.allSettled(DATA_SOURCES.map(async source => {
   try {
    const data = await readArticleSource(source);
    articleData.set(source.key, data);
    failedData.delete(source.key);
   } catch {
    failedData.add(source.key);
   }
   applyArticleData();
   if (!state.selected) render();
  }));
  if (manual) {
   const added = state.news.filter(article => !previous.has(article.url)).length;
   if (added) state.refreshMessage = `已取得 ${added} 篇新增內容。`;
   else if (failedData.size === DATA_SOURCES.length) state.refreshMessage = '文章更新失敗，請稍後重試。';
   else state.refreshMessage = '已取得目前可用內容。';
  }
 } finally {
  lastRefresh = Date.now();
  refreshPending = false;
  if (!state.selected) render();
 }
}
refreshContent();
readerDesktop?.addEventListener('change',event => {
 if (event.matches) document.querySelector('.reader-panel-dialog[open]')?.close();
});
setInterval(()=>{if(!document.hidden&&!state.selected)refreshContent()},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastRefresh>60000)refreshContent()});
window.addEventListener('online',()=>refreshContent());
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
