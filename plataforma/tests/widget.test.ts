import { describe, expect, it } from "vitest";
import type { Tick } from "@/core/ao-vivo";
import { type Movimento, cotarOrdem } from "@/core/paper";
import { montarWidget, type EntradaItem } from "@/core/widget";
import { bearerConfere } from "@/lib/seguranca";
import { type DepsWidget, gerarWidget } from "@/servico/widget-dados";

const dep = (v: number): Movimento => ({ tipo: "deposito", taxa: 0, caixaDelta: v });
const compra = (id: string, tipo: string, preco: number, valor: number): Movimento => {
  const c = cotarOrdem("compra", tipo, preco, { valor });
  return { tipo: "compra", ativoId: id, quantidade: c.quantidade, precoExec: c.precoExec, taxa: c.taxa, caixaDelta: c.caixaDelta };
};
const item = (o: Partial<EntradaItem> & { id: string }): EntradaItem => ({
  nome: o.id, tipo: "cripto", fechamento: null, fechamentoData: null, vivo: null, ...o,
});

describe("segredo do widget", () => {
  it("só o cabeçalho exato passa; sem segredo configurado, nada passa", () => {
    expect(bearerConfere("Bearer abc123", "abc123")).toBe(true);
    for (const h of [null, "", "Bearer abc124", "Bearer abc12", "abc123", "bearer abc123", "Bearer  abc123"]) expect(bearerConfere(h, "abc123")).toBe(false);
    expect(bearerConfere("Bearer ", "")).toBe(false);
    expect(bearerConfere("Bearer undefined", undefined)).toBe(false);
  });
});

describe("montarWidget", () => {
  it("preço ao vivo vence o fechamento; variação em 24 h vem da abertura; ordem: cripto, bolsa, câmbio", () => {
    const p = montarWidget({
      agora: new Date("2026-10-08T20:00:00Z"), conta: null,
      itens: [
        item({ id: "DOLAR", tipo: "cambio", fechamento: 5.01, fechamentoData: "2026-10-08" }),
        item({ id: "BOVA11", tipo: "etf", fechamento: 203, fechamentoData: "2026-10-08", vivo: { preco: 204, abertura: null, fonte: "atraso" } }),
        item({ id: "BTC", fechamento: 419_307, fechamentoData: "2026-10-07", vivo: { preco: 440_000, abertura: 400_000, fonte: "ao vivo" } }),
        item({ id: "ETH", fechamento: 15_000, fechamentoData: "2026-10-07" }),
      ],
    });
    expect(p.itens.map((i) => i.id)).toEqual(["BTC", "ETH", "BOVA11", "DOLAR"]);
    expect(p.itens[0]).toMatchObject({ preco: 440_000, fonte: "ao vivo", data: null });
    expect(p.itens[0].var24h).toBeCloseTo(0.1, 12);
    expect(p.itens[1]).toMatchObject({ preco: 15_000, fonte: "fechamento", data: "2026-10-07", var24h: null }); // sem dado vivo: cai no fechamento
    expect(p.itens[2]).toMatchObject({ preco: 204, fonte: "atraso", var24h: null });
    expect(p.itens[3]).toMatchObject({ preco: 5.01, fonte: "fechamento" });
    expect(p.geradoEm).toBe("2026-10-08T20:00:00.000Z");
  });

  it("ativo sem nenhum preço aparece como 'sem preço', nunca como zero", () => {
    const p = montarWidget({ agora: new Date(), conta: null, itens: [item({ id: "NOVO" })] });
    expect(p.itens[0]).toMatchObject({ preco: null, fonte: "sem preço" });
  });

  it("patrimônio com preço ao vivo: conta feita à mão (caixa + posição a mercado)", () => {
    const mov = [dep(200), compra("BTC", "cripto", 100_000, 100)];
    const qtd = mov[1].quantidade as number;
    const p = montarWidget({
      agora: new Date(), conta: { nome: "Rockfeller", movimentos: mov },
      itens: [item({ id: "BTC", fechamento: 100_000, vivo: { preco: 120_000, abertura: 100_000, fonte: "ao vivo" } })],
    });
    const esperado = 200 + mov[1].caixaDelta + qtd * 120_000;
    expect(p.conta?.patrimonio).toBeCloseTo(esperado, 2);
    expect(p.conta?.aportado).toBe(200);
    expect(p.conta?.resultado).toBeCloseTo(esperado - 200, 2);
    expect(p.conta?.retorno).toBeCloseTo(esperado / 200 - 1, 3);
    expect(p.conta?.caixa).toBeCloseTo(200 + mov[1].caixaDelta, 2);
  });

  it("posição sem preço é avisada (e entra pelo custo, não some do patrimônio)", () => {
    const mov = [dep(200), compra("BTC", "cripto", 100_000, 100)];
    const p = montarWidget({ agora: new Date(), conta: { nome: "c", movimentos: mov }, itens: [] });
    expect(p.conta?.semPreco).toEqual(["BTC"]);
    expect(p.conta?.patrimonio).toBeCloseTo(200, 1);
  });

  it("conta vazia: patrimônio 0 e retorno nulo (sem divisão por zero)", () => {
    const p = montarWidget({ agora: new Date(), conta: { nome: "c", movimentos: [] }, itens: [] });
    expect(p.conta).toMatchObject({ patrimonio: 0, aportado: 0, retorno: null });
  });
});

