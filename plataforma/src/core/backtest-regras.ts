/**
 * Teste histórico das regras de sinal (funções puras). Compara cada regra com simplesmente COMPRAR E MANTER,
 * com taxa e slippage, separando um período de treino (70%) de um período de teste (30%) que a regra "não viu".
 *
 * Sem olhar o futuro: a decisão do fechamento do dia t só ganha o retorno de t -> t+1.
 * Sem venda a descoberto e sem alavancagem: a regra ou está comprada ou está em caixa (retorno zero).
 */
import { type Dia, diasEntre } from "./datas";
import type { Regra, Sinal } from "./sinais";

export type Metricas = {
  retorno: number;
  /** Retorno anualizado; null se o trecho tem menos de 30 dias. */
  cagr: number | null;
  /** Maior queda do pico ao fundo dentro do trecho (0,25 = 25%). */
  quedaMax: number;
  /** Dias de calendário do trecho. */
  dias: number;
};

export function metricas(ret: number[], dias: number): Metricas {
  let eq = 1;
  let pico = 1;
  let dd = 0;
  for (const r of ret) {
    eq *= 1 + r;
    pico = Math.max(pico, eq);
    dd = Math.max(dd, 1 - eq / pico);
  }
  const retorno = eq - 1;
  const cagr = dias < 30 ? null : eq <= 0 ? -1 : eq ** (365.25 / dias) - 1;
  return { retorno, cagr, quedaMax: dd, dias };
}

export type Simulacao = {
  /** Índice do primeiro dia em que a regra opina. */
  inicio: number;
  retRegra: number[];
  retBase: number[];
  /** Retorno do ativo em cada dia, SEM custos (para medir se a regra acerta o momento). */
  retBruto: number[];
  /** Se a regra estava comprada naquele dia. */
  dentro: boolean[];
  /** Quantas vezes a posição mudou (entradas e saídas). */
  trades: number;
};

/**
 * `custoLado` = taxa + slippage de UM lado (compra ou venda), como fração (0,0015 = 0,15%).
 * O retorno de índice k vai do dia (inicio+k) ao dia (inicio+k+1).
 */
export function simular(v: number[], pos: (Sinal | null)[], custoLado: number): Simulacao {
  const ini = pos.findIndex((p) => p !== null);
  if (ini < 0 || ini >= v.length - 1) return { inicio: Math.max(ini, 0), retRegra: [], retBase: [], retBruto: [], dentro: [], trades: 0 };
  const retRegra: number[] = [];
  const retBase: number[] = [];
  const retBruto: number[] = [];
  const dentro: boolean[] = [];
  let anterior: Sinal = 0; // antes de começar, está em caixa
  let trades = 0;
  for (let t = ini; t < v.length - 1; t++) {
    const p = (pos[t] ?? anterior) as Sinal;
    const mudou = p !== anterior;
    if (mudou) trades += 1;
    const r = v[t + 1] / v[t] - 1;
    retRegra.push((1 + (p === 1 ? r : 0)) * (mudou ? 1 - custoLado : 1) - 1);
    retBase.push((1 + r) * (t === ini ? 1 - custoLado : 1) - 1); // comprar e manter: paga a compra uma vez
    retBruto.push(r);
    dentro.push(p === 1);
    anterior = p;
  }
  return { inicio: ini, retRegra, retBase, retBruto, dentro, trades };
}

export type Selo = "indicio" | "menos_risco" | "sem_vantagem" | "insuficiente";

/**
 * A regra acerta o momento? Compara o retorno médio diário nos dias em que ela estava DENTRO com o dos dias em que estava FORA
 * (teste t de Welch). Sem habilidade, a diferença é só ruído: t perto de zero. É a comparação justa, porque comprar e manter
 * tem exposição diferente (uma regra que fica parte do tempo fora cai menos por construção, não por acertar).
 */
export type Momento = {
  /** Estatística t da diferença (dentro − fora). */
  t: number;
  /** Diferença de retorno médio por dia (dentro − fora). */
  difMedia: number;
  dentro: number;
  fora: number;
  /** Fração dos dias em que a regra estava comprada. */
  exposicao: number;
  /** Retorno médio diário da regra (com custos) menos o que uma exposição igual, sem escolher o momento, teria dado. */
  excessoLiquidoDia: number;
};
export type Par = { regra: Metricas; base: Metricas; momento: Momento };

const mediaDe = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const varDe = (a: number[], m: number) => (a.length > 1 ? a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) : 0);

export function momento(retBruto: number[], dentro: boolean[], retRegra: number[]): Momento {
  const din: number[] = [];
  const fora: number[] = [];
  retBruto.forEach((r, i) => (dentro[i] ? din : fora).push(r));
  const mi = mediaDe(din);
  const mf = mediaDe(fora);
  const erro = Math.sqrt(varDe(din, mi) / Math.max(din.length, 1) + varDe(fora, mf) / Math.max(fora.length, 1));
  const exposicao = retBruto.length ? din.length / retBruto.length : 0;
  return {
    t: din.length > 1 && fora.length > 1 && erro > 0 ? (mi - mf) / erro : 0,
    difMedia: din.length && fora.length ? mi - mf : 0,
    dentro: din.length,
    fora: fora.length,
    exposicao,
    excessoLiquidoDia: mediaDe(retRegra) - exposicao * mediaDe(retBruto),
  };
}

