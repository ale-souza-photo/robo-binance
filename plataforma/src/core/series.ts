import { type Dia, diasEntre, somaDias } from "./datas";

export type Ponto = { data: Dia; valor: number };
export type Serie = Ponto[];

/**
 * Põe todas as séries no mesmo calendário diário (fins de semana e feriados ficam com o último
 * valor conhecido), apenas no período em que TODAS existem. Equivale ao `alinhar` do Python.
 */
export function alinhar(series: Record<string, Serie>, desde?: Dia): { datas: Dia[]; valores: Record<string, number[]> } {
  const nomes = Object.keys(series);
  if (nomes.length === 0) throw new Error("Nenhuma série para alinhar.");
  let inicio = nomes.map((n) => series[n][0].data).reduce((a, b) => (a > b ? a : b));
  const fim = nomes.map((n) => series[n][series[n].length - 1].data).reduce((a, b) => (a < b ? a : b));
  if (desde && desde > inicio) inicio = desde;
  if (inicio >= fim) throw new Error("Os ativos escolhidos não têm período em comum.");
  const total = diasEntre(inicio, fim) + 1;
  const datas = Array.from({ length: total }, (_, k) => somaDias(inicio, k));
  const valores: Record<string, number[]> = {};
  for (const nome of nomes) {
    const pts = series[nome];
    const saida: number[] = [];
    let j = 0;
    let atual = Number.NaN;
    for (const d of datas) {
      while (j < pts.length && pts[j].data <= d) {
        atual = pts[j].valor;
        j += 1;
      }
      saida.push(atual);
    }
    valores[nome] = saida;
  }
  return { datas, valores };
}

/** Taxa diária do CDI (% ao dia) -> índice acumulado (1,0 no início). */
export function indiceCdi(taxasDiarias: Serie): Serie {
  let idx = 1;
  return taxasDiarias.map(({ data, valor }) => {
    idx *= 1 + valor / 100;
    return { data, valor: idx };
  });
}
