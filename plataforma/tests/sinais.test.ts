import { describe, expect, it } from "vitest";
import { MIN_DIAS_TESTE, T_MINIMO, avaliarRegra, metricas, momento, selar, simular, type Momento, type Par } from "@/core/backtest-regras";
import { REGRAS, rsi, sma, type Sinal } from "@/core/sinais";
import { somaDias } from "@/core/datas";

const datasDe = (n: number, ini = "2020-01-01") => Array.from({ length: n }, (_, i) => somaDias(ini, i));
const regra = (id: string) => REGRAS.find((r) => r.id === id)!;
/** Gerador pseudo-aleatório determinístico (sem Math.random: o teste tem de dar sempre o mesmo resultado). */
const aleatorio = (semente: number) => () => ((semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe("indicadores", () => {
  it("média móvel simples", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(sma([1, 2], 3)).toEqual([null, null]);
  });

  it("RSI de Wilder bate com a referência calculada à parte (Python) e com o exemplo clássico (70,53)", () => {
    const p = [44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931, 46.0328, 45.614, 46.282, 46.282, 46.0328, 46.0328, 46.4106, 46.2222, 45.6439, 46.2122, 46.2521, 45.7138, 46.4508, 46.2819, 46.0852];
    const esperado = [70.532789, 66.747076, 66.747076, 69.614587, 66.533396, 58.041342, 63.034535, 63.364177, 56.096162, 62.447168, 60.29456, 57.795891];
    const r = rsi(p, 14);
    expect(r.slice(0, 14).every((x) => x === null)).toBe(true);
    r.slice(14).forEach((x, i) => expect(x as number).toBeCloseTo(esperado[i], 5));
  });

  it("RSI nos extremos: só sobe = 100, só cai = 0, parado = 50, série curta = tudo null", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i)).at(-1)).toBe(100);
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 - i)).at(-1)).toBe(0);
    expect(rsi(new Array(30).fill(100)).at(-1)).toBe(50);
    expect(rsi([1, 2, 3], 14).every((x) => x === null)).toBe(true);
  });
});

describe("regras", () => {
  it("só opinam depois do aquecimento", () => {
    const v = Array.from({ length: 260 }, (_, i) => 100 + i);
    const p = regra("sma200").posicoes(v);
    expect(p.slice(0, 199).every((x) => x === null)).toBe(true);
    expect(p.slice(199).every((x) => x === 1)).toBe(true); // tendência de alta: sempre dentro
    expect(regra("mom90").posicoes(v).findIndex((x) => x !== null)).toBe(90);
    expect(regra("cruz50_200").posicoes(v).findIndex((x) => x !== null)).toBe(199);
  });

  it("RSI de reversão compra na queda forte e só vende quando recupera (histerese)", () => {
    // sobe, despenca (RSI < 30 -> compra), rebota devagar (RSI entre 30 e 50 -> mantém) e depois dispara (RSI > 50 -> vende)
    const v = [...Array.from({ length: 20 }, (_, i) => 100 + i), ...Array.from({ length: 15 }, (_, i) => 119 - i * 3), ...Array.from({ length: 10 }, (_, i) => 77 + i * 0.5), ...Array.from({ length: 15 }, (_, i) => 82 + i * 3)];
    const p = regra("rsi_reversao").posicoes(v);
    const dentro = p.map((x, i) => (x === 1 ? i : -1)).filter((i) => i >= 0);
    expect(dentro.length).toBeGreaterThan(0);
    const entrada = dentro[0];
    expect(rsi(v)[entrada] as number).toBeLessThan(30);
    // no meio do caminho (RSI entre 30 e 50) continua comprado
    const meio = p.findIndex((x, i) => i > entrada && (rsi(v)[i] as number) > 30 && (rsi(v)[i] as number) < 50);
    if (meio >= 0) expect(p[meio]).toBe(1);
    // ao passar de 50, sai
    const saida = p.findIndex((x, i) => i > entrada && x === 0);
    expect(saida).toBeGreaterThan(entrada);
    expect(rsi(v)[saida] as number).toBeGreaterThan(50);
  });

  it("a leitura de hoje traz números e nunca 'undefined' ou 'NaN'", () => {
    const v = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 9) * 10 + i * 0.1);
    for (const r of REGRAS) {
      const t = r.leitura(v);
      expect(t).not.toMatch(/undefined|NaN/);
      expect(t.length).toBeGreaterThan(10);
    }
    expect(regra("sma200").leitura([1, 2, 3])).toBe("Histórico curto demais.");
  });

  it("a leitura escreve a direção por extenso e nunca um '+' ou '−' solto no número", () => {
    const sobe = Array.from({ length: 300 }, (_, i) => 100 + i);
    const cai = Array.from({ length: 300 }, (_, i) => 500 - i);
    expect(regra("sma200").leitura(sobe)).toMatch(/^Preço \d+,\d% acima da média de 200 dias\.$/);
    expect(regra("sma200").leitura(cai)).toMatch(/^Preço \d+,\d% abaixo da média de 200 dias\.$/);
    expect(regra("cruz50_200").leitura(cai)).toMatch(/^Média de 50 dias \d+,\d% abaixo da de 200\.$/);
    expect(regra("mom90").leitura(sobe)).toMatch(/^Alta de \d+,\d% em 90 dias\.$/);
    expect(regra("mom90").leitura(cai)).toMatch(/^Queda de \d+,\d% em 90 dias\.$/);
  });
});

