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
function article(a){const saved=state.saved.includes(a.url),read=state.read.includes(a.url);return `<article class="card">${imageMarkup(a)}<div class="card-body"><div class="meta">${a.demo?'【原創示範】 ':''}${esc(a.category)} · ${esc(a.source)}${a.byline?` / ${esc(a.byline)}`:''} · ${a.kind==='knowledge'?'知識專題':esc(date(a.published_at))}</div><h3>${esc(a.title)}</h3>${quizData(a)?'<div class="meta">附知識挑戰</div>':''}${readingStatus(a)?`<div class="meta">${esc(readingStatus(a))}</div>`:""}<p>${esc(a.translation_zh_hant||a.excerpt_original||(isMedia(a)?'此篇採標題索引，請前往來源網站閱讀全文。':'來源目前沒有提供可展示的內文。'))}</p><div class="actions">${isMedia(a)&&a.content_scope==='media_headline'?`<a class="btn primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">來源閱讀 ↗</a><button class="btn" data-read="${esc(a.url)}">${read?'✓ 已閱讀':'標記已讀'}</button>`:`<button class="btn primary" data-open="${esc(a.url)}">${isMedia(a)?'查看摘要 →':'開始閱讀 →'}</button>`}<button class="btn" data-save="${esc(a.url)}">${saved?'★ 已收藏':'☆ 收藏'}</button>${read?'<span class="meta">✓ 已閱讀</span>':''}</div></div></article>`}
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
 }).join(''):'<div class="notice">此官方來源沒有提供可用的內文。系統不會自行編造。</div>';
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
 const related = [];
 const themes = readingThemes.filter(theme => theme.match.test(title));
 // A direct topic match is required. Sharing a broad category is insufficient.
 for (const candidate of homepageArticles(state.news)) {
  if (candidate.url === article.url || candidate.title === title) continue;
  const theme = themes.find(entry => entry.match.test(candidate.title || ''));
  if (!theme) continue;
  const onSite = candidate.content_scope !== 'media_headline';
  related.push({
   ...candidate, onSite, theme,
   reason:theme.event ? `補充「${theme.name}」的另一則報導。`
    : candidate.kind === 'knowledge' ? `深入了解「${theme.name}」的相關概念。`
    : `查看「${theme.name}」在實際事件中的發展。`
  });
 }
 return related.sort((a,b) => Number(b.onSite)-Number(a.onSite)
   || Number(state.read.includes(a.url))-Number(state.read.includes(b.url)));
}

function readerLink(link, label, extraClass='') {
 const url = safeUrl(link?.url);
 if (!url) return '';
 return `<a class="${extraClass}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
}

function relatedReaderContent(related, editorial) {
 const seen = new Set(), titles = new Set();
 const full = related.filter(item => hasApprovedFullText(item) || isTextEdition(item));
 const items = [...full, ...editorial, ...related]
  .filter(item => {
   const key = safeUrl(item.url);
   if (!key || seen.has(key) || titles.has(item.title)) return false;
   seen.add(key); titles.add(item.title); return true;
  }).slice(0,3);
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
 // Automatic context quotes only sourced headlines about an identified event.
 const prior = related.filter(item => item.theme.event && item.kind !== 'knowledge'
   && Date.parse(item.published_at) <= reported
   && Date.parse(item.published_at) >= reported-14*86400000
   && !/Yahoo/.test(item.source))
  .sort((a,b) => Date.parse(a.published_at)-Date.parse(b.published_at))[0];
 if (!prior) return [];
 return [
  {label:Date.parse(prior.published_at) === reported ? '同日報導' : '前情報導',
   date:date(prior.published_at), text:prior.title, link:prior},
  {label:'本篇報導',date:date(article.published_at),text:article.title,link:article}
 ];
}

function contextRows(article, rows) {
 return `<dl class="reader-context-rows">${rows.map(row => `<div>
  <dt>${esc(row.label)}${row.date ? `<span class="reader-context-meta">${esc(/^\d{4}-\d{2}-\d{2}$/.test(row.date) ? date(row.date) : row.date)}</span>` : ''}</dt>
  <dd>${esc(row.text)}${row.date ? `<span class="reader-context-meta">${readerLink(row.link || article,(row.link || article).source)}</span>` : ''}</dd>
 </div>`).join('')}</dl>`;
}

// Reviewed one-sentence definitions. Alternate spellings are matched in the
// actual article, and only the first occurrence of a concept is listed.
const glossaryGroups = [
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
 const parts = knowledgeTextParts(article);
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