export type AvaliacaoRegra = {
  regraId: string;
  nome: string;
  descricao: string;
  leitura: string;
  sinalAgora: Sinal | null;
  periodo: { inicio: Dia; fim: Dia; anos: number } | null;
  treino: Par | null;
  teste: Par | null;
  /** O período avaliado inteiro (usado para medir a evidência: mais dados, mais poder). */
  total: Par | null;
  trades: number;
  selo: Selo;
  motivo: string;
};

export const FRACAO_TREINO = 0.7;
export const MIN_DIAS_TESTE = 365;
export const MIN_TRADES = 6;
/** Evidência exigida para o selo "indício" (t de Welch). Calibrado contra caminhos aleatórios: ver tests/calibracao.test.ts. */
export const T_MINIMO = 2.5;
export const MIN_DIAS_DE_CADA_LADO = 30;

const pc = (x: number) => `${(100 * x).toFixed(0)}%`;
const num1 = (x: number) => x.toFixed(1).replace(".", ",");

/**
 * O selo nunca passa de "indício": um teste num ativo e num período não prova nada.
 * Só vira "indício" com evidência estatística forte de que a regra ACERTA O MOMENTO, nos dois períodos, depois de custos.
 */
export function selar(treino: Par, teste: Par, total: Par, trades: number): { selo: Selo; motivo: string } {
  if (teste.base.dias < MIN_DIAS_TESTE) {
    return { selo: "insuficiente", motivo: `Só ${teste.base.dias} dias no período de teste (preciso de pelo menos ${MIN_DIAS_TESTE}).` };
  }
  const m = teste.momento;
  if (m.exposicao >= 0.95 || m.exposicao <= 0.05) {
    return {
      selo: "sem_vantagem",
      motivo: `Sem vantagem comprovada: ficou ${m.exposicao >= 0.5 ? "dentro" : "fora"} em ${pc(m.exposicao >= 0.5 ? m.exposicao : 1 - m.exposicao)} do teste, então é praticamente ${m.exposicao >= 0.5 ? "comprar e manter" : "ficar em caixa"}.`,
    };
  }
  if (m.dentro < MIN_DIAS_DE_CADA_LADO || m.fora < MIN_DIAS_DE_CADA_LADO) {
    return { selo: "sem_vantagem", motivo: "Sem vantagem comprovada: poucos dias dentro ou fora no teste para comparar." };
  }
  // As regras usam parâmetros fixos (nada foi ajustado aos dados), então a evidência é medida no período inteiro (mais poder)
  // e o treino/teste serve para checar CONSISTÊNCIA: a diferença tem de ter o mesmo sinal nos dois.
  if (total.momento.t >= T_MINIMO && treino.momento.difMedia > 0 && m.difMedia > 0 && trades >= MIN_TRADES && total.momento.excessoLiquidoDia > 0) {
    return {
      selo: "indicio",
      motivo: `Os dias em que a regra estava dentro renderam mais que os dias fora, no período todo (t = ${num1(total.momento.t)}), nos dois períodos e depois dos custos. NÃO está confirmado: é um ativo e um período só, e várias regras e ativos foram testados (algum vai passar por sorte).`,
    };
  }
  if (teste.regra.quedaMax <= 0.75 * teste.base.quedaMax) {
    const diff = teste.regra.retorno - teste.base.retorno;
    return {
      selo: "menos_risco",
      motivo: `Ficou dentro ${pc(m.exposicao)} do teste e caiu no máximo ${pc(teste.regra.quedaMax)} contra ${pc(teste.base.quedaMax)} de comprar e manter${
        diff >= 0 ? "" : `, rendendo ${pc(-diff)} a menos`
      }. Isso vem de ficar fora parte do tempo, não prova que a regra acerta o momento (t = ${num1(total.momento.t)}).`,
    };
  }
  return {
    selo: "sem_vantagem",
    motivo: `Sem vantagem comprovada: a diferença entre os dias dentro e fora não se separa do acaso (t = ${num1(total.momento.t)} no período todo; preciso de pelo menos ${num1(T_MINIMO)}).`,
  };
}

export function avaliarRegra(datas: Dia[], v: number[], regra: Regra, custoLado: number): AvaliacaoRegra {
  const base = { regraId: regra.id, nome: regra.nome, descricao: regra.descricao, leitura: regra.leitura(v) };
  const pos = regra.posicoes(v);
  const sinalAgora = pos.length ? pos[pos.length - 1] : null;
  const sim = simular(v, pos, custoLado);
  const m = sim.retRegra.length;
  const vazio = (motivo: string): AvaliacaoRegra => ({ ...base, sinalAgora, periodo: null, treino: null, teste: null, total: null, trades: sim.trades, selo: "insuficiente", motivo });
  if (m < 30) return vazio("Histórico curto demais para testar a regra.");

  const k = Math.floor(m * FRACAO_TREINO);
  const d = (a: number, b: number) => diasEntre(datas[sim.inicio + a], datas[sim.inicio + b]);
  const par = (a: number, b: number): Par => ({
    regra: metricas(sim.retRegra.slice(a, b), d(a, b)),
    base: metricas(sim.retBase.slice(a, b), d(a, b)),
    momento: momento(sim.retBruto.slice(a, b), sim.dentro.slice(a, b), sim.retRegra.slice(a, b)),
  });
  const treino = par(0, k);
  const teste = par(k, m);
  const total = par(0, m);
  const { selo, motivo } = selar(treino, teste, total, sim.trades);
  const inicio = datas[sim.inicio];
  const fim = datas[sim.inicio + m];
  return { ...base, sinalAgora, periodo: { inicio, fim, anos: diasEntre(inicio, fim) / 365.25 }, treino, teste, total, trades: sim.trades, selo, motivo };
}
