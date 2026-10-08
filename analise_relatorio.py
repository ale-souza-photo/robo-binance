"""Gera o relatório visual (HTML único, sem dependências) da análise de ativos.

O arquivo funciona offline, só as fontes vêm do Google Fonts (se não houver internet, usa fontes comuns).
"""
import json
from datetime import datetime

CORES = {"BTC": "#f4b942", "ETH": "#8f9bff", "DOLAR": "#2ee59d", "CDI": "#d9d4c3", "BOVA11": "#4fd1ff", "IVVB11": "#ff7a90"}
EXTRAS = ["#c792ea", "#82e0aa", "#f0a35e", "#7fd8be", "#e6a1d0", "#b5d36a"]


def _amostra(lista, passo=7):
    return [lista[i] for i in range(0, len(lista), passo)] + ([lista[-1]] if (len(lista) - 1) % passo else [])


def gerar(caminho, datas, valores, stats, nomes_corr, corr, carteiras, frases, args, demo=False):
    from analise_ativos import NOMES
    cores, extra = dict(CORES), 0
    for n in valores:
        if n not in cores:
            cores[n] = EXTRAS[extra % len(EXTRAS)]
            extra += 1
    dados = {
        "demo": demo,
        "periodo": [datas[0].isoformat(), datas[-1].isoformat()],
        "anos": round(stats[next(iter(stats))]["anos"], 1),
        "datas": [d.isoformat() for d in _amostra(datas)],
        "ativos": [{"id": n, "nome": NOMES.get(n, n), "cor": cores[n],
                    "serie": [round(100 * x / v[0], 2) for x in _amostra(v)],
                    "cagr": s["cagr"], "total": s["retorno_total"], "vol": s["vol"], "queda": s["pior_queda"],
                    "calmar": s["calmar"], "pos12": s["pos_12m"], "pior12": s["pior_12m"], "melhor12": s["melhor_12m"],
                    "anos_ret": {str(k): v_ for k, v_ in s["por_ano"].items()}}
                   for n, v in valores.items() for s in [stats[n]]],
        "corr": {"nomes": nomes_corr, "m": [[round(corr[a][b], 3) for b in nomes_corr] for a in nomes_corr]},
        "carteiras": [{"nome": n, "aportado": m["aportado"], "final": m["valor_final"], "ganho": m["ganho"], "tir": m["tir"],
                       "queda": m["pior_queda_no_papel"], "prejuizo": m["pct_no_prejuizo"],
                       "valor": [round(x, 2) for x in _amostra(m["valor"])], "aportes": [round(x, 2) for x in _amostra(m["aportes"])]}
                      for n, m in sorted(carteiras.items(), key=lambda kv: kv[1]["valor_final"], reverse=True)],
        "params": {"inicial": args.inicial, "mensal": args.mensal, "dia": args.dia},
        "frases": frases, "gerado": datetime.now().strftime("%d/%m/%Y %H:%M"),
    }
    texto = json.dumps(dados, ensure_ascii=False).replace("</", "<\\/")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(MODELO.replace("__DADOS__", texto))


MODELO = r"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trader Bit · Análise de ativos</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;600;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#05070a;--panel:#0b0f14;--panel2:#10161d;--field:#080b0f;--edge:#2b2515;--gold:#d4af37;--gold2:#f4dd9a;--golddim:#8a7228;
  --tx:#d9d4c3;--mut:#7d7b6c;--up:#2ee59d;--down:#ff4d5e;--cyan:#4fd1ff;--amber:#ffb347;
  --serif:'Cormorant Garamond',Georgia,serif;--ui:'Manrope','Segoe UI',system-ui,sans-serif;--mono:'JetBrains Mono',Consolas,monospace}
