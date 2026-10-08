import { describe, expect, it } from "vitest";
import {
  ErroOrdem, aplicar, avaliar, cotarOrdem, custosDoTipo, dividirAporte, negociavel, periodoDca, validarOrdem,
  type Movimento,
} from "@/core/paper";

const dep = (v: number): Movimento => ({ tipo: "deposito", taxa: 0, caixaDelta: v });
const comprar = (id: string, tipo: string, preco: number, valor: number): Movimento => {
  const c = cotarOrdem("compra", tipo, preco, { valor });
  return { tipo: "compra", ativoId: id, quantidade: c.quantidade, precoExec: c.precoExec, taxa: c.taxa, caixaDelta: c.caixaDelta };
};

describe("custos e cotação", () => {
  it("só negocia cripto, BDR, ação e ETF (dólar e CDI são índices)", () => {
    expect(["cripto", "bdr", "acao", "etf"].every(negociavel)).toBe(true);
    expect(negociavel("cambio")).toBe(false);
    expect(negociavel("renda_fixa")).toBe(false);
    expect(() => cotarOrdem("compra", "cambio", 5, { valor: 100 })).toThrow(ErroOrdem);
  });

  it("compra cripto: slippage contra você, taxa de 0,1% e fração com 8 casas", () => {
    const c = cotarOrdem("compra", "cripto", 100_000, { valor: 100 });
    expect(c.precoExec).toBeCloseTo(100_050, 6); // +0,05%
    expect(c.caixaDelta).toBeCloseTo(-100, 3); // gasta o valor todo (taxa inclusa)
    expect(c.taxa).toBeCloseTo(0.0999, 2);
    expect(c.quantidade).toBeGreaterThan(0);
    expect(c.quantidade * c.precoExec + c.taxa).toBeLessThanOrEqual(100 + 1e-6);
    expect(Number(c.quantidade.toFixed(8))).toBe(c.quantidade);
  });

  it("compra na bolsa: só unidades inteiras e a sobra volta ao caixa", () => {
    const c = cotarOrdem("compra", "bdr", 50, { valor: 120 });
    expect(c.quantidade).toBe(2); // 120 / 50,025 = 2,39 -> 2
    expect(-c.caixaDelta).toBeLessThan(120);
    expect(-c.caixaDelta).toBeCloseTo(2 * 50.025 * 1.0003, 3);
  });

  it("recusa valor que não compra nem 1 unidade, e valor/quantidade inválidos", () => {
    expect(() => cotarOrdem("compra", "etf", 130, { valor: 100 })).toThrow(/1 unidade/);
    expect(() => cotarOrdem("compra", "etf", 130, { valor: 0 })).toThrow(ErroOrdem);
    expect(() => cotarOrdem("venda", "etf", 130, { quantidade: 0 })).toThrow(ErroOrdem);
    expect(() => cotarOrdem("compra", "etf", 0, { valor: 100 })).toThrow(/preço válido/);
    expect(() => cotarOrdem("compra", "etf", Number.NaN, { valor: 100 })).toThrow(ErroOrdem);
  });

  it("venda: slippage e taxa reduzem o que entra no caixa", () => {
    const c = cotarOrdem("venda", "cripto", 100_000, { quantidade: 0.001 });
    expect(c.precoExec).toBeCloseTo(99_950, 6);
    expect(c.caixaDelta).toBeCloseTo(0.001 * 99_950 * (1 - 0.001), 4);
    expect(c.caixaDelta).toBeLessThan(0.001 * 100_000);
  });

  it("custos por tipo", () => {
    expect(custosDoTipo("cripto").taxa).toBe(0.001);
    expect(custosDoTipo("etf").taxa).toBe(0.0003);
  });
});

