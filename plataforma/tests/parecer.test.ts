import { describe, expect, it } from "vitest";
import { aporteMensalDe, CITACOES, cenariosDe, gastoMensalDe, gerarParecer, type EntradaParecer } from "@/core/parecer";
import { hojeBrasilia, rodarParecer, type DependenciasParecer } from "@/servico/parecer-cron";

const stats = (p: number, b: number, f: number) => ({ cagr: b, piorQueda: -0.3, pior12m: p, mediana12m: b, melhor12m: f });
const base: EntradaParecer = {
  reserva: 0, gastoMensal: 1000, aporteMensal: 300, metaMeses: 3, agora: new Date("2026-10-12T13:00:00Z"),
  ativos: [
    { id: "CDI", nome: "CDI", tipo: "renda_fixa" }, { id: "IVVB11", nome: "S&P", tipo: "etf" },
    { id: "BOVA11", nome: "Ibov", tipo: "etf" }, { id: "BTC", nome: "Bitcoin", tipo: "cripto" },
  ],
  stats: { CDI: stats(0.08, 0.11, 0.14), IVVB11: stats(-0.2, 0.15, 0.5), BOVA11: stats(-0.25, 0.08, 0.4), BTC: stats(-0.7, 0.4, 2) },
};

describe("parecer", () => {
  it("sem reserva: não sugere ativos e traz citação", () => {
    const p = gerarParecer(base);
    expect(p.estado).toBe("sem_reserva");
    expect(p.blocos).toEqual([]);
    expect(p.citacao?.texto).toBeTruthy();
    expect(p.meta).toBe(3000);
  });
  it("reserva abaixo da meta: investe o saldo inteiro e avisa o risco", () => {
    const p = gerarParecer({ ...base, reserva: 1200 });
    expect(p.estado).toBe("pode_investir");
    expect(p.investivel).toBe(1200);
    expect(p.falta).toBe(0);
    expect(p.blocos.reduce((a, b) => a + b.investir, 0)).toBeCloseTo(1200, 2);
    expect(p.texto.join(" ")).toContain("abaixo da meta");
  });
  it("saldo pequeno (<R$50) não vira carteira", () => {
    const p = gerarParecer({ ...base, reserva: 30 });
    expect(p.estado).toBe("no_limite");
    expect(p.blocos).toEqual([]);
  });
  it("pode investir: divide o saldo todo, pesos moderados e soma fecha", () => {
    const p = gerarParecer({ ...base, reserva: 10000 });
    expect(p.estado).toBe("pode_investir");
    expect(p.investivel).toBe(10000);
    const por = Object.fromEntries(p.blocos.map((b) => [b.categoria, b.investir]));
    expect(por).toMatchObject({ renda_fixa: 5500, exterior: 2000, brasil: 2000, cripto: 500 }); // dólar sem ativo -> vai p/ renda fixa
    expect(p.blocos.reduce((a, b) => a + b.investir, 0)).toBeCloseTo(10000, 2);
    expect(p.carteira!.adverso.valor).toBeLessThan(p.carteira!.base.valor);
    expect(p.carteira!.base.valor).toBeLessThan(p.carteira!.favoravel.valor);
    expect(p.citacao).toBeNull();
  });
  it("divide igualmente entre ativos da mesma categoria", () => {
    const p = gerarParecer({ ...base, reserva: 10000, ativos: [...base.ativos, { id: "AAPL34", nome: "Apple", tipo: "bdr" }], stats: { ...base.stats, AAPL34: stats(-0.3, 0.1, 0.4) } });
    const ext = p.blocos.find((b) => b.categoria === "exterior")!;
    expect(ext.ativos.map((a) => a.investir)).toEqual([1000, 1000]);
  });
  it("ativo sem dados fica de fora (exceto renda fixa)", () => {
    const p = gerarParecer({ ...base, reserva: 10000, stats: { CDI: base.stats.CDI } });
    expect(p.blocos.map((b) => b.categoria)).toEqual(["renda_fixa"]);
    expect(p.blocos[0].investir).toBe(10000);
  });
  it("cenários ficam ordenados mesmo com dados estranhos", () => {
    const c = cenariosDe({ cagr: 0.1, piorQueda: -0.4, pior12m: 0.2, mediana12m: 0.1, melhor12m: 0.05 });
    expect(c.adverso).toBeLessThanOrEqual(c.base);
    expect(c.base).toBeLessThanOrEqual(c.favoravel);
    expect(cenariosDe({ cagr: 0.1, piorQueda: -0.4, pior12m: null, mediana12m: null, melhor12m: null }).adverso).toBe(-0.4);
  });
  it("citações: todas têm fonte; rotação é determinística", () => {
    for (const c of CITACOES) { expect(c.fonte.length).toBeGreaterThan(5); expect(["documentada", "atribuída", "ficção"]).toContain(c.tipo); }
    expect(gerarParecer(base).citacao).toEqual(gerarParecer(base).citacao);
  });
});

describe("gasto e aporte", () => {
  const tx = [
    { type: "out", amount: 500, date: "2026-08-10" }, { type: "out", amount: 700, date: "2026-09-10" },
    { type: "out", amount: 9999, date: "2026-12-10" }, { type: "in", amount: 3000, date: "2026-10-05" }, { type: "out", amount: 1000, date: "2026-10-06" },
  ];
  it("média dos meses até o atual (ignora futuro)", () => {
    expect(gastoMensalDe(tx, "2026-10-12")).toBeCloseTo((500 + 700 + 1000) / 3, 5);
  });
  it("aporte = sobra do mês × % da reserva", () => expect(aporteMensalDe(tx, "2026-10-12", 40)).toBe(800));
  it("hoje em Brasília", () => expect(hojeBrasilia(new Date("2026-10-13T01:00:00Z"))).toBe("2026-10-12"));
});

describe("rodarParecer", () => {
  const mk = (rk: unknown): { d: DependenciasParecer; salvo: unknown[] } => {
    const salvo: unknown[] = [];
    return { salvo, d: {
      lerRockefeller: async () => (rk ? { userId: "u1", data: rk } : null),
      lerAtivos: async () => base.ativos, lerUltimaAnalise: async () => ({ stats: base.stats, periodoFim: "2026-10-11" }),
      salvarParecer: async (u, p) => { salvo.push([u, p]); }, agora: () => base.agora } };
  };
  it("grava parecer", async () => {
    const { d, salvo } = mk({ reservaAtual: 5000, tx: [{ type: "out", amount: 1000, date: "2026-10-01" }], plan: { reserva: 40 } });
    expect(await rodarParecer(d)).toEqual({ status: "ok", estado: "pode_investir" });
    expect(salvo).toHaveLength(1);
  });
  it("sem dados do Rockefeller não grava", async () => {
    const { d, salvo } = mk(null);
    expect((await rodarParecer(d)).status).toBe("sem_dados");
    expect(salvo).toHaveLength(0);
  });
  it("dados malformados viram sem reserva, sem quebrar", async () => {
    const { d } = mk({ reservaAtual: "x", tx: "y" });
    expect((await rodarParecer(d)).estado).toBe("sem_reserva");
  });
});
