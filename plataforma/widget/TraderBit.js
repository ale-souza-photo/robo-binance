// Trader Bit · widget do Scriptable (mercado + saldo da conta de teste)
// Como usar: cole este script no app Scriptable, rode UMA vez no app (ele pede o token e guarda no chaveiro do iPhone),
// depois adicione um widget do Scriptable à tela inicial e escolha este script.
// Tudo aqui é dinheiro fictício. Não é recomendação de investimento.

const URL_BASE = "https://robo-binance-ten.vercel.app";
const CHAVE_TOKEN = "traderbit_widget_token";
const ARQUIVO_CACHE = "traderbit_widget_cache.json";
const ATUALIZAR_EM_MIN = 10; // o iOS decide o ritmo real; isto é só um pedido

const COR = {
  fundo1: new Color("#0b0f14"),
  fundo2: new Color("#05070a"),
  ouro: new Color("#d4b36a"),
  ouro2: new Color("#8f7640"),
  texto: new Color("#e6ebef"),
  suave: new Color("#6f7e8a"),
  alta: new Color("#3ddc97"),
  queda: new Color("#ff5a67"),
  aviso: new Color("#e8b94a"),
};

// ---------- formatação em português ----------
function brl(n, casas) {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const c = casas === undefined ? 2 : casas;
  const partes = Math.abs(n).toFixed(c).split(".");
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "−" : "") + "R$ " + inteiro + (c > 0 ? "," + partes[1] : "");
}
function casasDoPreco(p) {
  return p < 10 ? 4 : p < 1000 ? 2 : 0;
}
function pct(x, casas) {
  if (x === null || x === undefined || !isFinite(x)) return "";
  const v = 100 * x;
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(casas === undefined ? 1 : casas).replace(".", ",") + "%";
}
function hhmm(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--:--";
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// ---------- token (fica só no chaveiro deste iPhone) ----------
function lerToken() {
  return Keychain.contains(CHAVE_TOKEN) ? Keychain.get(CHAVE_TOKEN) : null;
}
async function pedirToken() {
  const a = new Alert();
  a.title = "Trader Bit";
  a.message = "Cole o token do widget (o valor de WIDGET_TOKEN na Vercel). Ele fica guardado só neste iPhone.";
  a.addSecureTextField("token");
  a.addAction("Guardar");
  a.addCancelAction("Cancelar");
  const escolha = await a.presentAlert();
  if (escolha !== 0) return null;
  const t = (a.textFieldValue(0) || "").trim();
  if (!t) return null;
  Keychain.set(CHAVE_TOKEN, t);
  return t;
}

// ---------- cache (para mostrar o último dado quando está sem internet) ----------
function caminhoCache() {
  const fm = FileManager.local();
  return { fm, caminho: fm.joinPath(fm.documentsDirectory(), ARQUIVO_CACHE) };
}
function gravarCache(dados) {
  try {
    const c = caminhoCache();
    c.fm.writeString(c.caminho, JSON.stringify(dados));
  } catch (e) {}
}
function lerCache() {
  try {
    const c = caminhoCache();
    if (!c.fm.fileExists(c.caminho)) return null;
    return JSON.parse(c.fm.readString(c.caminho));
  } catch (e) {
    return null;
  }
}

// ---------- busca dos dados ----------
async function buscar(token) {
  const req = new Request(URL_BASE + "/api/widget");
  req.headers = { Authorization: "Bearer " + token };
  req.timeoutInterval = 20;
  try {
    const texto = await req.loadString();
    const status = req.response ? req.response.statusCode : 0;
    if (status === 401) return { dados: null, tokenInvalido: true };
    if (status !== 200) throw new Error("HTTP " + status);
    const dados = JSON.parse(texto);
    if (!dados || !Array.isArray(dados.itens)) throw new Error("resposta inesperada");
    gravarCache(dados);
    return { dados: dados, offline: false };
  } catch (e) {
    const cache = lerCache();
    if (cache) return { dados: cache, offline: true, motivo: String(e && e.message ? e.message : e) };
    return { dados: null, erro: String(e && e.message ? e.message : e) };
  }
}

// ---------- desenho ----------
function novoWidget() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [COR.fundo1, COR.fundo2];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(12, 14, 10, 14);
  w.url = URL_BASE + "/mercado";
  w.refreshAfterDate = new Date(Date.now() + ATUALIZAR_EM_MIN * 60 * 1000);
  return w;
}
function texto(pai, conteudo, fonte, cor) {
  const t = pai.addText(conteudo);
  t.font = fonte;
  t.textColor = cor;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}