*{box-sizing:border-box;margin:0}
body{font-family:var(--ui);color:var(--tx);background:radial-gradient(1100px 600px at 85% -10%,rgba(212,175,55,.09),transparent 60%),var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased}
header{padding:20px 26px;border-bottom:1px solid var(--gold);background:linear-gradient(#10151c,#07090d)}
header h1{font-family:var(--serif);font-weight:700;font-size:28px;letter-spacing:.3em;color:var(--gold2)}
header p{font-size:12px;color:var(--mut);letter-spacing:.06em;margin-top:6px}
.wrap{max-width:1240px;margin:0 auto;padding:18px 18px 60px}
.aviso{margin-bottom:14px;padding:9px 14px;border:1px solid var(--amber);color:var(--amber);font-size:12px;font-weight:800;letter-spacing:.05em;background:rgba(255,179,71,.07)}
.card{position:relative;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--edge);padding:18px 20px;margin-bottom:16px}
.card::before,.card::after{content:"";position:absolute;width:12px;height:12px}
.card::before{left:-1px;top:-1px;border-left:2px solid var(--gold);border-top:2px solid var(--gold)}
.card::after{right:-1px;bottom:-1px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold)}
h2{display:flex;align-items:center;gap:9px;font-size:11px;font-weight:800;letter-spacing:.16em;color:var(--gold2);text-transform:uppercase;margin-bottom:6px}
h2::before{content:"";width:7px;height:7px;background:var(--gold);transform:rotate(45deg)}
.sub{font-size:12.5px;color:var(--mut);line-height:1.55;margin-bottom:12px;max-width:900px}
.sub b{color:var(--tx)}
canvas{width:100%;display:block}
.chart{position:relative}
.dica{position:absolute;pointer-events:none;opacity:0;padding:8px 11px;font-size:11.5px;background:rgba(5,7,10,.94);border:1px solid var(--golddim);line-height:1.6;white-space:nowrap;z-index:5}
.dica b{font-family:var(--mono)}
.leg{display:flex;flex-wrap:wrap;gap:8px 16px;margin:10px 0 2px}
.leg button{border:0;background:transparent;color:var(--tx);font:700 11px var(--ui);letter-spacing:.08em;cursor:pointer;display:flex;align-items:center;gap:7px;padding:3px 0}
.leg button i{width:14px;height:4px;background:var(--c)}.leg button.off{opacity:.35}
.btn{border:1px solid var(--gold);background:rgba(212,175,55,.06);color:var(--gold);font:800 10px var(--ui);letter-spacing:.14em;padding:6px 12px;cursor:pointer}
.topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{font-size:10px;letter-spacing:.12em;color:var(--mut);font-weight:800;text-align:right;padding:8px 10px;border-bottom:1px solid var(--edge)}
td{text-align:right;padding:9px 10px;border-bottom:1px solid rgba(43,37,21,.55);font-family:var(--mono);font-weight:500}
th:first-child,td:first-child{text-align:left;font-family:var(--ui);font-weight:700}
td.n{font-family:var(--serif);font-size:16px;color:var(--gold2);font-weight:700}
.pos{color:var(--up)}.neg{color:var(--down)}
.scroll{overflow-x:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.grid2{grid-template-columns:1fr}}
.cart{border:1px solid var(--edge);padding:14px;background:var(--field)}
.cart h3{font-family:var(--serif);font-size:18px;color:var(--gold2);line-height:1.2;margin-bottom:10px}
.kv{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 14px;margin:10px 0}
.kv span{display:block;font-size:10px;letter-spacing:.12em;color:var(--mut);font-weight:800}
.kv b{font-family:var(--mono);font-size:15px;color:var(--tx)}
.frases{list-style:none;padding:0}.frases li{padding:10px 0 10px 20px;position:relative;font-size:13.5px;line-height:1.6;border-bottom:1px solid rgba(43,37,21,.55)}
.frases li::before{content:"◆";position:absolute;left:0;top:13px;font-size:8px;color:var(--golddim)}
.rodape{font-size:11px;color:var(--mut);text-align:center;margin-top:20px;line-height:1.7}
</style>
</head>
<body>
<header><h1>TRADER BIT · ANÁLISE DE ATIVOS</h1><p id="cab"></p></header>
<div class="wrap">
  <div class="aviso" id="demo" hidden>DEMONSTRAÇÃO · os dados deste relatório são FICTÍCIOS. Rode <code>python analise_ativos.py</code> para os dados reais.</div>

  <section class="card">
    <div class="topo"><div><h2>O que aconteceu com R$ 100</h2>
      <p class="sub">Se você tivesse colocado <b>R$ 100 em cada ativo no começo do período</b> (tudo em reais), este seria o caminho de cada um. Clique no nome para esconder ou mostrar.</p></div>
      <button class="btn" id="escala" type="button">ESCALA: LOGARÍTMICA</button></div>
    <div class="chart"><canvas id="cCresc" height="380"></canvas><div class="dica" id="dCresc"></div></div>
    <div class="leg" id="leg"></div>
  </section>

  <section class="card">
    <h2>Retorno contra risco</h2>
    <p class="sub">Cada ponto é um ativo. <b>Quanto mais alto, mais rendeu por ano. Quanto mais à direita, maior foi a pior queda</b> que quem tinha esse ativo teve que aguentar. O ideal é ficar no alto e à esquerda; o CDI mostra o que a renda fixa pagou sem susto.</p>
    <canvas id="cRisco" height="360"></canvas>
  </section>

  <section class="card"><h2>Os números de cada ativo</h2>
    <p class="sub"><b>Pior queda</b>: do maior valor até o fundo seguinte. <b>12 meses positivos</b>: em quantas das janelas de 12 meses o resultado foi positivo. <b>Retorno / queda</b>: retorno anual dividido pela pior queda.</p>
    <div class="scroll"><table id="tAtivos"></table></div>
  </section>

  <section class="card"><h2>Retorno em cada ano</h2>
    <p class="sub">Mostra como o resultado muda de um ano para o outro. Anos com poucos dados no começo ou no fim do período são parciais.</p>
    <div class="scroll"><table id="tAnos"></table></div>
  </section>

  <section class="card"><h2>O quanto andam juntos</h2>
    <p class="sub">Correlação dos retornos semanais: <b>1 = sobem e descem sempre juntos; perto de 0 = sem relação</b>. Ativos que andam juntos diversificam pouco.</p>
    <div class="scroll"><table id="tCorr"></table></div>
  </section>

  <section class="card"><h2>Carteiras de exemplo com os seus aportes</h2>
    <p class="sub" id="subCart"></p>
    <div class="grid2" id="carts"></div>
  </section>

  <section class="card"><h2>Leitura rápida</h2><ul class="frases" id="frases"></ul></section>
  <p class="rodape" id="rod"></p>
