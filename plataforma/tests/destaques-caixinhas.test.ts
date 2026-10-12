import { describe, expect, it } from "vitest";
import { cdiAnualDe, fraseResumo, rendimento, resumir, taxaAnualCaixinha, validarCaixinha } from "@/core/caixinhas";
import { ehTickerBdr, escolherDestaques, lerListaBdr, retorno30d, type CandidatoBdr } from "@/core/destaques";
import { rodarDestaques, type DependenciasDestaques } from "@/servico/destaques-cron";
import { rodarParecer, type DependenciasParecer } from "@/servico/parecer-cron";

const serieLinear = (ini: string, n: number, v0: number, passo: number) =>
  Array.from({ length: n }, (_, i) => ({ data: new Date(Date.parse(ini + "T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10), valor: v0 + passo * i }));

describe("tickers e lista de BDRs", () => {
  it("aceita BDR da B3 e rejeita ação, ETF, fracionário e lixo", () => {
    for (const t of ["AAPL34", "MSFT34", "NVDC34", "ROXO34", "A1AP34".replace("1", "A")]) expect(ehTickerBdr(t)).toBe(true);
    for (const t of ["PETR4", "BOVA11", "AAPL34F", "aapl34", "", "AAPL3", "AAPL3434"]) expect(ehTickerBdr(t)).toBe(false);
  });
  it("lê a lista, converte % em fração, ordena por volume e ignora lixo/duplicado", () => {
    const l = lerListaBdr({ stocks: [
      { stock: "MSFT34", name: "Microsoft", close: 50, change: 2.5, volume: 100 },
      { stock: "AAPL34", name: "Apple", close: 40, change: -1, volume: 900 },
      { stock: "AAPL34", name: "Apple dup", close: 40, change: -1, volume: 800 },
      { stock: "PETR4", name: "Petro", close: 30, change: 1, volume: 5000 },
      { stock: "TSLA34", name: "Tesla", close: 0, change: 1, volume: 10 },
      { stock: "AMZO34", name: "Amazon", close: 10, change: null, volume: 50 },
      null, { stock: 5 },
    ] });
    expect(l.map((x) => x.ticker)).toEqual(["AAPL34", "MSFT34", "AMZO34"]);
    expect(l[1].varDia).toBeCloseTo(0.025, 10);
    expect(l[2].varDia).toBeNull();
  });
  it("resposta fora do formato vira lista vazia, sem quebrar", () => {
    for (const x of [null, undefined, {}, { stocks: "x" }, [], 5]) expect(lerListaBdr(x)).toEqual([]);
  });
});

describe("retorno de 30 dias", () => {
  it("usa o último pregão até 30 dias antes", () => {
    const s = serieLinear("2026-08-01", 70, 100, 1); // valor sobe 1 por dia
    const ult = s[s.length - 1];
    expect(retorno30d(s)).toBeCloseTo(ult.valor / (ult.valor - 30) - 1, 10);
  });
  it("sem histórico de 30 dias ou série curta: null", () => {
    expect(retorno30d(serieLinear("2026-10-01", 10, 100, 1))).toBeNull();
    expect(retorno30d([])).toBeNull();
  });
});

describe("escolher destaques", () => {
  const c = (t: string, v: number): CandidatoBdr => ({ ticker: t, nome: t, preco: 10, varDia: 0, volume: v });
  it("ordena por retorno, corta em 10, descarta sem retorno e numera", () => {
    const pool = Array.from({ length: 14 }, (_, i) => ({ cand: c(`AAAA${30 + (i % 5)}`.slice(0, 4) + String(34), 100 - i), ret30d: i === 3 ? null : i / 100 }));
    const r = escolherDestaques(pool);
    expect(r).toHaveLength(10);
    expect(r[0].ret30d).toBeCloseTo(0.13, 10);
    expect(r.map((x) => x.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.every((x, i) => i === 0 || r[i - 1].ret30d >= x.ret30d)).toBe(true);
    expect(r.some((x) => x.ret30d === null)).toBe(false);
  });
  it("empate no retorno: o mais negociado primeiro", () => {
    const r = escolherDestaques([{ cand: c("AAAA34", 10), ret30d: 0.1 }, { cand: c("BBBB34", 99), ret30d: 0.1 }]);
    expect(r.map((x) => x.ticker)).toEqual(["BBBB34", "AAAA34"]);
  });
});

describe("rodarDestaques (serviço)", () => {
  const lista = Array.from({ length: 12 }, (_, i): CandidatoBdr => ({ ticker: `TST${String.fromCharCode(65 + i)}34`, nome: `T${i}`, preco: 10, varDia: 0.01, volume: 1000 - i }));
  const mk = (over: Partial<DependenciasDestaques> = {}) => {
    const salvos: { dia: string; n: number }[] = [];
    const d: DependenciasDestaques = {
      listarBdrs: async () => lista,
      historico: async (t) => serieLinear("2026-08-01", 70, 100, (t.charCodeAt(3) - 64) / 10),
      salvar: async (dia, itens) => { salvos.push({ dia, n: itens.length }); },
      agora: () => new Date("2026-10-13T00:30:00Z"),
      ...over,
    };
    return { d, salvos };
  };
  it("grava os 10 melhores com a data de Brasília", async () => {
    const { d, salvos } = mk();
    const r = await rodarDestaques(d);
    expect(r).toMatchObject({ status: "ok", dia: "2026-10-12", quantos: 10 });
    expect(salvos).toEqual([{ dia: "2026-10-12", n: 10 }]);
  });
  it("um ticker sem histórico não derruba: avisa e segue", async () => {
    const { d, salvos } = mk({ historico: async (t) => { if (t === "TSTA34") throw new Error("sem dados"); return serieLinear("2026-08-01", 70, 100, 1); } });
    const r = await rodarDestaques(d);
    expect(r.status).toBe("parcial");
    expect(r.avisos[0]).toContain("TSTA34");
    expect(salvos).toHaveLength(1);
  });
  it("lista indisponível: erro claro e nada gravado", async () => {
    const { d, salvos } = mk({ listarBdrs: async () => { throw new Error("brapi: HTTP 402"); } });
    const r = await rodarDestaques(d);
    expect(r.status).toBe("erro");
    expect(r.avisos[0]).toContain("HTTP 402");
    expect(salvos).toHaveLength(0);
  });
  it("lista vazia ou poucos com histórico: não grava (não inventa destaque)", async () => {
    const a = mk({ listarBdrs: async () => [] });
    expect((await rodarDestaques(a.d)).status).toBe("erro");
    const b = mk({ historico: async () => { throw new Error("x"); } });
    expect((await rodarDestaques(b.d)).status).toBe("erro");
    expect(a.salvos.length + b.salvos.length).toBe(0);
  });
});

describe("caixinhas", () => {
  it("valida nome, % do CDI e saldo", () => {
    expect(validarCaixinha("  Viagem ", 110, 1000)).toEqual({ ok: true, valor: { nome: "Viagem", pctCdi: 110, saldo: 1000 } });
    expect(validarCaixinha("", 100, 0)).toEqual({ ok: false, erro: "nome_invalido" });
    expect(validarCaixinha("x".repeat(61), 100, 0)).toEqual({ ok: false, erro: "nome_invalido" });
    for (const p of [0, -5, 301, Number.NaN, "100"]) expect(validarCaixinha("a", p, 0)).toEqual({ ok: false, erro: "pct_invalido" });
    for (const s of [-1, Number.NaN, Infinity]) expect(validarCaixinha("a", 100, s)).toEqual({ ok: false, erro: "saldo_invalido" });
  });
  it("CDI anual a partir do índice acumulado (14,9% ao ano => volta ~14,9%)", () => {
    const diario = Math.pow(1.149, 1 / 252);
    const idx = Array.from({ length: 80 }, (_, i) => ({ data: `d${i}`, valor: 1000 * Math.pow(diario, i) }));
    expect(cdiAnualDe(idx)).toBeCloseTo(0.149, 6);
    expect(cdiAnualDe(idx.slice(0, 5))).toBeNull();
    expect(cdiAnualDe([])).toBeNull();
  });
  it("100% do CDI rende o próprio CDI ao ano; 110% rende mais; 0 de saldo rende 0", () => {
    expect(taxaAnualCaixinha(0.14, 100)).toBeCloseTo(0.14, 10);
    expect(taxaAnualCaixinha(0.14, 110)).toBeGreaterThan(0.14);
    const r = rendimento({ saldo: 1000, pctCdi: 100 }, 0.14);
    expect(r.ano).toBeCloseTo(140, 6);
    expect(r.mes).toBeGreaterThan(0);
    expect(r.mes).toBeLessThan(r.ano / 10);
    expect(rendimento({ saldo: 0, pctCdi: 100 }, 0.14).ano).toBe(0);
  });
  it("resumo: total, % médio ponderado pelo saldo, rendimento; sem CDI não inventa rendimento", () => {
    const l = [{ id: "1", nome: "A", pctCdi: 100, saldo: 3000 }, { id: "2", nome: "B", pctCdi: 120, saldo: 1000 }];
    const r = resumir(l, 0.14);
    expect(r.total).toBe(4000);
    expect(r.pctCdiMedio).toBeCloseTo(105, 10);
    expect(r.rendMes).toBeGreaterThan(0);
    const sem = resumir(l, null);
    expect(sem.rendMes).toBeNull();
    expect(fraseResumo(sem)).not.toMatch(/por mês/);
    expect(fraseResumo(r)).toMatch(/2 caixinhas somam R\$ 4\.000,00.*105% do CDI.*por mês.*antes do imposto/);
    expect(fraseResumo(resumir([], 0.14))).toBeNull();
    expect(fraseResumo(resumir([{ id: "1", nome: "Z", pctCdi: 100, saldo: 0 }], 0.14))).toBeNull();
  });
});

describe("parecer com caixinhas", () => {
  const baseDeps = (extra: Partial<DependenciasParecer>) => {
    const salvo: { texto: string[]; caixinhas?: unknown }[] = [];
    const d: DependenciasParecer = {
      lerRockefeller: async () => ({ userId: "u1", data: { reservaAtual: 5000, tx: [], plan: { reserva: 40 } } }),
      lerAtivos: async () => [], lerUltimaAnalise: async () => null,
      salvarParecer: async (_u, p) => { salvo.push(p as never); }, agora: () => new Date("2026-10-12T13:00:00Z"), ...extra,
    };
    return { d, salvo };
  };
  it("acrescenta a frase e o resumo ao parecer", async () => {
    const { d, salvo } = baseDeps({ lerCaixinhas: async () => resumir([{ id: "1", nome: "A", pctCdi: 100, saldo: 2000 }], 0.14) });
    await rodarParecer(d);
    expect(salvo[0].texto.at(-1)).toMatch(/Suas caixinha soma R\$ 2\.000,00/);
    expect(salvo[0].caixinhas).toBeDefined();
  });
  it("sem caixinhas ou com erro ao ler: o parecer sai igual ao de sempre", async () => {
    const a = baseDeps({ lerCaixinhas: async () => resumir([], null) });
    const b = baseDeps({ lerCaixinhas: async () => { throw new Error("banco fora"); } });
    const c = baseDeps({});
    for (const x of [a, b, c]) expect((await rodarParecer(x.d)).status).toBe("ok");
    expect(a.salvo[0].caixinhas).toBeUndefined();
    expect(b.salvo[0].caixinhas).toBeUndefined();
    expect(a.salvo[0].texto).toEqual(c.salvo[0].texto);
  });
});
