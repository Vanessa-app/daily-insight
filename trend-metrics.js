/* Daily Insight stage 8: compare complete calendar windows of observed sources. */
((root, factory) => {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DailyTrendMetrics=api;
})(typeof window!=='undefined'?window:null,()=>{
  'use strict';
  const periods=[7,30,90];
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const shift=(day,amount)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);};
  const dates=(last,n)=>Array.from({length:n},(_,i)=>shift(last,i-n+1));
  function indexed(history,now){
    const today=localDay(now), days=new Map();
    for(const row of history?.days||[]){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||row.date>today)continue;
      const prior=days.get(row.date);
      if(!prior||(Date.parse(row.observed_at)||0)>=(Date.parse(prior.observed_at)||0))days.set(row.date,row);
    }
    return days;
  }
  function usable(row){
    return row?.observation_version===1&&row.closed===true&&row.baseline===false
      &&Array.isArray(row.event_stats)&&row.event_stats.every(e=>typeof e.id==='string'
        &&Array.isArray(e.new_article_keys)&&e.new_article_keys.every(x=>typeof x==='string'));
  }
  function summarize(keys,days,ids,topic){
    const groups=new Set(), items=new Set(), points=[];
    let coverage=0;
    for(const day of keys){
      const row=days.get(day), daily=new Set();
      if(!usable(row)){points.push({date:day,count:null});continue;}
      coverage++;
      for(const event of row.event_stats){
        if(ids&&!ids.has(event.id)&&!(event.aliases||[]).some(id=>ids.has(id)))continue;
        if(topic&&event.primary_topic!==topic)continue;
        for(const key of event.new_article_keys){daily.add(key);items.add(key);}
        if(event.new_article_keys.length)for(const group of event.source_groups||[])groups.add(group);
      }
      points.push({date:day,count:daily.size});
    }
    return {coverage,expected:keys.length,count:items.size,groups:groups.size,points,from:keys[0],to:keys.at(-1)};
  }
  function compare(history,period=7,{now=new Date(),event=null,topic=null}={}){
    const n=Number(period);
    if(!periods.includes(n))throw Error('只支援 7、30、90 天比較');
    const days=indexed(history,now),end=shift(localDay(now),-1);
    const ids=event?new Set([event.id,...(event.aliases||[])]):null;
    const current=summarize(dates(end,n),days,ids,topic);
    const previous=summarize(dates(shift(end,-n),n),days,ids,topic);
    const complete=current.coverage===n&&previous.coverage===n;
    const delta=complete?current.count-previous.count:null;
    const percent=complete&&previous.count>0?Math.round(delta/previous.count*1000)/10:null;
    const warming=complete&&previous.count>0&&delta>=2&&percent>=20;
    const label=!complete?'資料累積中':!previous.count?(current.count?'前期零收錄':'兩期皆無新增')
      :warming?'收錄升溫':delta>0?'收錄增加':delta<0?'收錄減少':'收錄持平';
    return {period:n,current,previous,complete,delta,percent,warming,label,today:days.get(localDay(now))||null};
  }
  function signal(result){
    if(!result.complete)return `當期 ${result.current.coverage}/${result.period} 日 · 前期 ${result.previous.coverage}/${result.period} 日`;
    if(result.percent===null)return `前期 ${result.previous.count} 筆，當期 ${result.current.count} 筆`;
    return `${result.percent>0?'+':''}${result.percent}% · ${result.previous.count} 至 ${result.current.count} 筆`;
  }
  function table(history,period,topics,now){
    return `<div class="heat-table-wrap"><table class="heat-table"><thead><tr><th scope="col">主題</th><th scope="col">當期新增</th><th scope="col">前期新增</th><th scope="col">判讀</th></tr></thead><tbody>${topics.map(topic=>{
      const r=compare(history,period,{now,topic:topic.id});
      return `<tr><th scope="row">${escape(topic.label)}</th><td>${r.current.coverage===r.period?r.current.count:'—'}</td><td>${r.previous.coverage===r.period?r.previous.count:'—'}</td><td><strong class="heat-state ${r.warming?'warming':''}">${escape(r.label)}</strong><small>${escape(signal(r))}</small></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function chart(result){
    const max=Math.max(1,...result.current.points.map(p=>p.count||0));
    return `<figure class="heat-chart"><figcaption>當期每日新增收錄報導</figcaption><div class="heat-bars" role="img" aria-label="${escape(result.current.points.map(p=>p.date+' '+(p.count===null?'缺少完整日誌':p.count+'筆')).join('；'))}">${result.current.points.map(p=>`<div class="heat-bar-slot ${p.count===null?'missing':''}" title="${escape(p.date+' · '+(p.count===null?'日誌不足':p.count+' 筆'))}"><i style="height:${p.count===null?100:Math.max(2,Math.round(p.count/max*100))}%"></i></div>`).join('')}</div><div class="heat-axis"><span>${result.current.from}</span><span>${result.current.to}</span></div>
      <details><summary>查看逐日數據</summary><ul class="heat-daily">${result.current.points.map(p=>`<li><time>${p.date}</time><span>${p.count===null?'日誌不足':p.count+' 筆'}</span></li>`).join('')}</ul></details></figure>`;
  }
  function panel(history,period=7,{topics=[],events=[],watched=[],focus=null,now=new Date()}={}){
    const result=compare(history,period,{now,event:focus});
    const ranked=events.map(event=>({event,result:compare(history,period,{now,event})}))
      .sort((a,b)=>Number(b.result.warming)-Number(a.result.warming)||(b.result.delta||0)-(a.result.delta||0));
    const related=watched.length?ranked.filter(x=>[x.event.id,...(x.event.aliases||[])].some(id=>watched.includes(id))):[];
    return `<section class="heat-panel" aria-label="趨勢升溫分析"><div class="trend-section-title"><h3>${focus?'事件收錄變化':'趨勢升溫'}</h3><span>新增收錄報導 · 以台灣日曆日統計</span></div>
      <div class="heat-periods" role="group" aria-label="趨勢比較期間">${periods.map(n=>`<button type="button" class="btn ${Number(period)===n?'primary':''}" data-heat-period="${n}" aria-pressed="${Number(period)===n}">${n} 天</button>`).join('')}</div>
      <p class="trend-muted">${result.current.from} 至 ${result.current.to}，比較前 ${result.period} 天；今天仍在累積的資料獨立顯示。</p>
      <div class="heat-summary"><div><span>當期完整日誌</span><strong>${result.current.coverage} / ${result.period} 日</strong></div><div><span>前期完整日誌</span><strong>${result.previous.coverage} / ${result.period} 日</strong></div><div><span>${escape(result.label)}</span><strong>${escape(result.complete?signal(result):'尚不足以比較')}</strong></div></div>
      <p class="heat-method">升溫門檻為當期新增收錄數比前期增加至少 2 筆且增幅達 20%。前期為零時顯示兩期筆數。首次快照、未完成當日檢查與缺失日誌均不納入增減率。</p>
      ${chart(result)}${topics.length?`<h4>六大主題比較</h4>${table(history,period,topics,now)}`:''}
      <h4>事件觀察</h4><div class="heat-events">${ranked.slice(0,6).map(({event,result:r})=>`<article><div><span class="heat-state ${r.warming?'warming':''}">${escape(r.label)}</span><h5>${escape(event.title)}</h5><p>${escape(signal(r))}</p></div><button type="button" class="btn" data-trend-progress="${escape(event.id)}">查看事件進展</button></article>`).join('')||'<p>目前沒有可供對照的事件。</p>'}</div>
      ${watched.length?`<h4>我的關注</h4>${related.length?`<ul class="heat-watch">${related.map(({event,result:r})=>`<li><button type="button" class="trend-text-btn" data-trend-progress="${escape(event.id)}">${escape(event.title)}</button><span>${escape(r.label+' · '+signal(r))}</span></li>`).join('')}</ul>`:'<p>目前關注的事件未出現在最新索引中。</p>'}`:''}
      <p class="trend-footnote">今日檢查 ${result.today?.observed_at?escape(new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'medium',timeStyle:'short'}).format(new Date(result.today.observed_at))):'尚無日誌'}。報導收錄量反映本站資料來源與檢查範圍，事件分類、來源增減都可能影響數字。</p></section>`;
  }
  function compact(history,events,now=new Date()){
    const result=compare(history,7,{now});
    const count=events.filter(event=>compare(history,7,{now,event}).warming).length;
    return `<section class="heat-compact"><div><h3>近 7 天收錄變化</h3><p>${result.complete?count+' 個事件達升溫門檻':escape(signal(result))}</p></div><button type="button" class="btn" data-heat-open>查看趨勢升溫</button></section>`;
  }
  return {compare,signal,panel,compact,localDay,shift};
});