describe("livro, posições e avaliação", () => {
  it("caixa = soma dos movimentos; aportado = só depósitos", () => {
    const movs = [dep(1000), comprar("BTC", "cripto", 100_000, 400)];
    const e = aplicar(movs);
    expect(e.aportado).toBe(1000);
    // a quantidade é truncada em 8 casas: a "poeira" (< 1 satoshi ≈ R$ 0,001) fica no caixa, nunca some
    expect(e.caixa).toBeGreaterThanOrEqual(600);
    expect(e.caixa).toBeLessThan(600.002);
    expect(e.posicoes.BTC.quantidade).toBeGreaterThan(0);
    expect(e.posicoes.BTC.custoTotal).toBeCloseTo(400, 2); // custo inclui a taxa
    expect(e.caixa + e.posicoes.BTC.custoTotal).toBeCloseTo(1000, 6); // nada se perde nem se cria
  });

  it("custo médio ponderado e venda parcial reduz o custo na proporção", () => {
    const movs = [dep(10_000), comprar("X", "etf", 100, 1000), comprar("X", "etf", 200, 2000)];
    let e = aplicar(movs);
    const q = e.posicoes.X.quantidade;
    expect(q).toBe(9 + 9); // 1000/100,05≈9 ; 2000/200,1≈9
    const custo = e.posicoes.X.custoTotal;
    const v = cotarOrdem("venda", "etf", 150, { quantidade: 9 });
    e = aplicar([...movs, { tipo: "venda", ativoId: "X", quantidade: 9, precoExec: v.precoExec, taxa: v.taxa, caixaDelta: v.caixaDelta }]);
    expect(e.posicoes.X.quantidade).toBe(9);
    expect(e.posicoes.X.custoTotal).toBeCloseTo(custo / 2, 6);
  });

  it("vender tudo zera a posição", () => {
    const movs = [dep(5000), comprar("X", "etf", 100, 1000)];
    const q = aplicar(movs).posicoes.X.quantidade;
    const v = cotarOrdem("venda", "etf", 100, { quantidade: q });
    const e = aplicar([...movs, { tipo: "venda", ativoId: "X", quantidade: q, precoExec: v.precoExec, taxa: v.taxa, caixaDelta: v.caixaDelta }]);
    expect(e.posicoes.X.quantidade).toBe(0);
    expect(e.posicoes.X.custoTotal).toBe(0);
  });

  it("ida e volta no mesmo preço custa taxas + slippage (nunca dá lucro de graça)", () => {
    const movs = [dep(10_000), comprar("BTC", "cripto", 100_000, 5000)];
    const q = aplicar(movs).posicoes.BTC.quantidade;
    const v = cotarOrdem("venda", "cripto", 100_000, { quantidade: q });
    const e = aplicar([...movs, { tipo: "venda", ativoId: "BTC", quantidade: q, precoExec: v.precoExec, taxa: v.taxa, caixaDelta: v.caixaDelta }]);
    const perda = 10_000 - e.caixa;
    expect(perda).toBeGreaterThan(0);
    expect(perda / 5000).toBeGreaterThan(0.002); // ≈ 0,1% + 0,1% + 0,05% + 0,05%
    expect(perda / 5000).toBeLessThan(0.004);
  });

  it("avaliar marca a mercado, calcula resultado e lista ativos sem preço", () => {
    const e = aplicar([dep(1000), comprar("X", "etf", 100, 500), comprar("Y", "etf", 50, 300)]);
    const a = avaliar(e, { X: 110 });
    expect(a.semPreco).toEqual(["Y"]);
    const px = a.posicoes.find((p) => p.ativoId === "X")!;
    expect(px.valor).toBeCloseTo(px.quantidade * 110, 6);
    expect(px.resultado).toBeCloseTo((px.valor as number) - px.custoTotal, 6);
    expect(a.patrimonio).toBeCloseTo(a.caixa + a.valorPosicoes, 6);
    expect(a.resultado).toBeCloseTo(a.patrimonio - 1000, 6);
    // sem preço, Y entra pelo custo (não some do patrimônio)
    expect(a.posicoes.find((p) => p.ativoId === "Y")!.valor).toBeNull();
  });

  it("conta sem aporte não divide por zero", () => {
    const a = avaliar(aplicar([]), {});
    expect(a.retorno).toBeNull();
    expect(a.patrimonio).toBe(0);
  });
});

describe("travas", () => {
  const base = () => {
    const e = aplicar([dep(1000)]);
    return { e, a: avaliar(e, {}) };
  };

  it("bloqueia compra acima do caixa", () => {
    const { e, a } = base();
    const c = cotarOrdem("compra", "etf", 100, { valor: 1500 });
    expect(validarOrdem("compra", "X", c, e, a, 0.2)).toMatch(/Saldo insuficiente/);
  });

  it("bloqueia venda a descoberto", () => {
    const { e, a } = base();
    const c = cotarOrdem("venda", "etf", 100, { quantidade: 1 });
    expect(validarOrdem("venda", "X", c, e, a, 0.2)).toMatch(/só tem 0/);
  });

  it("trava de perda: com patrimônio 20% abaixo do aportado, compras são bloqueadas (vendas, não)", () => {
    const movs = [dep(1000), comprar("X", "etf", 100, 1000)];
    const e = aplicar(movs);
    const a = avaliar(e, { X: 70 }); // queda de ~30%
    expect(a.patrimonio).toBeLessThan(800);
    const cc = { quantidade: 1, precoExec: 70, taxa: 0, caixaDelta: -1 };
    expect(validarOrdem("compra", "X", cc, { ...e, caixa: 100 }, a, 0.2)).toMatch(/Trava de perda/);
    const venda = cotarOrdem("venda", "etf", 70, { quantidade: 1 });
    expect(validarOrdem("venda", "X", venda, e, a, 0.2)).toBeNull();
  });

  it("sem perda, a compra dentro do caixa passa", () => {
    const { e, a } = base();
    const c = cotarOrdem("compra", "etf", 100, { valor: 500 });
    expect(validarOrdem("compra", "X", c, e, a, 0.2)).toBeNull();
  });
});

describe("DCA simulado", () => {
  it("divide o aporte pelos pesos e o total fecha ao centavo", () => {
    const p = dividirAporte(100, { A: 1, B: 1, C: 1 });
    expect(Object.values(p).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
    expect(Math.max(...Object.values(p))).toBeCloseTo(33.34, 9);
    const q = dividirAporte(50, { BTC: 0.7, ETH: 0.3 });
    expect(q.BTC).toBeCloseTo(35, 9);
    expect(q.ETH).toBeCloseTo(15, 9);
    expect(() => dividirAporte(50, {})).toThrow(ErroOrdem);
  });

  it("o período do mês usa o fuso de Brasília (virada do mês às 21h do dia 30/31)", () => {
    expect(periodoDca(new Date("2026-10-08T14:00:00Z"))).toBe("2026-10");
    expect(periodoDca(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10"); // ainda 31/10 em Brasília
    expect(periodoDca(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
  });
});
