/* ============================================================================
   Eldorado Terminal — sdílená logika
   Klíčová část: LIVE přepočet výdělku metod z aktuálních cen na Eldoradu.
   Metoda drží jen herní výnos (např. 17,2 M gp/h). Dolary se počítají až tady,
   z ceny stažené robotem — takže když cena spadne, pořadí se změní samo.
   ========================================================================== */
const T = {
  FMT: n => n == null ? '—' : (typeof n === 'number' ? n.toLocaleString('cs-CZ') : n),
  USD(n){ if(n==null) return '—';
    const a=Math.abs(n);
    const s = a<0.001 ? n.toFixed(6) : a<0.01 ? n.toFixed(5) : a<1 ? n.toFixed(3) : a<100 ? n.toFixed(2) : Math.round(n).toLocaleString('cs-CZ');
    return '$'+String(s).replace('.',','); },
  TYP: {currency:'Měna',items:'Předměty',accounts:'Účty',boosting:'Boosting',topups:'Top-up',giftcards:'Gift karta'},
  data:null,

  async load(){
    if(T.data) return T.data;
    const v=Math.floor(Date.now()/120000);                       // cache-buster po 2 min
    const j=p=>fetch(p+'?v='+v).then(r=>r.ok?r.json():null).catch(()=>null);
    const [catalog,history,games,methods,items,ranking,listings,units,earn,risk,audit]=await Promise.all(
      ['catalog','history','games','methods','items','ranking','listings','units','earnings','risk','audit'].map(n=>j('data/'+n+'.json')));
    T.data={catalog:catalog||[],history:history||{series:{}},games:games||[],methods:methods||[],
            items:items||[],ranking:ranking||[],listings:(listings&&listings.by_category)||{},units:units||{},earnHist:(earn&&earn.series)||{},risk:risk||{},audit:audit||null};
    T.data.byId=Object.fromEntries(T.data.catalog.map(c=>[c.id,c]));
    T.data.gameById=Object.fromEntries(T.data.games.map(g=>[g.id,g]));
    T.index();
    return T.data;
  },

  /* ---- ceny ------------------------------------------------------------ */
  series(id){ return (T.data.history.series[id]||[]).filter(p=>p.price!=null); },
  change7d(id){
    const s=T.series(id); if(s.length<2) return null;
    const last=s[s.length-1], t0=new Date(last.t).getTime()-7*864e5;
    let base=s[0]; for(const p of s) if(new Date(p.t).getTime()<=t0) base=p;
    if(base===last) base=s[s.length-2];
    return base.price ? (last.price-base.price)/base.price : null;
  },
  changeAll(id){                                    // změna od prvního snímku (pro hlídání mety)
    const s=T.series(id); if(s.length<2||!s[0].price) return null;
    return (s[s.length-1].price-s[0].price)/s[0].price;
  },
  ageHours(c){ if(!c.observed_at) return null;
    const s=T.series(c.id); const t=s.length?s[s.length-1].t:c.observed_at+'T12:00:00Z';
    return (Date.now()-new Date(t).getTime())/36e5; },
  net(c){ return c.price_low_usd==null?null:c.price_low_usd*(1-(c.fee_pct||0)/100); },
  score(c){
    if(c.price_low_usd==null) return null;
    const chg=T.change7d(c.id);
    const trend=chg==null?0.5:Math.max(0,Math.min(1,0.5+chg/0.4));
    const depth=c.listings==null?0.5:Math.max(0,Math.min(1,Math.log10(c.listings+1)/5));
    const domin=c.top_seller_reviews==null?0.5:Math.max(0,Math.min(1,Math.log10(c.top_seller_reviews+1)/6));
    const fee=(c.fee_pct||0)/30;
    return Math.round(100*(0.35*trend+0.25*depth+0.20*(1-domin)+0.20*(1-fee)));
  },

  /* ---- převod jednotek na základní kus ---------------------------------
     data/units.json říká, kolik ZÁKLADNÍCH jednotek stojí cena kategorie:
     { "currency-osrs-gold": {base:"gold", per:1000000} }  → cena je za 1M zlata.
     Kusové zboží (účty, kity) tam není — z něj se $/h počítat nedá.          */
  MAG:{k:1e3,tis:1e3,m:1e6,mil:1e6,b:1e9,mld:1e9,bil:1e9,t:1e12},
  SYN:{gp:'gold',gold:'gold',zlat:'gold',mesos:'meso',meso:'meso',noah:'noah',gb:'noah',
       coin:'coin',coins:'coin',mince:'coin',isk:'isk',plat:'platinum',platinum:'platinum',
       kredit:'credit',credits:'credit',credit:'credit',silver:'silver',stříbr:'silver',
       kamas:'kamas',yang:'yang',flux:'flux',money:'money',gil:'gil',pansun:'pansun',
       rubl:'rouble',roubles:'rouble',rouble:'rouble',caps:'cap',cap:'cap',auec:'auec',
       alloy:'alloy',lucent:'lucent',rune:'rune',runes:'rune',run:'rune',gem:'gem',gems:'gem',
       token:'token',tokens:'token',robux:'robux',divine:'divine',exalted:'divine',lock:'lock',
       flexi:'lock',bgl:'lock'},
  norm(w){ if(!w) return ''; w=w.toLowerCase().replace(/[^a-záčďéěíňóřšťúůýž]/g,'');
    if(T.SYN[w]) return T.SYN[w];
    for(const k in T.SYN) if(w.startsWith(k)) return T.SYN[k];
    return w.replace(/(ů|y|u|e|a)$/,''); },

  index(){                       // hra → sellable měny s cenou za 1 základní kus
    T.data.priceCats={};
    for(const c of T.data.catalog){
      const u=T.data.units[c.id];
      if(!u||c.price_low_usd==null) continue;
      (T.data.priceCats[c.game_id]=T.data.priceCats[c.game_id]||[]).push(
        {cat:c, base:T.norm(u.base), unitPrice:c.price_low_usd/u.per, per:u.per});
    }
  },

  /* ---- LIVE výdělek metody ---------------------------------------------- */
  parseRate(m){
    if(m.rate_value==null||!m.rate_unit) return null;
    const u=String(m.rate_unit).toLowerCase();
    if(/nenalezeno|variabiln|claim|odhad|rng|dle |bonus|recenz|nabíd|%|týden\/postav/.test(u)) return null;
    let per=null;
    if(/\/\s*(h|hod|hour|hr)\b/.test(u)) per='h';
    else if(/\/\s*(min)\b/.test(u)) per='min';
    else if(/\/\s*(den|day)\b/.test(u)) per='den';
    else if(/\/\s*(týden|tyden|week)\b/.test(u)) per='týden';
    else if(/\/\s*(raid|běh|beh|run|clear|kill|kus|ks|kill|totem|hlav|spawner|barrel|item)/.test(u)) per='kus';
    if(!per) return null;
    const head=u.split('/')[0];
    let mag=1; const mm=head.match(/(?:^|\s)(mld|bil|mil|tis|[kmbt])\s/); if(mm) mag=T.MAG[mm[1]]||1;
    const words=head.replace(/[0-9]|\b(mld|bil|mil|tis|[kmbt])\b/g,' ').split(/\s+/).filter(w=>w.length>1);
    return {units:m.rate_value*mag, per, base:T.norm(words[0]||'')};
  },
  // Kolik hodin hraní je jeden „den"/„týden": pasivní farmy běží samy (24/168),
  // aktivní jen když u toho sedíš (8/40). Vysvětleno v UI.
  hoursIn(per,afk){ if(per==='h') return 1; if(per==='min') return 1/60;
    const passive=(afk??0)>=4;
    return per==='den' ? (passive?24:8) : (passive?168:40); },
  liveEarn(m){
    const r=T.parseRate(m); if(!r||!r.base) return null;
    const opts=T.data.priceCats[m.game_id]; if(!opts||!opts.length) return null;
    const pick=opts.find(o=>o.base===r.base);          // měna musí sedět, jinak se nedá zpeněžit
    if(!pick) return null;
    const fee=1-(pick.cat.fee_pct||0)/100;
    if(r.per==='kus'){                      // hodnota jednoho výstupu, ne za hodinu
      const per=r.units*pick.unitPrice*fee;
      if(!isFinite(per)||per<=0) return null;
      return {usd:null, perOutput:per, cat:pick.cat, unitPrice:pick.unitPrice, base:r.base, per:'kus'};
    }
    const hours=T.hoursIn(r.per,m.afk_score);
    const unitsPerHour=r.units/hours;
    const usd=unitsPerHour*pick.unitPrice*fee;
    if(!isFinite(usd)||usd<=0) return null;
    return {usd, cat:pick.cat, unitPrice:pick.unitPrice, unitsPerHour, per:r.per, hours, base:r.base};
  },
  earnings(){
    if(T._earn) return T._earn;
    const out=[];
    for(const m of T.data.methods){ const e=T.liveEarn(m); if(!e||e.usd==null) continue;
      out.push({m,...e,game:T.data.gameById[m.game_id]}); }
    out.sort((a,b)=>b.usd-a.usd);
    return (T._earn=out);
  },
  earnSeries(m){ return T.data.earnHist[m.game_id+'|'+m.method]||[]; },
  earnTrend(m){ const s=T.earnSeries(m); if(s.length<2||!s[0].usd) return null;
    return (s[s.length-1].usd-s[0].usd)/s[0].usd; },

  // Proč metoda nemá $/h. Uživatel má vidět důvod, ne prázdnou buňku.
  noEarnReason(m){
    const e=T.liveEarn(m);
    if(e&&e.usd!=null) return null;
    if(e&&e.perOutput!=null) return {kind:'per', text:T.USD(e.perOutput)+' / kus'};
    if(m.rate_value==null||!m.rate_unit) return {kind:'norate', text:'bez číselného výnosu'};
    const r=T.parseRate(m);
    if(!r) return {kind:'noperiod', text:'výnos není za čas'};
    if(!T.data.priceCats[m.game_id]) return {kind:'noprice', text:'hra nemá cenu měny'};
    if(!T.data.priceCats[m.game_id].some(o=>o.base===r.base)) return {kind:'notsell', text:r.base+' se neprodává'};
    return {kind:'other', text:'nelze spočítat'};
  },

  /* ---- hlídání mety: kdy metodu ověřit --------------------------------- */
  flag(m){
    const e=T.liveEarn(m);
    const drift=e?T.changeAll(e.cat.id):null;
    if(drift!=null&&Math.abs(drift)>=0.25)
      return {kind:'price', cls:drift<0?'r':'g', text:(drift>0?'cena +':'cena ')+Math.round(drift*100)+' % od zápisu'};
    const d=m.source_date&&/^\d{4}/.test(m.source_date)?new Date(m.source_date.length>4?m.source_date:m.source_date+'-01-01'):null;
    if(d&&(Date.now()-d.getTime())/864e5>270) return {kind:'age', cls:'a', text:'zdroj '+m.source_date};
    return null;
  },
  /* ---- riziko -----------------------------------------------------------
     Dřív se riziko hádalo z textu poznámky, jenže ta u skoro každé hry říká
     totéž ("RMT zakázáno"), takže sloupec ukazoval pořád "vysoké".
     Teď rozlišujeme dvě různé věci:
       hraní  — je ta činnost ve hře v pořádku? (u legitimních mechanik ano)
       prodej — jak tvrdě vydavatel reálně vymáhá zákaz prodeje za peníze
                (data/risk.json, úrovně 1–5 podle doložených ban vln)            */
  RISK_LV:{1:{t:'legální cesta',cls:'g'},2:{t:'slabé vymáhání',cls:'g'},3:{t:'běžné bany',cls:'a'},
           4:{t:'aktivní ban vlny',cls:'r'},5:{t:'permaban / konfiskace',cls:'r'}},
  sellRisk(gameId){
    const r=T.data.risk[gameId];
    if(!r) return {level:null,t:'neurčeno',cls:'',detail:'Pro tuhle hru zatím nemám ověřené informace o vymáhání.'};
    return {level:r.level, t:T.RISK_LV[r.level].t, cls:T.RISK_LV[r.level].cls, label:r.label, detail:r.detail};
  },
  playRisk(m){                        // riziko samotné činnosti ve hře
    const n=(m.ban_risk_note||'').toLowerCase();
    if(/vyloučeno/.test(n)) return {t:'porušuje pravidla',cls:'r'};
    if(/sdílení účtu|account shar|piloted/.test(n)) return {t:'sdílení účtu',cls:'a'};
    if((m.method||'').toLowerCase().includes('boost')) return {t:'sdílení účtu',cls:'a'};
    return {t:'v pořádku',cls:'g'};
  },


  /* ---- prezentace ------------------------------------------------------- */
  cls(s){ return s>=60?'s-hi':s>=40?'s-mid':'s-lo'; },
  scoreHtml(s){ return s==null?'<span class="nodata">—</span>'
    :`<span class="score ${T.cls(s)}"><b>${s}</b><span class="bar"><i class="${T.cls(s)}" style="width:${s}%"></i></span></span>`; },
  chgHtml(c){ return `<span class="${c==null?'flat':c>0?'up':c<0?'dn':'flat'}">${c==null?'—':(c>0?'+':'')+(c*100).toFixed(1).replace('.',',')+' %'}</span>`; },
  ageHtml(a){ return a==null?'—':a<1?'< 1 h':a<48?Math.round(a)+' h':Math.round(a/24)+' d'; },
  dots(n,cls){ if(n==null) return '—';
    return `<span class="dwrap"><span class="dots ${cls}">`+[0,1,2,3,4].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')+`</span><span class="n">${n}</span></span>`; },
  verified(x){ return x && x.verified_at ? x.verified_at : null; },
  offers(id){ const o=T.data.listings[id]; return o&&o.offers?o.offers:[]; },
  gameOffers(g){ const out=[]; for(const id of g.cats){ const c=T.data.byId[id]; if(!c) continue;
    for(const o of T.offers(id)) out.push({...o,cat:c}); } return out.sort((a,b)=>(b.price??0)-(a.price??0)); },
  gameHref(id){ return 'game.html?g='+encodeURIComponent(id); },

  spark(cv,s,w=78,h=22){
    const dpr=devicePixelRatio||1; cv.width=w*dpr; cv.height=h*dpr; const x=cv.getContext('2d'); x.scale(dpr,dpr);
    const v=s.map(p=>p.price);
    if(v.length<2){ x.fillStyle='#233428'; x.fillRect(0,h/2,w,1); return; }
    const mn=Math.min(...v),mx=Math.max(...v);
    x.strokeStyle=v[v.length-1]>=v[0]?'#3DDC84':'#E06C5A'; x.lineWidth=1.4; x.beginPath();
    v.forEach((val,i)=>{const px=i/(v.length-1)*(w-2)+1,py=h-2-((val-mn)/((mx-mn)||1))*(h-4); i?x.lineTo(px,py):x.moveTo(px,py);});
    x.stroke();
  },
  chart(cv,s,label){
    const w=cv.clientWidth||620,h=190,dpr=devicePixelRatio||1;
    cv.width=w*dpr; cv.height=h*dpr; const x=cv.getContext('2d'); x.scale(dpr,dpr); x.clearRect(0,0,w,h);
    x.font='10.5px JetBrains Mono, monospace';
    if(s.length<2){ x.fillStyle='#7E9A88'; x.fillText('Zatím jeden snímek. Graf se vykreslí po dalších bězích robota.',14,h/2); return; }
    const v=s.map(p=>p.price),mn=Math.min(...v),mx=Math.max(...v),padL=58,padY=26;
    x.strokeStyle='#1B2A20'; for(let i=0;i<4;i++){const y=padY+(h-2*padY)*i/3; x.beginPath(); x.moveTo(padL,y); x.lineTo(w-10,y); x.stroke();}
    x.fillStyle='#7E9A88'; x.fillText(T.USD(mx),8,padY+4); x.fillText(T.USD(mn),8,h-padY+4);
    const grad=x.createLinearGradient(0,padY,0,h-padY);
    grad.addColorStop(0,'rgba(61,220,132,.30)'); grad.addColorStop(1,'rgba(61,220,132,0)');
    const pt=i=>[padL+i/(v.length-1)*(w-padL-10), h-padY-((v[i]-mn)/((mx-mn)||1))*(h-2*padY)];
    x.beginPath(); x.moveTo(...pt(0)); v.forEach((_,i)=>x.lineTo(...pt(i)));
    x.lineTo(w-10,h-padY); x.lineTo(padL,h-padY); x.closePath(); x.fillStyle=grad; x.fill();
    x.beginPath(); v.forEach((_,i)=>{const p=pt(i); i?x.lineTo(...p):x.moveTo(...p);});
    x.strokeStyle='#3DDC84'; x.lineWidth=1.8; x.stroke();
    x.fillStyle='#526B5C'; x.fillText(s[0].t.slice(0,10),padL,h-8);
    const t2=s[s.length-1].t.slice(0,10); x.fillText(t2,w-10-x.measureText(t2).width,h-8);
    if(label){ x.fillStyle='#7E9A88'; x.fillText(label,padL,16); }
  },
  stamp(){
    const h=T.data.history, upd=h.updated_at?new Date(h.updated_at):null;
    const age=upd?(Date.now()-upd.getTime())/36e5:null;
    const el=document.getElementById('upd');
    if(el) el.textContent=upd?upd.toLocaleString('cs-CZ',{dateStyle:'short',timeStyle:'short'})+(age<2.5?' · živé':age<24?' · před '+Math.round(age)+' h':' · před '+Math.round(age/24)+' dny'):'bez dat';
    const d=document.getElementById('dot'); if(d) d.className=age==null||age>26?'old':age>6?'warn':'';
  },
  sorter(tableSel,getVal,render){
    let k=null,dir='desc';
    document.querySelectorAll(tableSel+' th.s').forEach(th=>th.addEventListener('click',()=>{
      const kk=th.dataset.k; if(k===kk) dir=dir==='asc'?'desc':'asc'; else {k=kk; dir=th.dataset.d||'desc';}
      document.querySelectorAll(tableSel+' th.s').forEach(t=>t.classList.remove('asc','desc'));
      th.classList.add(dir); render();
    }));
    return rows=>{ if(!k) return rows;
      return rows.slice().sort((a,b)=>{ let va=getVal(a,k),vb=getVal(b,k);
        if(va==null&&vb==null) return 0; if(va==null) return 1; if(vb==null) return -1;
        if(typeof va==='string') return dir==='asc'?va.localeCompare(vb,'cs'):vb.localeCompare(va,'cs');
        return dir==='asc'?va-vb:vb-va; }); };
  }
};
