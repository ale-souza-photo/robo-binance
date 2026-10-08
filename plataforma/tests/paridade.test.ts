import { describe, expect, it } from "vitest";
import fixture from "./fixtures/paridade.json";
import { alinhar, type Serie } from "@/core/series";
import { correlacoes, estatisticas } from "@/core/estatisticas";
import { simularDca } from "@/core/carteira";
import { leituraRapida } from "@/core/leitura";
import { executarAnalise } from "@/core/analise";

/** O TypeScript tem que dar o MESMO resultado do Python validado (analise_ativos.py). */
const series: Record<string, Serie> = Object.fromEntries(
  Object.entries(fixture.series as unknown as Record<string, [string, number][]>).map(([n, pts]) => [n, pts.map(([data, valor]) => ({ data, valor }))]),
);
const esp = fixture.esperado;

const perto = (a: number | null, b: number | null, rel = 1e-9) => {
  if (a === null || b === null) return expect(a).toBe(b);
  expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(a), Math.abs(b)));
};

describe("paridade com o Python", () => {
  const { datas, valores } = alinhar(series);

  it("alinha calendários diferentes (bolsa sem fim de semana) do mesmo jeito", () => {
    expect(datas.length).toBe(esp.datas_total);
    expect(datas[0]).toBe(esp.primeira);
    expect(datas[datas.length - 1]).toBe(esp.ultima);
    for (const [nome, idx] of Object.entries(esp.amostra_valores as Record<string, Record<string, number>>)) {
      for (const [i, v] of Object.entries(idx)) perto(valores[nome][Number(i)], v);
    }
  });

  it("estatísticas de cada ativo", () => {
    for (const [nome, v] of Object.entries(valores)) {
      const s = estatisticas(datas, v);
      const e = (esp.stats as Record<string, any>)[nome];
      perto(s.retornoTotal, e.retorno_total);
      perto(s.cagr, e.cagr);
      perto(s.vol, e.vol);
      perto(s.piorQueda, e.pior_queda);
      perto(s.calmar, e.calmar);
      perto(s.anos, e.anos);
      perto(s.pos12m, e.pos_12m);
      perto(s.pior12m, e.pior_12m);
      perto(s.melhor12m, e.melhor_12m);
      perto(s.mediana12m, e.mediana_12m);
      expect(Object.keys(s.porAno).sort()).toEqual(Object.keys(e.por_ano).sort());
      for (const [ano, r] of Object.entries(e.por_ano as Record<string, number>)) perto(s.porAno[Number(ano)], r);
    }
  });

  it("correlação semanal (CDI fica de fora)", () => {
    const c = correlacoes(valores);
    expect(c.nomes).toEqual(esp.corr.nomes);
    expect(c.nomes).not.toContain("CDI");
    for (const a of c.nomes) for (const b of c.nomes) perto(c.matriz[a][b], (esp.corr.matriz as any)[a][b], 1e-8);
  });

  it("simulação de DCA: aportado, valor final, TIR, queda no papel e a curva inteira", () => {
    for (const [nome, pesos] of Object.entries(esp.carteiras_def as Record<string, Record<string, number>>)) {
      const r = simularDca(datas, valores, pesos, 100, 50, 5);
      const e = (esp.carteiras as Record<string, any>)[nome];
      perto(r.aportado, e.aportado);
      perto(r.valorFinal, e.valor_final);
      perto(r.ganho, e.ganho);
      perto(r.tir, e.tir, 1e-7);
      perto(r.piorQuedaNoPapel, e.pior_queda_no_papel);
      perto(r.pctNoPrejuizo, e.pct_no_prejuizo);
      expect(r.valor.length).toBe(e.valor.length);
      r.valor.forEach((x, i) => perto(x, e.valor[i]));
      r.aportes.forEach((x, i) => perto(x, e.aportes[i]));
    }
  });

  it("a leitura rápida sai com as mesmas frases", () => {
    const stats = Object.fromEntries(Object.entries(valores).map(([n, v]) => [n, estatisticas(datas, v)]));
    const c = correlacoes(valores);
    const cart = Object.fromEntries(
      Object.entries(esp.carteiras_def as Record<string, Record<string, number>>).map(([n, p]) => [n, simularDca(datas, valores, p, 100, 50, 5)]),
    );
    expect(leituraRapida(stats, c.nomes, c.matriz, cart)).toEqual(esp.frases);
  });

  it("executarAnalise junta tudo e devolve dados leves para o banco", () => {
    const r = executarAnalise({
      series,
      inicial: 100,
      mensal: 50,
      dia: 5,
      carteiras: { ...(esp.carteiras_def as Record<string, Record<string, number>>), "Sem dado": { XYZ: 1 } },
    });
    expect(r.periodo.inicio).toBe(esp.primeira);
    expect(r.carteirasIgnoradas).toEqual([{ nome: "Sem dado", faltam: ["XYZ"] }]);
    expect(Object.keys(r.carteiras)).toEqual(Object.keys(esp.carteiras_def));
    expect(r.datas.length).toBe(r.crescimento["BTC"].length);
    expect(r.crescimento["BTC"][0]).toBe(100);
    expect(r.frases).toEqual(esp.frases);
    expect(JSON.stringify(r).length).toBeLessThan(120_000); // cabe folgado numa linha do banco
  });
});