</div>
<script>
const D = __DADOS__;
const $ = s => document.querySelector(s);
const nf = (n,d=2) => n==null||isNaN(n) ? '—' : n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pc = (n,d=1) => n==null ? '—' : (n>0?'+':n<0?'−':'')+nf(Math.abs(100*n),d)+'%';
const dt = s => new Date(s+'T12:00:00').toLocaleDateString('pt-BR');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const reais = n => 'R$ '+nf(n,0);
const qd = q => q<0.005 ? '0%' : '−'+nf(100*q,0)+'%';

$('#cab').textContent = `Período ${dt(D.periodo[0])} a ${dt(D.periodo[1])} (${nf(D.anos,1)} anos) · tudo em reais · gerado em ${D.gerado}`;
$('#demo').hidden = !D.demo;
$('#subCart').innerHTML = `Simulação: <b>${reais(D.params.inicial)} no primeiro dia</b> e <b>${reais(D.params.mensal)} por mês</b> (a partir do dia ${D.params.dia}), repartidos conforme cada carteira. São exemplos para comparar, <b>não recomendações</b>.`;

function prep(c, hCss){ const k=devicePixelRatio||1, r=c.getBoundingClientRect(); c.width=Math.round(r.width*k); c.height=Math.round(hCss*k); c.style.height=hCss+'px'; return k; }
const oculto = new Set(); let log = true;

