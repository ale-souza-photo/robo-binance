import { type Dia } from "./datas";
import { type Serie, alinhar } from "./series";
import { type Estatisticas, correlacoes, estatisticas } from "./estatisticas";
import { type ResultadoDca, simularDca } from "./carteira";
import { NOMES, leituraRapida } from "./leitura";

export type EntradaAnalise = {
  series: Record<string, Serie>;
  inicial: number;
  mensal: number;
  dia: number;
  carteiras: Record<string, Record<string, number>>;
  nomes?: Record<string, string>;
};

export type CarteiraResumo = Omit<ResultadoDca, "valor" | "aportes"> & { valor: number[]; aportes: number[] };

export type ResultadoAnalise = {
  periodo: { inicio: Dia; fim: Dia; anos: number };
  /** Datas e curvas em amostra semanal (leve para guardar no banco e desenhar). */
  datas: Dia[];
  crescimento: Record<string, number[]>;
  stats: Record<string, Estatisticas>;
  corr: { nomes: string[]; matriz: Record<string, Record<string, number>> };
  carteiras: Record<string, CarteiraResumo>;
  carteirasIgnoradas: { nome: string; faltam: string[] }[];
  frases: string[];
};

/** Uma a cada `passo` pontos, mantendo sempre o último. */
export function amostra<T>(lista: T[], passo = 7): T[] {
  const s = lista.filter((_, i) => i % passo === 0);
  if ((lista.length - 1) % passo !== 0) s.push(lista[lista.length - 1]);
  return s;
}

/** O que o cron roda 2x ao dia: alinha, mede, correlaciona, simula carteiras e escreve a leitura. */
export function executarAnalise(e: EntradaAnalise): ResultadoAnalise {
  const { datas, valores } = alinhar(e.series);
  const stats: Record<string, Estatisticas> = {};
  for (const [n, v] of Object.entries(valores)) stats[n] = estatisticas(datas, v);
  const corr = correlacoes(valores);
  const carteiras: Record<string, CarteiraResumo> = {};
  const carteirasIgnoradas: { nome: string; faltam: string[] }[] = [];
  for (const [nome, pesos] of Object.entries(e.carteiras)) {
    const faltam = Object.keys(pesos).filter((k) => !(k in valores));
    if (faltam.length) {
      carteirasIgnoradas.push({ nome, faltam });
      continue;
    }
    const r = simularDca(datas, valores, pesos, e.inicial, e.mensal, e.dia);
    carteiras[nome] = { ...r, valor: amostra(r.valor).map((x) => +x.toFixed(2)), aportes: amostra(r.aportes).map((x) => +x.toFixed(2)) };
  }
  const crescimento: Record<string, number[]> = {};
  for (const [n, v] of Object.entries(valores)) crescimento[n] = amostra(v).map((x) => +((100 * x) / v[0]).toFixed(2));
  return {
    periodo: { inicio: datas[0], fim: datas[datas.length - 1], anos: stats[Object.keys(stats)[0]].anos },
    datas: amostra(datas),
    crescimento,
    stats,
    corr,
    carteiras,
    carteirasIgnoradas,
    frases: leituraRapida(stats, corr.nomes, corr.matriz, carteiras, { ...NOMES, ...e.nomes }),
  };
}
