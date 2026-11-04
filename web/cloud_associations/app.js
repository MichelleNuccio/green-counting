/* Read-only reference data. One particle per document–pair, not per occurrence. */
(() => {
  'use strict';
  const D = window.VK_DATA, $ = s => document.querySelector(s);
  const categories = ['Design Studio','Architectural Practice','Technology & Media','History & Theory'];
  const categoryName = category => category === 'Technology & Media' ? 'Technology & Representation' : category;
  const colors = ['#ff9b53','#f16ed5','#72c9f4','#9855f5'];
  const names = {knowledge:'knowing',built_environment:'building',environment_positive:'environmental healing',environment_negative:'environmental harming'};
  const name = v => names[v] || v;
  const verbs = [...D.verb_cats].sort((a,b)=>name(a).localeCompare(name(b)));
  const keywords = D.kw_cats.filter(k=>!['local','universal','theory'].includes(k)).sort();
  const normalize = s => s.trim().split(/[\\/]/).pop().replace(/\.pdf$/i,'').replace(/-(\d+)-nb$/i,'-$1nb').replace(/-(\d)nb$/i,'-0$1nb');
  const canvas = $('#canvas'), ctx = canvas.getContext('2d'), plot = $('#plot');
  let docs = [], particles = [], selected = 'All categories', stage = 0, cells = [], geometry, frame = 0, animationStart = 0, heat = 0, heatFrom = 0, heatTo = 0, hovered = null;
  $('.project-method').addEventListener('toggle',event=>{event.currentTarget.querySelector('summary').textContent=event.currentTarget.open?'Less information':'More information';});
  let selectedPdf='';
  const matchesPdf=d=>stage<3||!selectedPdf||String(d.id)===selectedPdf;
  const activeDocuments=()=>docs.filter(d=>(selected==='All categories'||d.category===selected)&&matchesPdf(d));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const titles = ['Each point is a document.','One source, many connections.','The connections find their place.','The pattern becomes visible.','Four fields, side by side.'];
  const captions = ['One point per syllabus. The four colors identify document categories; positions carry no analytical meaning.','Each document unfolds into one point for every visible verb–keyword pair it contains. Related points share a common origin.','One point = one document containing this pair in at least one sentence. Select a cell to explore its sources.','Points merge into an association surface.'];
  const labels = ['THE COLLECTION','THE UNFOLDING','THE MATRIX','THE ASSOCIATION','THE COMPARISON'];
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function csv(text) {
    const rows=[]; let row=[], field='', quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
    row.push(field);if(row.some(Boolean))rows.push(row);return rows;
  }
  function aggregate(list) {
    const a={n:0,v:{},k:{},c:{}};
    for(const d of list){a.n+=d.s.active_sentences??d.s.n;for(const kind of ['v','k','c'])for(const [k,n]of Object.entries(d.s[kind]))a[kind][k]=(a[kind][k]||0)+n;}
    return a;
  }
  function build() {
    const active=activeDocuments();
    // All categories includes only classified documents, using the same cohort baseline.
    const a=aggregate(active);
    cells=verbs.flatMap((v,r)=>keywords.map((k,c)=>{
      const key=v+'|'+k, count=a.c[key]||0, ratio=count>=3&&a.v[v]&&a.k[k]?count*a.n/(a.v[v]*a.k[k]):null;
      return {v,k,r,c,key,count,ratio,docs:active.filter(d=>(d.s.c[key]||0)>0)};
    }));
    particles=[];
    active.forEach(d=>{const pairs=cells.filter(c=>(d.s.c[c.key]||0)>0);pairs.forEach((cell,i)=>particles.push({doc:d,cell,seed:d.id*101+i*17,x:d.x??0,y:d.y??0}));});
    $('#counts').textContent=active.length+(active.length===1?' document':' documents');
    $('#detail').hidden=true;
    layout();
  }
  function layout() {
    // Restore visibility before measuring when returning from Comparison.
    plot.hidden=stage===4;
    const w=plot.clientWidth||geometry?.w||600,h=plot.clientHeight||geometry?.h||530,dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const left=w<700?98:148,right=12,bottom=28;
    const cw=(w-left-right)/keywords.length,vertical=cw<85,top=vertical?112:62;
    geometry={w,h,left,top,cw,ch:(h-top-bottom)/verbs.length,vertical};
    // Equal-area golden-angle disk: compact spacing with one position per document.
    const active=activeDocuments();
    const radius=Math.min(w*.32,112,Math.max(25,Math.sqrt(active.length)*7.2));
    active.forEach((d,i)=>{
      const angle=i*Math.PI*(3-Math.sqrt(5)),distance=radius*Math.sqrt((i+.5)/active.length);
      d.x=w/2+Math.cos(angle)*distance;
      d.y=(h-35)/2+Math.sin(angle)*distance;
    });
    const grid=$('#grid');grid.replaceChildren();
    keywords.forEach((k,c)=>axis(k,left+c*geometry.cw,geometry.vertical?8:15,geometry.cw,geometry.vertical?96:36,false));
    verbs.forEach((v,r)=>axis(name(v),0,top+r*geometry.ch,left,geometry.ch,true));
    cells.forEach(cell=>{
      const b=document.createElement('button');b.className='cell';b.style.cssText=`left:${left+cell.c*geometry.cw}px;top:${top+cell.r*geometry.ch}px;width:${geometry.cw}px;height:${geometry.ch}px`;
      b.setAttribute('aria-label',`${name(cell.v)} × ${cell.k}: ${cell.docs.length} documents, ${fmt(cell.ratio)}`);
      const s=document.createElement('span');s.className='cell-value';s.textContent=fmt(cell.ratio);b.append(s);
      b.onclick=()=>showCell(cell);b.onpointermove=e=>{if(stage===3)tooltip(e,cellText(cell));};b.onpointerleave=hideTip;
      b.onfocus=()=>{const r=b.getBoundingClientRect();tooltip({clientX:r.left,clientY:r.top},cellText(cell));};b.onblur=hideTip;
      grid.append(b);
    });
    target();
  }
  function axis(text,x,y,w,h,row){const n=document.createElement('div');n.className='axis-label'+(row?' row':geometry.vertical?' vertical':'');n.textContent=text;n.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px`;$('#grid').append(n);}
  function target() {
    updateHeatmapView();
    hideTip();hovered=null;heatFrom=heat;heatTo=stage>=3?1:0;
    for(const p of particles){p.sx=p.x;p.sy=p.y;const g=geometry;
      if(stage===0){p.tx=p.doc.x;p.ty=p.doc.y;}
      else if(stage===1){p.tx=p.doc.x+(hash(p.seed+20)-.5)*18;p.ty=p.doc.y+(hash(p.seed+50)-.5)*18;}
      else{p.tx=g.left+(p.cell.c+.08+hash(p.seed+11)*.84)*g.cw;p.ty=g.top+(p.cell.r+.08+hash(p.seed+31)*.84)*g.ch;}
    }
    $('#grid').classList.toggle('visible',stage>=2);$('#grid').classList.toggle('heat',stage===3);$('#grid').inert=stage<2;
    $('#heat-legend').hidden=stage<3;$('#explanation').hidden=stage>=3;
    $('#stage-label').hidden=true;$('#stage-title').hidden=true;$('#stage-label').textContent=`0${stage+1} / ${labels[stage]}`;$('#stage-title').textContent=stage===4?'Four fields, side by side.':titles[stage];$('#explanation').textContent=stage===4?'':captions[stage];
    document.querySelectorAll('[data-stage]').forEach(b=>{if(+b.dataset.stage===stage)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    $('#next').hidden=true;$('#next').textContent=['Unfold associations ↗','Arrange into a matrix ↗','Merge into heatmap ↗','Compare categories ↗','Return to documents ↺'][stage];
    animationStart=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);
  }
  const fmt = r => r===null?'·':`${r.toFixed(2)}x`;
  function cellText(c){return `${c.category?c.category+'\n':''}${name(c.v)} × ${c.k}\n${c.docs.length} documents · ${c.count} shared sentences\n${fmt(c.ratio)}${c.ratio===null?' · fewer than 3 shared sentences':''}`;}
  function fillColor(r){if(r===null)return '#ffffff';const t=Math.min(Math.abs(Math.log2(r))/1.5,1),base=[250,249,255],end=r<1?[255,255,0]:[255,0,255];return `rgb(${base.map((v,i)=>Math.round(v+(end[i]-v)*t)).join(',')})`;}
  function draw(now) {
    const g=geometry,t=reduced?1:Math.max(0,Math.min((now-animationStart)/1250,1)),ease=1-Math.pow(1-t,3);heat=heatFrom+(heatTo-heatFrom)*ease;
    ctx.clearRect(0,0,g.w,g.h);
    if(stage>=2||heat>0){
      ctx.save();ctx.globalAlpha=stage>=2?Math.min(1,t*2):heat;
      cells.forEach(c=>{const x=g.left+c.c*g.cw,y=g.top+c.r*g.ch;
        ctx.globalAlpha=heat;ctx.fillStyle=fillColor(c.ratio);
        const inset=.75*heat,cellWidth=Math.max(1,g.cw-inset*2),cellHeight=Math.max(1,g.ch-inset*2);
        ctx.beginPath();ctx.roundRect(x+inset,y+inset,cellWidth,cellHeight,Math.max(0,Math.min(4*heat,cellWidth/2,cellHeight/2)));ctx.fill();
        // The point matrix retains its grid; the heatmap becomes separated tiles.
        ctx.globalAlpha=(stage>=2?Math.min(1,t*2):heat)*(1-heat);ctx.strokeStyle='#d9d3e7';ctx.lineWidth=.5;ctx.strokeRect(x,y,g.cw,g.ch);
      });ctx.restore();
    }
    const seen=new Set();
    for(const p of particles){p.x=p.sx+(p.tx-p.sx)*ease;p.y=p.sy+(p.ty-p.sy)*ease;if(stage===0&&seen.has(p.doc.id))continue;seen.add(p.doc.id);
      ctx.globalAlpha=(hovered && hovered !== p.doc ? .12 : .75)*(1-heat);ctx.fillStyle=colors[categories.indexOf(p.doc.category)]||'#aaa6bc';if(stage<2){ctx.shadowBlur=stage===0?12:4;ctx.shadowColor=ctx.fillStyle;}ctx.beginPath();ctx.arc(p.x,p.y,stage===0?3.3:1.35,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    // Syllabi without visible pairs still belong to the initial collection.
    if(stage===0)for(const d of docs){if(seen.has(d.id)||(selected!=='All categories'&&d.category!==selected))continue;ctx.globalAlpha=.75;ctx.fillStyle=colors[categories.indexOf(d.category)]||'#aaa6bc';ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;if(t<1)frame=requestAnimationFrame(draw);
  }
  function redraw(){cancelAnimationFrame(frame);draw(performance.now());}
  function tooltip(e,text){const tip=$('#tooltip');tip.textContent=text;tip.hidden=false;tip.style.left=Math.max(8,Math.min(innerWidth-tip.offsetWidth-12,e.clientX+14))+'px';tip.style.top=Math.max(8,Math.min(innerHeight-tip.offsetHeight-12,e.clientY+14))+'px';}
  function hideTip(){$('#tooltip').hidden=true;}
  function showCell(c){hideTip();$('#detail-title').textContent=name(c.v)+' × '+c.k;$('#detail-summary').textContent=cellText(c);const list=$('#detail-list');list.replaceChildren();c.docs.slice().sort((a,b)=>b.s.c[c.key]-a.s.c[c.key]).forEach(d=>{const b=document.createElement('button');b.textContent=d.s.s+' · '+d.s.y;const small=document.createElement('small');small.textContent=`${d.category} · ${d.s.c[c.key]} shared sentences`;b.append(small);b.onclick=()=>showDocument(d,c.category);list.append(b);});$('#detail').hidden=false;$('#close-detail').focus();}
  function showDocument(d,category){$('#detail-title').textContent=d.s.s;$('#detail-summary').textContent=`${d.s.y} · ${d.category}\n${d.s.t}`;const list=$('#detail-list');list.replaceChildren();cells.filter(c=>d.s.c[c.key]>0).map(c=>{if(!category)return c;const cohort=docs.filter(doc=>doc.category===category),a=aggregate(cohort),count=a.c[c.key]||0;return {...c,category,count,ratio:count>=3&&a.v[c.v]&&a.k[c.k]?count*a.n/(a.v[c.v]*a.k[c.k]):null,docs:cohort.filter(doc=>doc.s.c[c.key]>0)};}).forEach(c=>{const b=document.createElement('button');b.textContent=`${name(c.v)} × ${c.k} — ${d.s.c[c.key]} shared sentences`;b.onclick=()=>showCell(c);list.append(b);});const a=document.createElement('a');a.textContent='Open full profile in the reference explorer ↗';a.href='../word_associations/index.html#syllabus/'+d.id;a.target='_blank';a.rel='noopener';list.append(a);$('#detail').hidden=false;$('#close-detail').focus();}
  function nearest(e){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=null,dist=64;const pool=stage===0?docs.filter(d=>selected==='All categories'||d.category===selected):particles;for(const p of pool){const dd=(p.x-x)**2+(p.y-y)**2;if(dd<dist){best=p.doc||p;dist=dd;}}return best;}
  plot.onpointermove=e=>{if(stage===3)return;const d=nearest(e);if(d){tooltip(e,`${d.s.s} · ${d.s.y}\n${d.category}\n${Object.keys(d.s.c).filter(k=>cells.some(c=>c.key===k)&&d.s.c[k]>0).length} visible pairs`);}else hideTip();if(hovered!==d){hovered=d;redraw();}};
  plot.onpointerleave=()=>{hideTip();hovered=null;redraw();};canvas.onclick=e=>{const d=nearest(e);if(d)showDocument(d);};
  $('#close-detail').onclick=()=>{$('#detail').hidden=true;};document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#detail').hidden=true;hideTip();}});
  document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{stage=+b.dataset.stage;build();});$('#next').onclick=()=>{stage=(stage+1)%5;build();};

  function updateHeatmapView() {
    const comparing=stage===4;
    $('#comparison-key').hidden=!comparing;
    updatePdfPicker();
    // Category filters apply to Documents, Associations, Matrix and Heatmap.
    $('#filters').hidden=stage===4;
    $('#filters').inert=stage===4;
    plot.hidden=comparing;$('#comparison').hidden=!comparing;
    if(!comparing){$('#counts').textContent=((n)=>n+(n===1?' document':' documents'))(activeDocuments().length);return;}
    const root=$('#comparison');root.replaceChildren();
    const diagram=document.createElement('div');diagram.className='comparison-map';diagram.setAttribute('aria-label','Category positions in the comparison');
    categories.forEach((category,index)=>{
      const item=document.createElement('div');item.className='comparison-map-item';
      const title=document.createElement('span');title.textContent=categoryName(category);
      item.append(title);diagram.append(item);
    });$('#comparison-key').replaceChildren(diagram);
    const keywordAxis=document.createElement('div');keywordAxis.className='comparison-keyword-axis';keywordAxis.textContent='Keywords';root.append(keywordAxis);
    const verbAxis=document.createElement('div');verbAxis.className='comparison-verb-axis';verbAxis.textContent='Verbs';root.append(verbAxis);
    let total=0;
    categories.forEach((category,index)=>{
      const cohort=docs.filter(d=>d.category===category&&matchesPdf(d)), a=aggregate(cohort);total+=cohort.length;
      const panel=document.createElement('section');panel.className='comparison-panel';panel.dataset.panel=index;
      const heading=document.createElement('h3');heading.textContent=categoryName(category);
      const dot=document.createElement('span');dot.className='swatch';dot.style.background=colors[index];
      const count=document.createElement('p');count.textContent=cohort.length+' documents';
      panel.append(heading,count);
      const scroller=document.createElement('div');scroller.className='comparison-scroll';
      const table=document.createElement('table');table.setAttribute('aria-label',category+' association heatmap');
      const thead=document.createElement('thead'),headrow=document.createElement('tr');
      const corner=document.createElement('th');corner.textContent='';headrow.append(corner);
      keywords.forEach(k=>{const th=document.createElement('th');th.scope='col';const label=document.createElement('span');label.textContent=k;th.append(label);headrow.append(th);});
      thead.append(headrow);table.append(thead);const tbody=document.createElement('tbody');
      verbs.forEach((v,r)=>{
        const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';const rowLabel=document.createElement('span');rowLabel.textContent=name(v);th.append(rowLabel);row.append(th);
        keywords.forEach((k,c)=>{
          const key=v+'|'+k,count=a.c[key]||0,ratio=count>=3&&a.v[v]&&a.k[k]?count*a.n/(a.v[v]*a.k[k]):null;
          const cell={v,k,r,c,key,count,ratio,category,docs:cohort.filter(d=>(d.s.c[key]||0)>0)};
          const td=document.createElement('td'),button=document.createElement('button');button.dataset.pair=key;
          button.textContent=fmt(ratio);button.style.backgroundColor=fillColor(ratio);
          button.classList.toggle('unscored',ratio===null);button.setAttribute('aria-label',cellText(cell));
          button.onclick=()=>showCell(cell);
          const highlight=on=>{root.classList.toggle('comparing-pair',on);root.querySelectorAll('button[data-pair]').forEach(b=>b.classList.toggle('pair-highlight',on&&b.dataset.pair===key));};
          button.onpointermove=e=>{highlight(true);tooltip(e,cellText(cell));};button.onpointerleave=()=>{highlight(false);hideTip();};
          button.onfocus=()=>{highlight(true);const rect=button.getBoundingClientRect();tooltip({clientX:rect.left,clientY:rect.top},cellText(cell));};button.onblur=()=>{highlight(false);hideTip();};
          td.append(button);row.append(td);
        });tbody.append(row);
      });table.append(tbody);scroller.append(table);panel.append(scroller);root.append(panel);
    });
    $('#counts').textContent=selectedPdf?'1 document':'25 documents';
    requestAnimationFrame(alignComparisonAxes);
  }



  function updatePdfPicker(){
    $('#pdf-filter').hidden=stage<3;
    const picker=$('#pdf-picker'),available=docs.filter(d=>stage===4||selected==='All categories'||d.category===selected).slice().sort((a,b)=>a.s.t.localeCompare(b.s.t));
    picker.replaceChildren();const all=document.createElement('option');all.value='';all.textContent='All PDFs';picker.append(all);
    available.forEach(d=>{const option=document.createElement('option');option.value=String(d.id);option.textContent=d.s.t.replace(/\.pdf$/i,'')+'.pdf';picker.append(option);});picker.value=selectedPdf;
  }
  $('#pdf-picker').onchange=e=>{selectedPdf=e.target.value;if(stage===4){selected='All categories';$('#filters').querySelectorAll('button').forEach((button,index)=>{button.classList.toggle('active',index===0);button.setAttribute('aria-pressed',String(index===0));});}build();};

  function alignComparisonAxes(){
    if(stage!==4)return;
    const root=$('#comparison'),panel=root.querySelector('[data-panel="0"]');
    if(!panel)return;
    const bounds=root.getBoundingClientRect(),first=panel.getBoundingClientRect();
    const keywordLabel=root.querySelector('.comparison-keyword-axis');
    // Use an explicit box position so grid alignment cannot offset the label.
    keywordLabel.style.left=(first.right-bounds.left+root.scrollLeft-keywordLabel.getBoundingClientRect().width/2)+'px';
    root.querySelector('.comparison-verb-axis').style.top=(first.bottom-bounds.top)+'px';
  }
  new ResizeObserver(alignComparisonAxes).observe($('#comparison'));

  async function init(){const response=await fetch('../../data/macro-categories.csv');if(!response.ok)throw Error('Cannot load document categories (HTTP '+response.status+').');const rows=csv((await response.text()).replace(/^\uFEFF/,''));if(rows[0]?.join(',')!=='pdf_filename,macro_category')throw Error('Unexpected category file format.');const mapping=new Map(rows.slice(1).filter(r=>r[1]!=='-').map(r=>[normalize(r[0]),r[1]]));docs=D.syllabi.map((s,id)=>({s,id,category:mapping.get(normalize(s.t))})).filter(d=>categories.includes(d.category));
    const filters=['All categories',...categories];filters.forEach(cat=>{const b=document.createElement('button');b.classList.toggle('active',cat===selected);b.setAttribute('aria-pressed',String(cat===selected));const dot=document.createElement('span');dot.className='swatch';dot.style.background=colors[categories.indexOf(cat)]||'#aaa6bc';b.append(dot,document.createTextNode(categoryName(cat)));b.onclick=()=>{selected=cat;if(selectedPdf&&!docs.some(d=>String(d.id)===selectedPdf&&(cat==='All categories'||d.category===cat)))selectedPdf='';$('#filters').querySelectorAll('button').forEach(n=>{const on=n===b;n.classList.toggle('active',on);n.setAttribute('aria-pressed',String(on));});build();};$('#filters').append(b);});build();new ResizeObserver(()=>{if(plot.hidden)return;const w=plot.clientWidth,h=plot.clientHeight;if(!geometry||w!==geometry.w||h!==geometry.h)layout();}).observe(plot);
  }
  init().catch(error=>{$('#error').hidden=false;$('#error').textContent=error.message+' Open this page through your local web server, as with word_associations.';$('#counts').textContent='Collection unavailable';console.error(error);});
})();
