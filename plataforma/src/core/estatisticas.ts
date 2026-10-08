import { type Dia, anoDe } from "./datas";

export type Estatisticas = {
  retornoTotal: number;
  cagr: number;
  vol: number;
  piorQueda: number;
  calmar: number | null;
  porAno: Record<number, number>;
  anos: number;
  pos12m: number | null;
  pior12m: number | null;
  melhor12m: number | null;
  mediana12m: number | null;
};

const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Desvio padrão populacional (igual ao `pstdev` do Python). */
export function pstdev(v: number[]): number {
  const m = media(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
}

export function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function estatisticas(datas: Dia[], v: number[]): Estatisticas {
  const dias = (Date.parse(datas[datas.length - 1] + "T00:00:00Z") - Date.parse(datas[0] + "T00:00:00Z")) / 86_400_000;
  const anos = Math.max(dias / 365.25, 1e-9);
  const rets: number[] = [];
  for (let i = 1; i < v.length; i++) rets.push(v[i] / v[i - 1] - 1);
  let pico = v[0];
  let dd = 0;
  for (const x of v) {
    pico = Math.max(pico, x);
    dd = Math.max(dd, 1 - x / pico);
  }
  const cagr = (v[v.length - 1] / v[0]) ** (1 / anos) - 1;

  const ultimoDoAno: Record<number, number> = {};
  datas.forEach((d, i) => {
    ultimoDoAno[anoDe(d)] = v[i];
  });
  const porAno: Record<number, number> = {};
  let anterior = v[0];
  for (const ano of Object.keys(ultimoDoAno).map(Number).sort((a, b) => a - b)) {
    porAno[ano] = ultimoDoAno[ano] / anterior - 1;
    anterior = ultimoDoAno[ano];
  }

  const jan: number[] = [];
  for (let i = 365; i < v.length; i++) jan.push(v[i] / v[i - 365] - 1);

  return {
    retornoTotal: v[v.length - 1] / v[0] - 1,
    cagr,
    vol: rets.length > 1 ? pstdev(rets) * Math.sqrt(365) : 0,
    piorQueda: dd,
    calmar: dd > 1e-9 ? cagr / dd : null,
    porAno,
    anos,
    pos12m: jan.length ? jan.filter((x) => x > 0).length / jan.length : null,
    pior12m: jan.length ? Math.min(...jan) : null,
    melhor12m: jan.length ? Math.max(...jan) : null,
    mediana12m: jan.length ? mediana(jan) : null,
  };
}

/** Correlação dos retornos semanais (ativos sem variação, como o CDI, ficam de fora). */
export function correlacoes(valores: Record<string, number[]>, passo = 7) {
  const rets: Record<string, number[]> = {};
  for (const [nome, v] of Object.entries(valores)) {
    const r: number[] = [];
    for (let i = 0; i < v.length - passo; i += passo) r.push(v[i + passo] / v[i] - 1);
    if (r.length > 10 && pstdev(r) > 1e-6) rets[nome] = r;
  }
  const nomes = Object.keys(rets);
  const pearson = (a: number[], b: number[]) => {
    const ma = media(a);
    const mb = media(b);
    let num = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      sa += (a[i] - ma) ** 2;
      sb += (b[i] - mb) ** 2;
    }
    const den = Math.sqrt(sa * sb);
    return den ? num / den : 0;
  };
  const matriz: Record<string, Record<string, number>> = {};
  for (const a of nomes) {
    matriz[a] = {};
    for (const b of nomes) matriz[a][b] = pearson(rets[a], rets[b]);
  }
  return { nomes, matriz };
}