describe("gerarWidget (serviço com fontes simuladas)", () => {
  const ativos = [
    { id: "BTC", nome: "Bitcoin", tipo: "cripto", referencia: "BTC/BRL", user_id: "u1" },
    { id: "BOVA11", nome: "Ibovespa", tipo: "etf", referencia: "BOVA11", user_id: "u1" },
    { id: "DOLAR", nome: "Dólar", tipo: "cambio", referencia: "1", user_id: "u1" },
    { id: "CDI", nome: "CDI", tipo: "renda_fixa", referencia: "12", user_id: "u1" },
  ];
  const base = (o: Partial<DepsWidget> = {}, chamadas: string[] = []): DepsWidget => ({
    ativos: async () => ativos,
    fechamentos: async () => ({ BTC: { data: "2026-10-07", valor: 419_307 }, BOVA11: { data: "2026-10-08", valor: 203 }, DOLAR: { data: "2026-10-08", valor: 5.01 } }),
    contaEspelho: async () => ({ id: "c1", nome: "Rockfeller" }),
    movimentos: async () => [dep(200)],
    ticks24h: async (s): Promise<Tick[]> => { chamadas.push(`binance:${s.join(",")}`); return [{ simbolo: "BTCBRL", preco: 410_000, abertura: 400_000, maxima: null, minima: null }]; },
    cotacaoBolsa: async (t) => { chamadas.push(`brapi:${t}`); return { preco: 204.5 }; },
    agora: () => new Date("2026-10-08T20:00:00Z"),
    ...o,
  });

  it("caminho feliz: cripto ao vivo, bolsa com atraso, dólar no fechamento, sem o CDI", async () => {
    const chamadas: string[] = [];
    const p = await gerarWidget(base({}, chamadas));
    expect(p.itens.map((i) => `${i.id}:${i.fonte}`)).toEqual(["BTC:ao vivo", "BOVA11:atraso", "DOLAR:fechamento"]);
    expect(p.conta?.patrimonio).toBe(200);
    expect(chamadas).toEqual(["binance:BTCBRL", "brapi:BOVA11"]); // um par de cripto, um ticker de bolsa, e nada para dólar ou CDI
  });

  it("Binance fora do ar: cripto cai no fechamento, o resto segue", async () => {
    const p = await gerarWidget(base({ ticks24h: async () => { throw new Error("HTTP 451"); } }));
    expect(p.itens.find((i) => i.id === "BTC")).toMatchObject({ fonte: "fechamento", preco: 419_307 });
    expect(p.itens.find((i) => i.id === "BOVA11")?.fonte).toBe("atraso");
  });

  it("brapi fora do ar: bolsa cai no fechamento, o resto segue", async () => {
    const p = await gerarWidget(base({ cotacaoBolsa: async () => { throw new Error("HTTP 429"); } }));
    expect(p.itens.find((i) => i.id === "BOVA11")).toMatchObject({ fonte: "fechamento", preco: 203 });
    expect(p.itens.find((i) => i.id === "BTC")?.fonte).toBe("ao vivo");
  });

  it("sem fechamentos e sem fontes vivas: tudo 'sem preço', e ainda responde", async () => {
    const p = await gerarWidget(base({
      fechamentos: async () => { throw new Error("banco"); },
      ticks24h: async () => { throw new Error("x"); },
      cotacaoBolsa: async () => { throw new Error("y"); },
    }));
    expect(p.itens.every((i) => i.fonte === "sem preço" && i.preco === null)).toBe(true);
  });

  it("falha ao ler os movimentos: NÃO mostra saldo (melhor nada do que um patrimônio zerado falso)", async () => {
    const p = await gerarWidget(base({ movimentos: async () => { throw new Error("banco"); } }));
    expect(p.conta).toBeNull();
    expect(p.itens.length).toBe(3);
  });

  it("sem conta de teste: só o mercado; sem ativos: lista vazia", async () => {
    expect((await gerarWidget(base({ contaEspelho: async () => null }))).conta).toBeNull();
    const vazio = await gerarWidget(base({ ativos: async () => [] }));
    expect(vazio.itens).toEqual([]);
    expect(vazio.conta).toBeNull();
  });

  it("falha ao listar os ativos é erro (a rota responde 500), não um widget vazio enganoso", async () => {
    await expect(gerarWidget(base({ ativos: async () => { throw new Error("banco"); } }))).rejects.toThrow("banco");
  });
});
