import { avaliarRegra, metricas, type AvaliacaoRegra, type Metricas } from "./backtest-regras";
import type { Dia } from "./datas";
import { custosDoTipo } from "./paper";
import { REGRAS } from "./sinais";

export type Cartao =
  | { id: string; nome: string; curto: true; n: number }
  | {
      id: string; nome: string; curto: false; n: number;
      ultimo: number; ultimaData: Dia; primeiraData: Dia; geral: Metricas; regras: AvaliacaoRegra[];
    };

/** Monta o cartão de um ativo: o histórico inteiro e as quatro regras avaliadas, com o custo certo para o tipo do ativo. */
export function montarCartao(id: string, nome: string, tipo: string, datas: Dia[], valores: number[]): Cartao {
  if (valores.length < 60) return { id, nome, curto: true, n: valores.length };
  const c = custosDoTipo(tipo);
  const custoLado = c.taxa + c.slippage;
  const rets = valores.slice(1).map((v, i) => v / valores[i] - 1);
  const dias = Math.max(1, (Date.parse(datas[datas.length - 1]) - Date.parse(datas[0])) / 86_400_000);
  return {
    id, nome, curto: false, n: valores.length,
    ultimo: valores[valores.length - 1], ultimaData: datas[datas.length - 1], primeiraData: datas[0],
    geral: metricas(rets, dias), regras: REGRAS.map((r) => avaliarRegra(datas, valores, r, custoLado)),
  };
}