/* ---- crescimento ---- */
function cresc(){
  const c=$('#cCresc'), k=prep(c,380), g=c.getContext('2d'), W=c.width, H=c.height;
  g.clearRect(0,0,W,H);
  const vis = D.ativos.filter(a=>!oculto.has(a.id)); if(!vis.length) return;
  const n = D.datas.length, L=56*k, R=W-12*k, T=10*k, B=H-26*k;
  let lo=Infinity, hi=-Infinity; vis.forEach(a=>a.serie.forEach(v=>{lo=Math.min(lo,v);hi=Math.max(hi,v);}));
  lo=Math.min(lo,100); const f = v => log ? Math.log(v) : v, a0=f(lo*.95), a1=f(hi*1.05);
  const X=i=>L+(R-L)*i/(n-1), Y=v=>B-(B-T)*(f(v)-a0)/(a1-a0);
  g.font=`${10*k}px JetBrains Mono, monospace`; g.textAlign='right';
  const marcas=[]; const passos=log?[25,50,100,200,400,800,1600,3200,6400,12800,25600]:[0,50,100,200,300,400,500,750,1000,1500,2000,3000,5000,10000];
  passos.forEach(v=>{ if(v>=lo*.95 && v<=hi*1.05){ const y=Y(v); g.strokeStyle='rgba(212,175,55,.09)'; g.lineWidth=k; g.beginPath(); g.moveTo(L,y); g.lineTo(R,y); g.stroke(); g.fillStyle='#7d7b6c'; g.fillText(reais(v),L-6*k,y+3*k);} });
  g.strokeStyle='rgba(244,221,154,.4)'; g.setLineDash([5*k,5*k]); g.beginPath(); g.moveTo(L,Y(100)); g.lineTo(R,Y(100)); g.stroke(); g.setLineDash([]);
  g.textAlign='center'; for(let i=0;i<=5;i++){ const ix=Math.round((n-1)*i/5); g.fillStyle='#7d7b6c'; g.fillText(new Date(D.datas[ix]+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}),X(ix),H-8*k); }
  vis.forEach(a=>{ g.beginPath(); a.serie.forEach((v,i)=> i?g.lineTo(X(i),Y(v)):g.moveTo(X(i),Y(v))); g.strokeStyle=a.cor; g.lineWidth=2*k; g.lineJoin='round'; g.stroke(); });
  c._m={n,L,R,X,vis};
}
$('#cCresc').addEventListener('mousemove',e=>{ const c=e.target, m=c._m; if(!m) return; const k=devicePixelRatio||1, r=c.getBoundingClientRect(), x=(e.clientX-r.left)*k;
  const i=clamp(Math.round((x-m.L)/(m.R-m.L)*(m.n-1)),0,m.n-1), d=$('#dCresc');
  d.innerHTML=`<b>${dt(D.datas[i])}</b><br>`+m.vis.slice().sort((a,b)=>b.serie[i]-a.serie[i]).map(a=>`<span style="color:${a.cor}">■</span> ${a.nome}: <b>${reais(a.serie[i])}</b>`).join('<br>');
  d.style.opacity=1; d.style.left=clamp(e.clientX-r.left+14,0,r.width-250)+'px'; d.style.top='6px'; });
$('#cCresc').addEventListener('mouseleave',()=>$('#dCresc').style.opacity=0);
$('#escala').addEventListener('click',()=>{ log=!log; $('#escala').textContent='ESCALA: '+(log?'LOGARÍTMICA':'LINEAR'); cresc(); });
$('#leg').innerHTML = D.ativos.map(a=>`<button type="button" data-id="${a.id}" style="--c:${a.cor}"><i></i>${a.nome.toUpperCase()}</button>`).join('');
$('#leg').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; const id=b.dataset.id; oculto.has(id)?oculto.delete(id):oculto.add(id); b.classList.toggle('off'); cresc(); });

