// Sdílená logika Eldorado Trackeru
const T = {
  FMT: n => n==null ? '—' : (typeof n==='number' ? n.toLocaleString('cs-CZ') : n),
  USD: n => n==null ? '—' : '$' + (n<0.01 ? n.toFixed(5) : n<1 ? n.toFixed(3) : n<100 ? n.toFixed(2) : Math.round(n).toLocaleString('cs-CZ')).replace('.', ','),
  TYP: {currency:'Currency',items:'Items',accounts:'Accounts',boosting:'Boosting',topups:'Top-up',giftcards:'Gift karta'},
  data: null,
  async load(){
    if(T.data) return T.data;
    const j = p => fetch(p+'?v='+Math.floor(Date.now()/300000)).then(r=>r.ok?r.json():null).catch(()=>null);
    const [catalog,history,games,methods,items,ranking,listings] = await Promise.all([j('data/catalog.json'),j('data/history.json'),j('data/games.json'),j('data/methods.json'),j('data/items.json'),j('data/ranking.json'),j('data/listings.json')]);
    T.data = {catalog:catalog||[],history:history||{series:{}},games:games||[],methods:methods||[],items:items||[],ranking:ranking||[],listings:(listings&&listings.by_category)||{}};
    T.data.byId = Object.fromEntries(T.data.catalog.map(c=>[c.id,c]));
    return T.data;
  },
  series(id){ return (T.data.history.series[id]||[]).filter(p=>p.price!=null); },
  change7d(id){
    const s=T.series(id); if(s.length<2) return null; const last=s[s.length-1]; const t0=new Date(last.t).getTime()-7*864e5;
    let base=s[0]; for(const p of s){ if(new Date(p.t).getTime()<=t0) base=p; } if(base===last) base=s[s.length-2];
    return base.price ? (last.price-base.price)/base.price : null;
  },
  ageHours(c){ if(!c.observed_at) return null; const s=T.series(c.id); const t=s.length? s[s.length-1].t : c.observed_at+'T12:00:00Z'; return (Date.now()-new Date(t).getTime())/36e5; },
  net(c){ return c.price_low_usd==null?null:c.price_low_usd*(1-(c.fee_pct||0)/100); },
  score(c){
    if(c.price_low_usd==null) return null;
    const chg=T.change7d(c.id); const trend = chg==null ? 0.5 : Math.max(0,Math.min(1, 0.5+chg/0.4));
    const depth = c.listings==null ? 0.5 : Math.max(0,Math.min(1, Math.log10(c.listings+1)/5));
    const domin = c.top_seller_reviews==null ? 0.5 : Math.max(0,Math.min(1, Math.log10(c.top_seller_reviews+1)/6));
    const fee=(c.fee_pct||0)/30;
    return Math.round(100*(0.35*trend+0.25*depth+0.20*(1-domin)+0.20*(1-fee)));
  },
  cls(s){ return s>=60?'s-hi':s>=40?'s-mid':'s-lo'; },
  scoreHtml(sc){ return sc==null?'<span class="nodata">bez ceny</span>':`<span class="score ${T.cls(sc)}"><b>${sc}</b><span class="bar"><i class="${T.cls(sc)}" style="width:${sc}%"></i></span></span>`; },
  chgHtml(chg){ return `<span class="${chg==null?'flat':chg>0?'up':chg<0?'dn':'flat'}">${chg==null?'—':(chg>0?'+':'')+(chg*100).toFixed(1).replace('.',',')+' %'}</span>`; },
  ageHtml(age){ return age==null?'—':age<1?'< 1 h':age<48?Math.round(age)+' h':Math.round(age/24)+' d'; },
  dots(n,cls){ if(n==null) return '—'; return `<span class="dots-wrap"><span class="dots ${cls}">`+[0,1,2,3,4].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')+`</span><span class="sc">${n}</span></span>`; },
  spark(canvas,s,w=90,h=26){
    const dpr=window.devicePixelRatio||1; canvas.width=w*dpr; canvas.height=h*dpr; const x=canvas.getContext('2d'); x.scale(dpr,dpr);
    const v=s.map(p=>p.price); if(v.length<2){ x.fillStyle='#4B4580'; x.fillRect(0,h/2,w,1); return; }
    const mn=Math.min(...v),mx=Math.max(...v); x.strokeStyle=v[v.length-1]>=v[0]?'#7FD9B8':'#FF6B5A'; x.lineWidth=1.5; x.beginPath();
    v.forEach((val,i)=>{const px=i/(v.length-1)*(w-2)+1,py=h-2-((val-mn)/((mx-mn)||1))*(h-4); i?x.lineTo(px,py):x.moveTo(px,py);}); x.stroke();
  },
  bigChart(canvas,s,label){
    const w=canvas.clientWidth||600,h=200,dpr=window.devicePixelRatio||1; canvas.width=w*dpr; canvas.height=h*dpr; const x=canvas.getContext('2d'); x.scale(dpr,dpr); x.clearRect(0,0,w,h);
    x.font='11px IBM Plex Mono, monospace';
    if(s.length<2){ x.fillStyle='#A8A2C6'; x.fillText('Zatím jeden snímek – graf se vykreslí po dalších bězích robota.',12,h/2); return; }
    const v=s.map(p=>p.price),mn=Math.min(...v),mx=Math.max(...v),pad=30;
    x.strokeStyle='#39345E'; for(let i=0;i<4;i++){const y=pad+(h-2*pad)*i/3; x.beginPath(); x.moveTo(pad+20,y); x.lineTo(w-8,y); x.stroke();}
    x.fillStyle='#A8A2C6'; x.fillText(T.USD(mx),4,pad+4); x.fillText(T.USD(mn),4,h-pad+4);
    x.strokeStyle='#E8B84A'; x.lineWidth=2; x.beginPath();
    v.forEach((val,i)=>{const px=pad+20+i/(v.length-1)*(w-pad-28),py=h-pad-((val-mn)/((mx-mn)||1))*(h-2*pad); i?x.lineTo(px,py):x.moveTo(px,py);}); x.stroke();
    x.fillStyle='#6F6996'; x.fillText(s[0].t.slice(0,10),pad+20,h-8); const t2=s[s.length-1].t.slice(0,10); x.fillText(t2,w-8-x.measureText(t2).width,h-8);
    if(label){x.fillStyle='#A8A2C6'; x.fillText(label,pad+20,16);}
  },
  offers(catId){ const o=T.data.listings[catId]; return o&&o.offers?o.offers:[]; },
  gameOffers(game){ const out=[]; for(const id of game.cats){ const c=T.data.byId[id]; if(!c) continue; for(const o of T.offers(id)) out.push({...o, cat:c}); } return out.sort((a,b)=>(b.price??0)-(a.price??0)); },
  gameHref(gid){ return 'game.html?g='+encodeURIComponent(gid); },
  gameOfCat(c){ return T.data.games.find(g=>g.id===c.game_id); },
  status(){
    const h=T.data.history; const upd=h.updated_at?new Date(h.updated_at):null; const ageH=upd?(Date.now()-upd.getTime())/36e5:null;
    const el=document.getElementById('upd'); if(el) el.textContent=upd?'aktualizováno '+upd.toLocaleString('cs-CZ',{dateStyle:'short',timeStyle:'short'})+(ageH<1?' · před chvílí':ageH<48?' · před '+Math.round(ageH)+' h':' · před '+Math.round(ageH/24)+' dny'):'bez dat';
    const dot=document.getElementById('dot'); if(dot) dot.className= ageH==null||ageH>30?'old':ageH>8?'stale':'';
  },
  sortable(table, getVal, rerender){
    let k=null,d='desc';
    table.querySelectorAll('th.sortable').forEach(th=>th.addEventListener('click',()=>{ const kk=th.dataset.k; if(k===kk) d=d==='asc'?'desc':'asc'; else {k=kk; d=th.dataset.d||'desc';} table.querySelectorAll('th.sortable').forEach(t=>t.classList.remove('asc','desc')); th.classList.add(d); rerender(k,d); }));
    return (rows,k2,d2)=>{ if(!k2) return rows; return rows.slice().sort((a,b)=>{ let va=getVal(a,k2),vb=getVal(b,k2); const na=va==null,nb=vb==null; if(na&&nb) return 0; if(na) return 1; if(nb) return -1; if(typeof va==='string') return d2==='asc'?va.localeCompare(vb,'cs'):vb.localeCompare(va,'cs'); return d2==='asc'?va-vb:vb-va; }); };
  }
};