describe("simulação (sem olhar o futuro)", () => {
  it("a decisão do dia t só ganha o retorno de t+1: o salto de t0->t1 NÃO é capturado", () => {
    const v = [100, 110, 121, 100];
    const pos: Sinal[] = [0, 1, 0, 0];
    const s = simular(v, pos, 0);
    expect(s.retRegra[0]).toBeCloseTo(0, 12); // t0 está fora: não ganha o +10% de t0->t1
    expect(s.retRegra[1]).toBeCloseTo(0.1, 12); // t1 está dentro: ganha t1->t2
    expect(s.retRegra[2]).toBeCloseTo(0, 12); // t2 fora: escapa da queda de t2->t3
    const eq = s.retRegra.reduce((a, r) => a * (1 + r), 1);
    expect(eq).toBeCloseTo(1.1, 12); // com olhar o futuro daria 1,21
    expect(s.trades).toBe(2);
  });

  it("taxa e slippage entram a cada mudança de posição (conta feita à mão)", () => {
    const v = [100, 110, 121, 100];
    const c = 0.01;
    const s = simular(v, [0, 1, 0, 0], c);
    // t1: entra (muda) -> (1+0,10)*(0,99); t2: sai (muda) -> (1+0)*(0,99)
    expect(s.retRegra[1]).toBeCloseTo(1.1 * 0.99 - 1, 12);
    expect(s.retRegra[2]).toBeCloseTo(0.99 - 1, 12);
    // comprar e manter paga a compra uma vez, no primeiro dia
    expect(s.retBase[0]).toBeCloseTo(1.1 * 0.99 - 1, 12);
    expect(s.retBase[1]).toBeCloseTo(0.1, 12);
  });

  it("entrar e sair todo dia num ativo parado só perde custo (nunca ganha de graça)", () => {
    const v = new Array(41).fill(100);
    const pos: Sinal[] = Array.from({ length: 41 }, (_, i) => (i % 2 === 0 ? 1 : 0));
    const c = 0.001;
    const s = simular(v, pos, c);
    const eq = s.retRegra.reduce((a, r) => a * (1 + r), 1);
    expect(eq).toBeCloseTo((1 - c) ** s.trades, 10);
    expect(eq).toBeLessThan(1);
  });

  it("queda contínua: a regra fica fora o tempo todo (retorno 0, queda 0), e comprar e manter perde", () => {
    const v = Array.from({ length: 400 }, (_, i) => 1000 - i);
    const pos = regra("sma200").posicoes(v);
    const s = simular(v, pos, 0.0015);
    expect(s.trades).toBe(0);
    expect(s.retRegra.every((r) => r === 0)).toBe(true);
    expect(metricas(s.retBase, 200).retorno).toBeLessThan(0);
  });

  it("alta contínua: a regra fica dentro o tempo todo e fica IDÊNTICA a comprar e manter", () => {
    const v = Array.from({ length: 400 }, (_, i) => 100 + i);
    const s = simular(v, regra("sma200").posicoes(v), 0.0015);
    expect(s.retRegra).toEqual(s.retBase);
  });

  it("sem nenhum dia com opinião, devolve vazio (não quebra)", () => {
    const s = simular([1, 2, 3], [null, null, null], 0.001);
    expect(s.retRegra).toEqual([]);
    expect(s.trades).toBe(0);
  });
});