function avisoWidget(mensagem) {
  const w = novoWidget();
  texto(w, "TRADER BIT", Font.boldSystemFont(12), COR.ouro);
  w.addSpacer(6);
  const t = w.addText(mensagem);
  t.font = Font.systemFont(12);
  t.textColor = COR.suave;
  return w;
}
function pontoDaFonte(fonte) {
  if (fonte === "ao vivo") return { simbolo: "●", cor: COR.alta };
  if (fonte === "atraso") return { simbolo: "●", cor: COR.aviso };
  return { simbolo: "○", cor: COR.suave };
}
function linhaDoItem(pai, item, comVariacao) {
  const linha = pai.addStack();
  linha.layoutHorizontally();
  linha.centerAlignContent();
  const esq = linha.addStack();
  esq.layoutHorizontally();
  esq.centerAlignContent();
  const ponto = pontoDaFonte(item.fonte);
  texto(esq, ponto.simbolo, Font.systemFont(7), ponto.cor);
  esq.addSpacer(4);
  texto(esq, item.id, Font.boldSystemFont(13), COR.ouro);
  linha.addSpacer();
  texto(linha, item.preco === null || item.preco === undefined ? "—" : brl(item.preco, casasDoPreco(item.preco)), Font.boldMonospacedSystemFont(12), COR.texto);
  if (comVariacao) {
    const dir = linha.addStack();
    dir.size = new Size(52, 0);
    dir.layoutHorizontally();
    dir.addSpacer();
    const v = item.var24h;
    texto(dir, v === null || v === undefined ? "" : pct(v, 1), Font.regularMonospacedSystemFont(10), v >= 0 ? COR.alta : COR.queda);
  }
}
function linhaDoSaldo(pai, conta, compacto) {
  const bloco = pai.addStack();
  bloco.layoutVertically();
  if (!conta) {
    texto(bloco, "Saldo indisponível", Font.systemFont(10), COR.suave);
    return;
  }
  const topo = bloco.addStack();
  topo.layoutHorizontally();
  topo.centerAlignContent();
  texto(topo, compacto ? "SALDO" : "PATRIMÔNIO", Font.boldSystemFont(9), COR.suave);
  topo.addSpacer();
  texto(topo, brl(conta.patrimonio, 2), Font.boldMonospacedSystemFont(compacto ? 12 : 14), COR.ouro);
  if (!compacto) {
    const base = bloco.addStack();
    base.layoutHorizontally();
    base.addSpacer();
    const sinal = conta.resultado >= 0 ? COR.alta : COR.queda;
    const sufixo = conta.retorno === null || conta.retorno === undefined ? "" : "  " + pct(conta.retorno, 1);
    texto(base, "resultado " + brl(conta.resultado, 2) + sufixo, Font.regularMonospacedSystemFont(10), sinal);
  }
}

function montar(resultado, familia) {
  if (resultado.tokenInvalido) return avisoWidget("Token recusado. Abra o script no app Scriptable e cole o token de novo.");
  if (!resultado.dados) return avisoWidget("Sem dados ainda (" + (resultado.erro || "sem conexão") + "). Abra o script no app para tentar de novo.");

  const dados = resultado.dados;
  const pequeno = familia === "small";
  const grande = familia === "large";
  const quantos = pequeno ? 3 : grande ? 8 : 4;
  const w = novoWidget();

  const cab = w.addStack();
  cab.layoutHorizontally();
  cab.centerAlignContent();
  texto(cab, "TRADER BIT", Font.boldSystemFont(11), COR.ouro);
  cab.addSpacer();
  texto(cab, pequeno ? "" : "MERCADO", Font.systemFont(9), COR.suave);
  w.addSpacer(6);

  const itens = dados.itens.slice(0, quantos);
  itens.forEach(function (it, i) {
    linhaDoItem(w, it, !pequeno);
    if (i < itens.length - 1) w.addSpacer(grande ? 6 : 4);
  });

  w.addSpacer(grande ? 10 : 6);
  const linha = w.addStack();
  linha.size = new Size(0, 1);
  linha.backgroundColor = COR.ouro2;
  w.addSpacer(5);
  linhaDoSaldo(w, dados.conta, pequeno);

  w.addSpacer(3);
  const rodape = w.addStack();
  rodape.layoutHorizontally();
  const quando = hhmm(dados.geradoEm);
  if (resultado.offline) texto(rodape, "OFFLINE · dado de " + quando, Font.systemFont(8), COR.aviso);
  else texto(rodape, "atualizado " + quando, Font.systemFont(8), COR.suave);
  return w;
}

async function principal() {
  const familia = config.widgetFamily || "large";
  let token = lerToken();
  if (!token) {
    if (config.runsInWidget) {
      Script.setWidget(avisoWidget("Abra o script no app Scriptable uma vez para configurar o token."));
      Script.complete();
      return;
    }
    token = await pedirToken();
    if (!token) {
      Script.complete();
      return;
    }
  }
  const resultado = await buscar(token);
  if (resultado.tokenInvalido && !config.runsInWidget) Keychain.remove(CHAVE_TOKEN); // na próxima vez no app, pede de novo
  const w = montar(resultado, familia);
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentLarge();
  Script.complete();
}

await principal();
