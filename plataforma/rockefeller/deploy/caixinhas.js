/* ===== Painel gráfico das caixinhas (dados do parecer do Trader Bit: anaP.caixinhas). Só leitura. ===== */
(function(){
  if(typeof renderAnalista!=='function')return;
  var css='.cx-box{margin:18px 0 6px;padding:16px 18px;border:1px solid var(--bd2,#26323c);background:linear-gradient(180deg,rgba(16,22,28,.9),rgba(8,11,15,.9));position:relative}'+
  '.cx-box:before,.cx-box:after{content:"";position:absolute;width:12px;height:12px;pointer-events:none}'+
  '.cx-box:before{left:-1px;top:-1px;border-left:2px solid var(--gold,#d4b36a);border-top:2px solid var(--gold,#d4b36a)}'+
  '.cx-box:after{right:-1px;bottom:-1px;border-right:2px solid var(--gold,#d4b36a);border-bottom:2px solid var(--gold,#d4b36a)}'+
  '.cx-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;font:500 11.5px var(--mono,monospace);letter-spacing:.2em;text-transform:uppercase;color:var(--gold,#d4b36a)}'+
  '.cx-h small{font-size:10px;letter-spacing:.12em;color:var(--mut,#6f7e8a)}'+
  '.cx-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 16px}'+
  '.cx-kpis div{border:1px solid var(--bd,#1a232c);background:rgba(8,11,15,.6);padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}'+
  '.cx-kpis span{font:500 9.5px var(--mono,monospace);letter-spacing:.14em;color:var(--mut,#6f7e8a)}'+
  '.cx-kpis b{font:600 17px var(--mono,monospace);color:var(--gold,#d4b36a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
  '.cx-kpis b.cx-up{color:var(--ok,#3ddc97)}'+
  '.cx-lin{margin:0 0 14px}.cx-topo{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}'+
  '.cx-esq{display:flex;align-items:baseline;min-width:0}'+
  '.cx-nome{font:600 14px var(--sans,sans-serif);color:var(--tx,#e6ebef);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.cx-chip{font:600 10px var(--mono,monospace);letter-spacing:.08em;color:var(--gold,#d4b36a);border:1px solid var(--gold2,#8f7640);padding:2px 7px;margin-left:8px;white-space:nowrap}'+
  '.cx-val{font:500 13px var(--mono,monospace);color:var(--tx,#e6ebef);white-space:nowrap}'+
  '.cx-trilho{height:12px;background:rgba(255,255,255,.05);border:1px solid var(--bd,#1a232c);overflow:hidden}'+
  '.cx-fill{height:100%;transform-origin:left;background:linear-gradient(90deg,var(--gold2,#8f7640),var(--gold,#d4b36a));animation:cxgrow .9s cubic-bezier(.2,.8,.2,1) both}'+
  '.cx-sub{display:flex;justify-content:space-between;gap:10px;margin-top:5px;font:500 11px var(--mono,monospace);color:var(--mut,#6f7e8a)}'+
  '.cx-sub .cx-up{color:var(--ok,#3ddc97)}.cx-nota{margin:6px 0 0;font-size:11.5px;line-height:1.6;color:var(--mut,#6f7e8a)}'+
  '@keyframes cxgrow{from{transform:scaleX(0)}}@media(max-width:640px){.cx-kpis{grid-template-columns:repeat(2,1fr)}}'+
  '@media(prefers-reduced-motion:reduce){.cx-fill{animation:none}}';
  function estilo(){if(document.getElementById('cxStyle'))return;var s=document.createElement('style');s.id='cxStyle';s.textContent=css;document.head.appendChild(s)}
  function brl(n){return n==null||!isFinite(n)?'—':'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
  function kpi(rot,val,up){var d=el('div');d.appendChild(el('span',null,rot));d.appendChild(el('b',up?'cx-up':null,val));return d}
  function painel(){
    var velho=document.getElementById('cxBox');if(velho)velho.remove();
    var p=(typeof anaP!=='undefined')?anaP:null,cx=p&&p.caixinhas;
    if(!cx||!cx.itens||!cx.itens.length||!(cx.total>0))return;
    var ver=document.getElementById('anaVer');if(!ver||!ver.parentNode)return;
    estilo();
    var box=el('div','cx-box');box.id='cxBox';
    var h=el('div','cx-h','Minhas caixinhas');h.appendChild(el('small',null,'renda fixa · % do CDI'));box.appendChild(h);
    var k=el('div','cx-kpis');
    k.appendChild(kpi('TOTAL GUARDADO',brl(cx.total)));
    k.appendChild(kpi('RENDE POR MÊS*',cx.rendMes==null?'—':'+'+brl(cx.rendMes),true));
    k.appendChild(kpi('RENDE POR ANO*',cx.rendAno==null?'—':'+'+brl(cx.rendAno),true));
    k.appendChild(kpi('CDI MÉDIO',cx.pctCdiMedio==null?'—':Math.round(cx.pctCdiMedio)+'%'));
    box.appendChild(k);
    var maior=Math.max.apply(null,cx.itens.map(function(i){return i.saldo}))||1;
    cx.itens.slice().sort(function(a,b){return b.saldo-a.saldo}).forEach(function(i){
      var lin=el('div','cx-lin'),topo=el('div','cx-topo'),esq=el('div','cx-esq');
      esq.appendChild(el('span','cx-nome',i.nome));esq.appendChild(el('span','cx-chip',i.pctCdi+'% CDI'));
      topo.appendChild(esq);topo.appendChild(el('span','cx-val',brl(i.saldo)));
      var tr=el('div','cx-trilho'),fl=el('div','cx-fill');fl.style.width=Math.max(2,100*i.saldo/maior)+'%';tr.appendChild(fl);
      var sub=el('div','cx-sub');sub.appendChild(el('span',null,(100*i.saldo/cx.total).toFixed(0)+'% do total'));
      sub.appendChild(el('span','cx-up',i.rendMes==null?'':'+'+brl(i.rendMes)+' / mês'));
      lin.appendChild(topo);lin.appendChild(tr);lin.appendChild(sub);box.appendChild(lin)});
    box.appendChild(el('p','cx-nota','*Estimativa com o CDI de hoje'+(cx.cdiAnual!=null?' ('+(100*cx.cdiAnual).toFixed(2).replace('.',',')+'% ao ano)':'')+', antes do imposto de renda. Não é promessa. Para mudar, edite em Trader Bit › Caixinhas.'));
    ver.parentNode.insertBefore(box,ver.nextSibling)}
  var original=renderAnalista;
  renderAnalista=function(){var r=original.apply(this,arguments);try{painel()}catch(e){try{console.warn('[caixinhas]',e)}catch(_){}}return r};
})();