/* ---- retorno x risco ---- */
function risco(){
  const c=$('#cRisco'), k=prep(c,360), g=c.getContext('2d'), W=c.width, H=c.height; g.clearRect(0,0,W,H);
  const L=58*k,R=W-24*k,T=14*k,B=H-36*k, xs=D.ativos.map(a=>a.queda), ys=D.ativos.map(a=>a.cagr);
  const xm=Math.max(.1,...xs)*1.12, y0=Math.min(0,...ys)*1.15, y1=Math.max(.05,...ys)*1.15;
  const X=v=>L+(R-L)*v/xm, Y=v=>B-(B-T)*(v-y0)/(y1-y0);
  g.font=`${10*k}px JetBrains Mono, monospace`;
  for(let i=0;i<=5;i++){ const v=y0+(y1-y0)*i/5, y=Y(v); g.strokeStyle='rgba(212,175,55,.09)'; g.lineWidth=k; g.beginPath(); g.moveTo(L,y); g.lineTo(R,y); g.stroke(); g.fillStyle='#7d7b6c'; g.textAlign='right'; g.fillText(pc(v,0),L-6*k,y+3*k); }
  for(let i=0;i<=5;i++){ const v=xm*i/5, x=X(v); g.strokeStyle='rgba(212,175,55,.05)'; g.beginPath(); g.moveTo(x,T); g.lineTo(x,B); g.stroke(); g.fillStyle='#7d7b6c'; g.textAlign='center'; g.fillText(nf(100*v,0)+'%',x,H-18*k); }
  g.fillStyle='#7d7b6c'; g.textAlign='center'; g.fillText('PIOR QUEDA →',(L+R)/2,H-4*k);
  g.save(); g.translate(12*k,(T+B)/2); g.rotate(-Math.PI/2); g.fillText('RETORNO POR ANO →',0,0); g.restore();
  const cdi=D.ativos.find(a=>a.id==='CDI'); if(cdi){ g.setLineDash([5*k,5*k]); g.strokeStyle='rgba(217,212,195,.5)'; g.beginPath(); g.moveTo(L,Y(cdi.cagr)); g.lineTo(R,Y(cdi.cagr)); g.stroke(); g.setLineDash([]); g.fillStyle='#d9d4c3'; g.textAlign='right'; g.fillText('ACIMA DESTA LINHA = RENDEU MAIS QUE O CDI',R,Y(cdi.cagr)-6*k); }
  D.ativos.forEach(a=>{ const x=X(a.queda), y=Y(a.cagr), r=(6+14*Math.min(a.vol/1.2,1))*k;
    g.fillStyle=a.cor; g.globalAlpha=.22; g.beginPath(); g.arc(x,y,r,0,6.283); g.fill(); g.globalAlpha=1; g.beginPath(); g.arc(x,y,4*k,0,6.283); g.fill();
    g.font=`800 ${11*k}px Manrope, sans-serif`; g.textAlign=x>(L+R)/2?'right':'left'; g.fillStyle=a.cor; g.fillText(a.id, x+(x>(L+R)/2?-(r+4*k):(r+4*k)), y+4*k); g.font=`${10*k}px JetBrains Mono, monospace`; });
}

/* ---- tabelas ---- */
const cell=(txt,cls='')=>`<td class="${cls}">${txt}</td>`;
function tabelas(){
  const ord=D.ativos.slice().sort((a,b)=>b.cagr-a.cagr);
  $('#tAtivos').innerHTML=`<tr><th>ATIVO</th><th>RETORNO/ANO</th><th>RETORNO TOTAL</th><th>OSCILAÇÃO</th><th>PIOR QUEDA</th><th>RETORNO/QUEDA</th><th>12 MESES POSITIVOS</th><th>PIOR 12 MESES</th></tr>`+
   ord.map(a=>`<tr><td class="n" style="color:${a.cor}">${a.nome}</td>${cell(pc(a.cagr),a.cagr>=0?'pos':'neg')}${cell(pc(a.total,0),a.total>=0?'pos':'neg')}${cell(nf(100*a.vol,0)+'%')}${cell(qd(a.queda),a.queda>.3?'neg':'')}${cell(a.calmar==null?'—':nf(a.calmar,2))}${cell(a.pos12==null?'—':nf(100*a.pos12,0)+'%')}${cell(pc(a.pior12,0),'neg')}</tr>`).join('');
  const anos=[...new Set(D.ativos.flatMap(a=>Object.keys(a.anos_ret)))].sort();
  const cor=v=>{ if(v==null) return ''; const t=clamp(Math.abs(v)/.6,0,1)*.55; return `style="background:${v>=0?`rgba(46,229,157,${t})`:`rgba(255,77,94,${t})`}"`; };
  $('#tAnos').innerHTML=`<tr><th>ATIVO</th>${anos.map(y=>`<th>${y}</th>`).join('')}</tr>`+ord.map(a=>`<tr><td class="n" style="color:${a.cor}">${a.nome}</td>${anos.map(y=>{const v=a.anos_ret[y]; return `<td ${cor(v)}>${v==null?'—':pc(v,0)}</td>`;}).join('')}</tr>`).join('');
  const nm=D.corr.nomes, nome=id=>(D.ativos.find(a=>a.id===id)||{}).nome||id, ccor=v=>{ const t=clamp(Math.abs(v),0,1)*.6; return `style="background:${v>=0?`rgba(212,175,55,${t})`:`rgba(79,209,255,${t})`}"`; };
  $('#tCorr').innerHTML=`<tr><th></th>${nm.map(n=>`<th>${n}</th>`).join('')}</tr>`+nm.map((a,i)=>`<tr><td class="n">${nome(a)}</td>${nm.map((b,j)=>`<td ${ccor(D.corr.m[i][j])}>${nf(D.corr.m[i][j],2)}</td>`).join('')}</tr>`).join('');
}

