import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Roda widget/TraderBit.js de verdade, com uma simulação mínima da API do Scriptable (não mede o visual no iPhone, mede a lógica). */
const CODIGO = readFileSync(resolve(__dirname, "../widget/TraderBit.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

type Texto = { tipo: "texto"; texto: string; textColor?: { hex: string } };
type No = Texto | Pilha;
class Pilha {
  readonly tipo = "pilha" as const;
  filhos: No[] = [];
  size?: unknown;
  backgroundColor?: unknown;
  addText(t: string) { const x: Texto = { tipo: "texto", texto: t }; this.filhos.push(x); return x; }
  addStack() { const s = new Pilha(); this.filhos.push(s); return s; }
  addSpacer() {}
  layoutHorizontally() {}
  layoutVertically() {}
  centerAlignContent() {}
  setPadding() {}
}
class WidgetFalso extends Pilha {
  url = "";
  refreshAfterDate?: Date;
  backgroundGradient?: unknown;
  apresentou = 0;
  async presentLarge() { this.apresentou += 1; }
}
const textos = (n: No): { texto: string; cor?: string }[] =>
  n.tipo === "texto" ? [{ texto: n.texto, cor: n.textColor?.hex }] : n.filhos.flatMap(textos);

type Cenario = {
  rede?: { status?: number; corpo?: string; erro?: string };
  token?: string | null;
  noWidget?: boolean;
  familia?: string;
  cache?: unknown;
  alerta?: { escolha: number; valor: string };
};

async function rodar(c: Cenario) {
  const chaveiro = new Map<string, string>();
  if (c.token) chaveiro.set("traderbit_widget_token", c.token);
  const arquivos = new Map<string, string>();
  if (c.cache) arquivos.set("/docs/traderbit_widget_cache.json", JSON.stringify(c.cache));
  const visto: { url?: string; headers?: Record<string, string> } = {};
  let widget: WidgetFalso | null = null;
  const estado = { completou: 0, apresentouWidget: 0, buscou: 0, alertas: 0 };

  class Color { constructor(public hex: string) {} }
  class Request {
    url: string; headers: Record<string, string> = {}; timeoutInterval = 0; response: { statusCode: number } | undefined;
    constructor(url: string) { this.url = url; }
    async loadString() {
      estado.buscou += 1;
      visto.url = this.url; visto.headers = this.headers;
      if (c.rede?.erro) throw new Error(c.rede.erro);
      this.response = { statusCode: c.rede?.status ?? 200 };
      return c.rede?.corpo ?? "{}";
    }
  }
  const globais = {
    Color,
    LinearGradient: class { colors: unknown; locations: unknown; },
    Font: new Proxy({}, { get: () => () => ({}) }),
    Size: class { constructor(public w: number, public h: number) {} },
    ListWidget: class extends WidgetFalso { constructor() { super(); widget = this; } },
    Request,
    Keychain: { contains: (k: string) => chaveiro.has(k), get: (k: string) => chaveiro.get(k), set: (k: string, v: string) => void chaveiro.set(k, v), remove: (k: string) => void chaveiro.delete(k) },
    FileManager: { local: () => ({
      documentsDirectory: () => "/docs", joinPath: (a: string, b: string) => `${a}/${b}`,
      writeString: (p: string, s: string) => void arquivos.set(p, s), readString: (p: string) => arquivos.get(p) ?? "", fileExists: (p: string) => arquivos.has(p),
    }) },
    Script: { setWidget: (w: WidgetFalso) => { estado.apresentouWidget += 1; widget = w; }, complete: () => { estado.completou += 1; } },
    config: { runsInWidget: !!c.noWidget, widgetFamily: c.familia },
    Alert: class {
      title = ""; message = "";
      addSecureTextField() {} addAction() {} addCancelAction() {}
      async presentAlert() { estado.alertas += 1; return c.alerta?.escolha ?? 1; }
      textFieldValue() { return c.alerta?.valor ?? ""; }
    },
  };
  const nomes = Object.keys(globais);
  await new AsyncFunction(...nomes, CODIGO)(...nomes.map((n) => (globais as Record<string, unknown>)[n]));
  return { widget: widget as WidgetFalso | null, estado, visto, chaveiro, arquivos, todos: widget ? textos(widget).map((t) => t.texto) : [], coloridos: widget ? textos(widget) : [] };
}

const itens = [
  { id: "BTC", nome: "Bitcoin", preco: 408885, var24h: 0.025, fonte: "ao vivo", data: null },
  { id: "ETH", nome: "Ethereum", preco: 12255.99, var24h: -0.0433, fonte: "ao vivo", data: null },
  { id: "BOVA11", nome: "Ibovespa", preco: 203.66, var24h: null, fonte: "atraso", data: null },
  { id: "IVVB11", nome: "S&P", preco: 438.45, var24h: null, fonte: "fechamento", data: "2026-10-08" },
  { id: "DOLAR", nome: "Dólar", preco: 5.0119, var24h: null, fonte: "fechamento", data: "2026-10-08" },
];
const conta = { nome: "Rockfeller", patrimonio: 1234.5, caixa: 1000, aportado: 1200, resultado: 34.5, retorno: 0.02875, semPreco: [] };
const dados = { geradoEm: "2026-10-08T20:30:00.000Z", itens, conta };
const hora = (iso: string) => `${String(new Date(iso).getHours()).padStart(2, "0")}:${String(new Date(iso).getMinutes()).padStart(2, "0")}`;
const ok = { status: 200, corpo: JSON.stringify(dados) };

describe("widget do Scriptable (lógica)", () => {
  it("médio: mostra 4 ativos, variação colorida, a linha do saldo e a hora; usa o token certo no cabeçalho", async () => {
    const r = await rodar({ token: "meu-token", noWidget: true, familia: "medium", rede: ok });
    const t = r.todos.join(" | ");
    expect(r.estado.apresentouWidget).toBe(1);
    expect(r.estado.completou).toBe(1);
    expect(r.visto.url).toBe("https://robo-binance-ten.vercel.app/api/widget");
    expect(r.visto.headers).toEqual({ Authorization: "Bearer meu-token" });
    for (const esperado of ["TRADER BIT", "MERCADO", "BTC", "R$ 408.885", "+2,5%", "ETH", "R$ 12.256", "−4,3%", "BOVA11", "R$ 203,66", "PATRIMÔNIO", "R$ 1.234,50", "+2,9%", `atualizado ${hora(dados.geradoEm)}`]) {
      expect(t).toContain(esperado);
    }
    expect(t).toContain("IVVB11"); // o médio mostra os 4 primeiros
    expect(t).not.toContain("DOLAR"); // e o quinto fica de fora
    const alta = r.coloridos.find((x) => x.texto === "+2,5%");
    const queda = r.coloridos.find((x) => x.texto === "−4,3%");
    expect(alta?.cor).toBe("#3ddc97");
    expect(queda?.cor).toBe("#ff5a67");
    expect(r.widget?.url).toBe("https://robo-binance-ten.vercel.app/mercado");
    expect(r.widget?.refreshAfterDate && r.widget.refreshAfterDate.getTime() > Date.now()).toBe(true);
  });

  it("pequeno: 3 ativos, sem variação, saldo compacto; grande: até 8", async () => {
    const p = await rodar({ token: "t", noWidget: true, familia: "small", rede: ok });
    const tp = p.todos.join(" | ");
    expect(tp).toContain("SALDO");
    expect(tp).not.toContain("PATRIMÔNIO");
    expect(tp).not.toContain("+2,5%");
    expect(tp).toContain("BOVA11");
    expect(tp).not.toContain("IVVB11");
    const g = await rodar({ token: "t", noWidget: true, familia: "large", rede: ok });
    const tg = g.todos.join(" | ");
    for (const id of ["BTC", "ETH", "BOVA11", "IVVB11", "DOLAR"]) expect(tg).toContain(id);
    expect(tg).toContain("resultado R$ 34,50  +2,9%");
  });

  it("formatação em português: milhar com ponto, decimal com vírgula, 4 casas para preço baixo, perda com sinal de menos", async () => {
    const d = { ...dados, conta: { ...conta, patrimonio: 196.81, resultado: -3.19, retorno: -0.01595 } };
    const r = await rodar({ token: "t", noWidget: true, familia: "large", rede: { status: 200, corpo: JSON.stringify(d) } });
    const t = r.todos.join(" | ");
    expect(t).toContain("R$ 5,0119");
    expect(t).toContain("R$ 196,81");
    expect(t).toContain("resultado −R$ 3,19  −1,6%");
    expect(r.coloridos.find((x) => x.texto.startsWith("resultado"))?.cor).toBe("#ff5a67");
  });

  it("preço ausente vira travessão (nunca 0 nem NaN) e o texto nunca tem 'undefined' ou 'NaN'", async () => {
    const d = { ...dados, itens: [{ id: "NOVO", nome: "Novo", preco: null, var24h: null, fonte: "sem preço", data: null }, ...itens] };
    const r = await rodar({ token: "t", noWidget: true, familia: "large", rede: { status: 200, corpo: JSON.stringify(d) } });
    const t = r.todos.join(" | ");
    expect(t).toContain("NOVO");
    expect(t).toContain("—");
    expect(t).not.toMatch(/undefined|NaN|null/);
  });

  it("sem a conta de teste: avisa 'Saldo indisponível' (não inventa um saldo)", async () => {
    const r = await rodar({ token: "t", noWidget: true, familia: "medium", rede: { status: 200, corpo: JSON.stringify({ ...dados, conta: null }) } });
    expect(r.todos.join(" | ")).toContain("Saldo indisponível");
  });

  it("sem internet, com cache: mostra o último dado marcado como OFFLINE", async () => {
    const r = await rodar({ token: "t", noWidget: true, familia: "medium", rede: { erro: "Could not connect" }, cache: dados });
    const t = r.todos.join(" | ");
    expect(t).toContain(`OFFLINE · dado de ${hora(dados.geradoEm)}`);
    expect(t).toContain("R$ 408.885");
  });

  it("sem internet e sem cache: mensagem clara, sem quebrar", async () => {
    const r = await rodar({ token: "t", noWidget: true, rede: { erro: "Could not connect" } });
    expect(r.todos.join(" | ")).toMatch(/Sem dados ainda \(Could not connect\)/);
    expect(r.estado.completou).toBe(1);
  });

  it("resposta quebrada ou erro do servidor: cai no cache, ou avisa; nunca grava lixo no cache", async () => {
    for (const rede of [{ status: 200, corpo: "isto não é json" }, { status: 200, corpo: JSON.stringify({ erro: "x" }) }, { status: 500, corpo: "{}" }]) {
      const semCache = await rodar({ token: "t", noWidget: true, rede });
      expect(semCache.todos.join(" | ")).toContain("Sem dados ainda");
      expect(semCache.arquivos.size).toBe(0);
      const comCache = await rodar({ token: "t", noWidget: true, rede, cache: dados });
      expect(comCache.todos.join(" | ")).toContain("OFFLINE");
    }
  });

  it("dado novo bom é gravado no cache", async () => {
    const r = await rodar({ token: "t", noWidget: true, rede: ok });
    expect(JSON.parse(r.arquivos.get("/docs/traderbit_widget_cache.json") as string).itens.length).toBe(5);
  });

  it("token recusado (401): no widget mantém o token e avisa; no app apaga o token para pedir de novo", async () => {
    const w = await rodar({ token: "velho", noWidget: true, rede: { status: 401, corpo: "Não autorizado" } });
    expect(w.todos.join(" | ")).toContain("Token recusado");
    expect(w.chaveiro.get("traderbit_widget_token")).toBe("velho");
    const app = await rodar({ token: "velho", noWidget: false, rede: { status: 401, corpo: "Não autorizado" } });
    expect(app.chaveiro.has("traderbit_widget_token")).toBe(false);
    expect(app.widget?.apresentou).toBe(1);
  });

  it("sem token no widget: pede para abrir o app, sem fazer nenhuma chamada", async () => {
    const r = await rodar({ token: null, noWidget: true, rede: ok });
    expect(r.todos.join(" | ")).toContain("Abra o script no app Scriptable");
    expect(r.estado.buscou).toBe(0);
    expect(r.estado.alertas).toBe(0);
  });

  it("sem token no app: pede o token, guarda no chaveiro e mostra o widget", async () => {
    const r = await rodar({ token: null, noWidget: false, rede: ok, alerta: { escolha: 0, valor: "  token-novo  " } });
    expect(r.estado.alertas).toBe(1);
    expect(r.chaveiro.get("traderbit_widget_token")).toBe("token-novo"); // sem espaços nas pontas
    expect(r.visto.headers).toEqual({ Authorization: "Bearer token-novo" });
    expect(r.widget?.apresentou).toBe(1);
  });

  it("no app, cancelar ou deixar em branco não guarda nada e não faz chamada", async () => {
    for (const alerta of [{ escolha: 1, valor: "abc" }, { escolha: 0, valor: "   " }]) {
      const r = await rodar({ token: null, noWidget: false, rede: ok, alerta });
      expect(r.chaveiro.size).toBe(0);
      expect(r.estado.buscou).toBe(0);
      expect(r.estado.completou).toBe(1);
    }
  });

  it("o script não deixa o token escrito dentro dele", () => {
    expect(CODIGO).not.toMatch(/Bearer [A-Za-z0-9]{16,}/);
    expect(CODIGO).toContain("Keychain");
  });
});