describe("métricas", () => {
  it("retorno composto e queda máxima do pico ao fundo", () => {
    const m = metricas([0.1, -0.2], 365.25);
    expect(m.retorno).toBeCloseTo(1.1 * 0.8 - 1, 12);
    expect(m.quedaMax).toBeCloseTo(0.2, 12); // pico 1,10 -> fundo 0,88
    expect(m.cagr).toBeCloseTo(m.retorno, 12); // exatamente 1 ano
  });
  it("trecho curto não anualiza (evita número absurdo) e perda total não dá NaN", () => {
    expect(metricas([0.5], 10).cagr).toBeNull();
    expect(metricas([-1], 400).cagr).toBe(-1);
    expect(metricas([], 0).retorno).toBe(0);
  });
});

describe("o teste de 'acerta o momento'", () => {
  it("conta feita à mão: t de Welch, diferença de médias, exposição e excesso líquido", () => {
    // dentro: [0,01 0,03] média 0,02, variância 0,0002 | fora: [-0,02 0] média -0,01, variância 0,0002
    const m = momento([0.01, 0.03, -0.02, 0], [true, true, false, false], [0.01, 0.03, 0, 0]);
    expect(m.difMedia).toBeCloseTo(0.03, 12);
    expect(m.t).toBeCloseTo(0.03 / Math.sqrt(0.0002 / 2 + 0.0002 / 2), 10); // ≈ 2,1213
    expect(m.exposicao).toBe(0.5);
    expect(m.dentro).toBe(2);
    expect(m.fora).toBe(2);
    expect(m.excessoLiquidoDia).toBeCloseTo(0.01 - 0.5 * 0.005, 12); // regra 0,01/dia contra 0,0025/dia de exposição igual sem escolher o momento
  });
  it("sem variância ou sem dias de um lado: t = 0 (nunca NaN nem infinito)", () => {
    expect(momento([0.01, 0.01, 0.01, 0.01], [true, true, false, false], [0, 0, 0, 0]).t).toBe(0);
    const tudoDentro = momento([0.01, -0.02, 0.03], [true, true, true], [0.01, -0.02, 0.03]);
    expect(tudoDentro.t).toBe(0);
    expect(tudoDentro.difMedia).toBe(0);
    expect(Number.isFinite(momento([], [], []).t)).toBe(true);
  });
  it("uma regra que acerta o momento de verdade tem t alto; uma aleatória, não", () => {
    const rnd = aleatorio(3);
    const r = Array.from({ length: 600 }, () => (rnd() - 0.5) * 0.04);
    const acerta = r.map((x) => x > 0); // vê o futuro: serve só como controle positivo
    expect(momento(r, acerta, r.map((x, i) => (acerta[i] ? x : 0))).t).toBeGreaterThan(10);
    const sorteio = aleatorio(99);
    const ao_acaso = r.map(() => sorteio() > 0.5);
    expect(Math.abs(momento(r, ao_acaso, r).t)).toBeLessThan(3.5);
  });
});