/* ---- carteiras ---- */
function carteiras(){
  $('#carts').innerHTML=D.carteiras.map((c,i)=>`<div class="cart"><h3>${c.nome}</h3><canvas id="cc${i}" height="130"></canvas>
   <div class="kv"><div><span>APORTADO</span><b>${reais(c.aportado)}</b></div><div><span>VALOR FINAL</span><b class="${c.ganho>=0?'pos':'neg'}">${reais(c.final)}</b></div>
   <div><span>RETORNO ANUAL DO SEU DINHEIRO</span><b class="${(c.tir||0)>=0?'pos':'neg'}">${pc(c.tir)}</b></div><div><span>PIOR QUEDA NO PAPEL</span><b class="neg">${qd(c.queda)}</b></div>
   <div><span>TEMPO ABAIXO DO APORTADO</span><b>${nf(100*c.prejuizo,0)}%</b></div><div><span>GANHO</span><b class="${c.ganho>=0?'pos':'neg'}">${c.ganho>=0?'+':'−'}${reais(Math.abs(c.ganho))}</b></div></div></div>`).join('');
  D.carteiras.forEach((c,i)=>{ const cv=$('#cc'+i), k=prep(cv,130), g=cv.getContext('2d'), W=cv.width, H=cv.height, n=c.valor.length, hi=Math.max(...c.valor,...c.aportes)*1.05, X=j=>6*k+(W-12*k)*j/(n-1), Y=v=>H-6*k-(H-12*k)*v/hi;
    g.clearRect(0,0,W,H); g.setLineDash([4*k,4*k]); g.strokeStyle='#7d7b6c'; g.lineWidth=1.5*k; g.beginPath(); c.aportes.forEach((v,j)=>j?g.lineTo(X(j),Y(v)):g.moveTo(X(j),Y(v))); g.stroke(); g.setLineDash([]);
    const grd=g.createLinearGradient(0,0,0,H); grd.addColorStop(0,'rgba(212,175,55,.28)'); grd.addColorStop(1,'rgba(212,175,55,0)'); g.beginPath(); c.valor.forEach((v,j)=>j?g.lineTo(X(j),Y(v)):g.moveTo(X(j),Y(v))); g.lineTo(X(n-1),H); g.lineTo(X(0),H); g.fillStyle=grd; g.fill();
    g.beginPath(); c.valor.forEach((v,j)=>j?g.lineTo(X(j),Y(v)):g.moveTo(X(j),Y(v))); g.strokeStyle='#f4dd9a'; g.lineWidth=2*k; g.stroke(); });
}
$('#frases').innerHTML=D.frases.map(f=>`<li></li>`).join(''); document.querySelectorAll('#frases li').forEach((li,i)=>li.textContent=D.frases[i]);
$('#rod').innerHTML='Linha dourada: quanto a carteira valia a cada momento · tracejada: quanto você tinha aportado.<br>Dados públicos: Binance (cripto), Banco Central (dólar e CDI) e Yahoo Finance (bolsa). Isto descreve o passado e não é recomendação de investimento.';
function tudo(){ cresc(); risco(); carteiras(); }
tabelas(); tudo(); addEventListener('resize',tudo);
</script>
</body>
</html>
"""
