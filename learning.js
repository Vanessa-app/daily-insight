/* Daily Insight stage 7: extractive reading support, sourced terms and quiz review. */
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DailyLearning = api;
})(typeof window !== 'undefined' ? window : null, () => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => {try {const url = new URL(value); return url.protocol === 'https:' ? url.href : null;} catch {return null;}};
  const day = value => !value || Number.isNaN(new Date(value).getTime()) ? '日期不明' : new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  function textParts(article) {
    const original = article.evidence_original || [];
    if (article.translation_status === 'original_zh_hant') return original;
    const translated = article.evidence_zh_hant;
    if (['translated','translated_unreviewed','translated_editorial'].includes(article.translation_status)
        && Array.isArray(translated) && translated.length === original.length && translated.every(x=>typeof x==='string'&&x.trim())) return translated;
    return [];
  }
  function excerpt(article) {
    const parts = textParts(article);
    const paragraph = parts.findIndex(p=>typeof p==='string' && p.length >= 55 && !/^\s*=|https?:\/\//.test(p));
    if (paragraph < 0) return null;
    const text = parts[paragraph].trim();
    const sentences = text.match(/[^。！？]+[。！？]/g) || [];
    let quote = '';
    for (const sentence of sentences) {
      if ((quote + sentence).length > 260) break;
      quote += sentence;
    }
    return {text:quote || text.slice(0,240)+'…', paragraph:paragraph+1, truncated:!quote};
  }
  function approved(article) {
    return safeUrl(article.url) && !article.demo && article.verification === 'publisher_domain_checked'
      && article.reuse_license === 'approved' && (article.content_complete === true || (article.content_scope === 'licensed_text_edition' && article.standalone_text_checked === true)) && excerpt(article);
  }
  function digest(articles, now = new Date()) {
    const current = new Date(now).getTime();
    const eligible = articles.filter(approved);
    const news = eligible.filter(a=>a.kind==='news' && Date.parse(a.published_at)<=current
      && Date.parse(a.published_at)>=current-7*86400000)
      .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at));
    const unique = rows => [...new Map(rows.map(a=>[a.url,a])).values()];
    const byCategory = new Map();
    for (const article of news) {
      if (!byCategory.has(article.category)) byCategory.set(article.category,article);
    }
    const chosenNews = unique([...byCategory.values(),...news]).slice(0,3);
    const knowledge = unique(eligible.filter(a=>a.kind==='knowledge')).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const categories = [...new Set(knowledge.map(a=>a.category))].sort();
    const seed = Number(day(now).replaceAll('-',''));
    const chosenKnowledge = categories;
    const topics = chosenKnowledge.length ? [...chosenKnowledge.slice(seed%categories.length),...chosenKnowledge.slice(0,seed%categories.length)].slice(0,2) : [];
    const picks = [...chosenNews,...topics.map(category=>{
      const rows=knowledge.filter(a=>a.category===category);return rows[seed%rows.length];
    })];
    const entries = picks.map(article=>({article,...excerpt(article)}));
    const characters = entries.reduce((n,item)=>n+item.article.title.length+item.text.length,0);
    return {date:day(now),entries,minutes:Math.max(1,Math.ceil(characters/300)),newsCount:chosenNews.length};
  }
  const questions = {
    technology_ai:'這項技術已實際部署，還是仍在展示或測試？評估成效需要哪些指標？',
    semiconductors:'公布的是研發、試產還是量產進度？產能及客戶採用有沒有原始資料支持？',
    global_finance:'數據的期間、單位與比較基準是否一致？這是已公布數據，還是預測？',
    business_management:'方案會改變哪些作業或成本？成效是否有實施前後的資料可以對照？',
    politics_policy:'目前進度是提案、通過還是正式實施？適用對象及生效日期是否明確？',
    consumer_lifestyle:'這項變化會影響哪些人？適用條件、限制及可查詢的服務資訊在哪裡？'
  };
  function importance(event) {
    const articles = (event.articles || []).filter(a=>safeUrl(a.url))
      .sort((a,b)=>(Date.parse(a.published_at)||0)-(Date.parse(b.published_at)||0));
    return {articles,question:questions[event.primary_topic] || '來源提供了哪些可核對的資料？哪些影響仍需要更多證據？'};
  }
  function reviews(articles, results, getQuiz) {
    const items = [], unavailable = [];
    for (const [id,result] of Object.entries(results || {})) {
      const article = articles.find(a=>a.kind==='knowledge' && (a.id||a.url)===id);
      const quiz = article && getQuiz(article);
      if (!quiz || !Array.isArray(result?.answers) || result.total !== quiz.length || result.answers.length !== quiz.length) {unavailable.push({id,title:article?.title || '已保存的測驗'});continue;}
      quiz.forEach((question,index)=>{
        const answer=result.answers[index];
        if (!Number.isInteger(answer)||typeof question.options[answer]!=='string'||answer===question.answer) return;
        const paragraph = Number.isInteger(question.paragraph) && question.paragraph>=1
          && question.paragraph <= (article.evidence_original || []).length ? question.paragraph : null;
        items.push({article,question,index,chosen:answer,paragraph,completedAt:result.completedAt || null});
      });
    }
    return {items:items.sort((a,b)=>(Date.parse(b.completedAt)||0)-(Date.parse(a.completedAt)||0)),unavailable};
  }
  function sourceLink(article) {
    const url=safeUrl(article.url);
    return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(article.source || '原始來源')}</a>` : '';
  }
  function digestHtml(articles,now) {
    const data=digest(articles,now);
    return `<section class="learning-section"><div class="trend-section-title"><h3>每日五分鐘閱讀</h3><span>${escape(data.date)} · 本次節錄約 ${data.minutes} 分鐘</span></div>
      <p class="trend-muted">選讀最近七日新聞與輪替主題知識，先讀來源節錄，再查看完整文章。</p>
      ${!data.newsCount?'<p class="notice">目前沒有最近七日內可全文閱讀並提供中文的新聞；以下提供知識選讀。</p>':''}
      ${data.entries.length?`<div class="learning-digest">${data.entries.map(item=>`<article class="trend-detail-panel"><span class="trend-topic-label">${escape(item.article.kind==='knowledge'?'知識 · '+item.article.category:'新聞 · '+day(item.article.published_at))}</span><h4>${escape(item.article.title)}</h4>
        <p class="learning-label">來源節錄${item.article.translation_status==='original_zh_hant'?'':' · 中文譯文'}</p><blockquote>${escape(item.text)}</blockquote>
        <div class="learning-source">${sourceLink(item.article)}</div><button type="button" class="btn" data-open="${escape(item.article.url)}" data-review-paragraph="${item.paragraph}">閱讀完整文章及對應段落</button></article>`).join('')}</div>`:'<div class="empty">目前沒有符合全文與中文條件的文章。</div>'}</section>`;
  }
  function importanceHtml(event) {
    const data=importance(event);
    return `<section class="trend-detail-panel learning-importance"><h4>為什麼值得關注</h4>
      <h5>來源提供的資訊</h5>${data.articles.length?`<p>${data.articles.length} 篇來源資料，最早收錄日期 ${escape(day(data.articles[0].published_at))}。</p>
      <ul class="trend-small-list">${[data.articles[0],data.articles.length>1?data.articles.at(-1):null].filter(Boolean).map(a=>`<li>${escape(a.title)} <span class="learning-source">${sourceLink(a)}</span></li>`).join('')}</ul>`:'<p>目前缺少可追溯的來源資料。</p>'}
      <h5>閱讀時可留意</h5><p>${escape(data.question)}</p>
      <p class="trend-caution">以上問題是閱讀提示。具體影響與因果關係仍需查看來源內文及後續資料。</p></section>`;
  }
  function glossaryHtml(articles,getTerms) {
    const entries = new Map();
    for (const article of articles.filter(a=>a.kind==='knowledge')) {
      for (const term of getTerms(article)) {
        if (!entries.has(term.term)) entries.set(term.term,{...term,article});
      }
    }
    return `<section class="learning-section"><div class="trend-section-title"><h3>術語與背景</h3><span>${entries.size} 個詞</span></div>
      <label class="glossary-filter">搜尋術語<input type="search" data-learning-search placeholder="例如：機會成本、基因、前提"></label>
      <p class="trend-muted">依知識館藏正文出現的術語提供一句話解釋，可開啟相關文章查看上下文。</p>
      <dl class="reader-context-rows learning-glossary">${[...entries.values()].sort((a,b)=>a.term.localeCompare(b.term,'zh-Hant')).map(term=>`<div data-learning-term><dt>${escape(term.term)}</dt><dd><p>${escape(term.definition)}</p>
      <button type="button" class="trend-text-btn" data-open="${escape(term.article.url)}">文章背景 · ${escape(term.article.title)}</button>${term.source?`<span class="learning-source">${sourceLink(term.source)}</span>`:''}</dd></div>`).join('')}</dl>
      <p class="learning-search-empty" hidden>找不到符合的術語，請調整關鍵字。</p></section>`;
  }
  function reviewHtml(articles,results,getQuiz) {
    const data=reviews(articles,results,getQuiz);
    return `<section class="learning-section"><div class="trend-section-title"><h3>我的知識複習</h3><span>${data.items.length} 題可複習</span></div>
      <p class="trend-muted">從已完成測驗中找出答錯的題目，核對解說後回看原文，再由文章內重新挑戰。</p>
      ${data.items.length?data.items.map(item=>`<article class="trend-detail-panel learning-review"><span class="trend-topic-label">${escape(item.article.title)}</span><h4>${escape(item.question.question)}</h4>
      <p>你的答案 · ${escape(item.question.options[item.chosen])}</p><details><summary>查看正確答案與解說</summary><p><strong>${escape(item.question.options[item.question.answer])}</strong></p><p>${escape(item.question.explanation)}</p></details>
      <div class="learning-actions"><button type="button" class="btn" data-open="${escape(item.article.url)}" ${item.paragraph?`data-review-paragraph="${item.paragraph}"`:''}>${item.paragraph?'回看原文第 '+item.paragraph+' 段':'回看完整文章'}</button><button type="button" class="btn" data-open="${escape(item.article.url)}" data-review-quiz>前往文章測驗</button></div></article>`).join(''):'<div class="empty">目前沒有可辨識的錯題。完成知識文章測驗後，可在這裡複習。</div>'}
      ${data.unavailable.length?`<p class="notice">${data.unavailable.length} 份既有測驗缺少逐題答案，或對應文章目前無法使用，暫時無法建立錯題清單。</p>`:''}</section>`;
  }
  return {textParts,excerpt,digest,importance,reviews,digestHtml,importanceHtml,glossaryHtml,reviewHtml};
});