describe("selo de evidência", () => {
  const met = (retorno: number, quedaMax: number, dias = 500) => ({ retorno, cagr: 0, quedaMax, dias });
  const mom = (o: Partial<Momento> = {}): Momento => ({ t: 3, difMedia: 0.002, dentro: 200, fora: 200, exposicao: 0.5, excessoLiquidoDia: 0.0005, ...o });
  const par = (rr: number, rd: number, br: number, bd: number, m: Partial<Momento> = {}, dias = 500): Par => ({ regra: met(rr, rd, dias), base: met(br, bd, dias), momento: mom(m) });
  /** Caso base que MERECE indício: t alto no total, mesmo sinal nos dois períodos, operações suficientes. */
  const bom = () => ({ treino: par(0.5, 0.2, 0.4, 0.3), teste: par(0.3, 0.2, 0.2, 0.3), total: par(0.9, 0.2, 0.7, 0.3, { t: 3 }), trades: 10 });
  const selo = (o: Partial<ReturnType<typeof bom>> = {}) => {
    const c = { ...bom(), ...o };
    return selar(c.treino, c.teste, c.total, c.trades);
  };

  it("sem teste suficiente: DADOS INSUFICIENTES", () => {
    expect(selo({ teste: par(0.3, 0.2, 0.2, 0.3, {}, MIN_DIAS_TESTE - 1) }).selo).toBe("insuficiente");
  });
  it("evidência forte, consistente e com custos: no máximo INDÍCIO, e o texto avisa que não está confirmado", () => {
    const x = selo();
    expect(x.selo).toBe("indicio");
    expect(x.motivo).toMatch(/NÃO está confirmado/);
  });
  it("cada condição do indício é necessária (tirar qualquer uma derruba o selo)", () => {
    const naoIndicio = (o: Partial<ReturnType<typeof bom>>) => expect(selo(o).selo).not.toBe("indicio");
    naoIndicio({ total: par(0.9, 0.2, 0.7, 0.3, { t: T_MINIMO - 0.1 }) }); // evidência fraca
    naoIndicio({ treino: par(0.5, 0.2, 0.4, 0.3, { difMedia: -0.001 }) }); // inconsistente: no treino foi ao contrário
    naoIndicio({ teste: par(0.3, 0.2, 0.2, 0.3, { difMedia: 0 }) }); // inconsistente: no teste foi ao contrário
    naoIndicio({ trades: 5 }); // poucas operações
    naoIndicio({ total: par(0.9, 0.2, 0.7, 0.3, { t: 3, excessoLiquidoDia: -0.0001 }) }); // os custos comem o ganho
    expect(selo({ total: par(0.9, 0.2, 0.7, 0.3, { t: T_MINIMO }) }).selo).toBe("indicio"); // exatamente no limite vale
  });
  it("quase sempre dentro ou quase sempre fora: é comprar e manter (ou ficar em caixa), não uma regra", () => {
    const dentro = selo({ teste: par(0.3, 0.2, 0.2, 0.3, { exposicao: 0.97 }) });
    expect(dentro.selo).toBe("sem_vantagem");
    expect(dentro.motivo).toMatch(/comprar e manter/);
    const fora = selo({ teste: par(0.3, 0.2, 0.2, 0.3, { exposicao: 0.03 }) });
    expect(fora.selo).toBe("sem_vantagem");
    expect(fora.motivo).toMatch(/caixa/);
  });
  it("poucos dias de um dos lados: sem vantagem comprovada", () => {
    expect(selo({ teste: par(0.3, 0.2, 0.2, 0.3, { dentro: 20 }) }).selo).toBe("sem_vantagem");
  });
  it("cai bem menos por ficar fora parte do tempo: MENOS QUEDA, e o texto diz que isso não prova acerto", () => {
    const x = selo({ total: par(0.1, 0.1, 0.5, 0.3, { t: 0.5 }), teste: par(0.05, 0.1, 0.3, 0.4, { t: 0.5 }) });
    expect(x.selo).toBe("menos_risco");
    expect(x.motivo).toMatch(/não prova/);
    expect(x.motivo).toMatch(/a menos/);
  });
  it("limite exato dos 25% de menos queda conta como MENOS QUEDA", () => {
    expect(selo({ total: par(0.1, 0.3, 0.5, 0.4, { t: 0.5 }), teste: par(0.05, 0.3, 0.3, 0.4, { t: 0.5 }) }).selo).toBe("menos_risco");
  });
  it("nada de especial: SEM VANTAGEM COMPROVADA, mostrando o t e o mínimo exigido", () => {
    const x = selo({ total: par(0.1, 0.35, 0.5, 0.3, { t: 0.8 }), teste: par(0.05, 0.35, 0.3, 0.3, { t: 0.8 }) });
    expect(x.selo).toBe("sem_vantagem");
    expect(x.motivo).toMatch(/t = 0,8/);
    expect(x.motivo).toMatch(/2,5/);
  });
});

describe("calibração contra o acaso (guarda: ninguém afrouxa o critério sem perceber)", () => {
  const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const datas = datasDe(1825);
  const taxa = (gerar: (r: () => number) => number[], rodadas: number) => {
    let ind = 0;
    let tot = 0;
    for (let k = 0; k < rodadas; k++) {
      const v = gerar(aleatorio(1000 + k));
      for (const r of REGRAS) {
        if (avaliarRegra(datas, v, r, 0.0015).selo === "indicio") ind++;
        tot++;
      }
    }
    return ind / tot;
  };

  it("em caminhos aleatórios SEM nenhuma vantagem, o 'indício' é raro (≤ 2%; medido ≈ 0,1%)", () => {
    const passeio = (r: () => number) => {
      let p = 100;
      return Array.from({ length: 1825 }, () => (p *= Math.exp(-(0.035 ** 2) / 2 + 0.035 * normal(r))));
    };
    expect(taxa(passeio, 120)).toBeLessThanOrEqual(0.02);
  }, 60_000);

  it("com habilidade REAL e forte (regimes lentos), o 'indício' consegue aparecer (poder ≥ 10%; medido ≈ 27%)", () => {
    const regimes = (r: () => number) => {
      let p = 100;
      let reg = 1;
      return Array.from({ length: 1825 }, () => {
        if (r() < 1 / 300) reg = -reg;
        return (p *= Math.exp(reg * 0.003 + 0.02 * normal(r)));
      });
    };
    expect(taxa(regimes, 100)).toBeGreaterThanOrEqual(0.1);
  }, 60_000);
});

describe("avaliação completa de uma regra", () => {
  it("passeio aleatório: tudo finito, treino ≈ 70% e selo nunca passa de 'indício'", () => {
    const rnd = aleatorio(7);
    let p = 100;
    const v = Array.from({ length: 1500 }, () => (p *= 1 + (rnd() - 0.5) * 0.04));
    for (const r of REGRAS) {
      const a = avaliarRegra(datasDe(v.length), v, r, 0.0015);
      expect(a.periodo).not.toBeNull();
      expect(["indicio", "menos_risco", "sem_vantagem", "insuficiente"]).toContain(a.selo);
      for (const par of [a.treino, a.teste]) {
        expect(par).not.toBeNull();
        for (const x of [par!.regra, par!.base]) {
          expect(Number.isFinite(x.retorno)).toBe(true);
          expect(Number.isFinite(x.quedaMax)).toBe(true);
          expect(x.quedaMax).toBeGreaterThanOrEqual(0);
          expect(x.quedaMax).toBeLessThanOrEqual(1);
        }
      }
      const total = a.treino!.base.dias + a.teste!.base.dias;
      expect(a.treino!.base.dias / total).toBeGreaterThan(0.65);
      expect(a.treino!.base.dias / total).toBeLessThan(0.75);
    }
  });

  it("série curta: DADOS INSUFICIENTES, sem quebrar", () => {
    const v = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 10) * 5);
    const a = avaliarRegra(datasDe(300), v, regra("sma200"), 0.0015);
    expect(a.selo).toBe("insuficiente");
    const b = avaliarRegra(datasDe(10), v.slice(0, 10), regra("sma200"), 0.0015);
    expect(b.selo).toBe("insuficiente");
    expect(b.periodo).toBeNull();
  });

  it("preço parado não gera NaN nem infinito em nenhum campo numérico", () => {
    const v = new Array(900).fill(50);
    const ruins: string[] = [];
    const varrer = (x: unknown, caminho: string) => {
      if (typeof x === "number" && !Number.isFinite(x)) ruins.push(`${caminho}=${x}`);
      else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) varrer(y, `${caminho}.${k}`);
    };
    for (const r of REGRAS) varrer(avaliarRegra(datasDe(900), v, r, 0.0015), r.id);
    expect(ruins).toEqual([]);
  });
});
