import { type Dia, diaDoMes, diasEntre, anoDe, mesDe } from "./datas";

export type Fluxo = { data: Dia; valor: number };

/** Retorno anual do SEU dinheiro (TIR): considera quando cada aporte entrou. */
export function tirAnual(fluxos: Fluxo[], dataFinal: Dia, valorFinal: number): number | null {
  const d0 = fluxos[0].data;
  const vp = (r: number) => {
    let total = 0;
    for (const f of fluxos) total -= f.valor / (1 + r) ** (diasEntre(d0, f.data) / 365);
    return total + valorFinal / (1 + r) ** (diasEntre(d0, dataFinal) / 365);
  };
  let lo = -0.95;
  let hi = 20;
  if (vp(lo) * vp(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (vp(lo) * vp(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export type ResultadoDca = {
  aportado: number;
  valorFinal: number;
  ganho: number;
  tir: number | null;
  piorQuedaNoPapel: number;
  pctNoPrejuizo: number;
  valor: number[];
  aportes: number[];
};

/**
 * Aporte inicial no primeiro dia e aporte mensal no primeiro dia a partir do `dia` de cada mês,
 * repartido pelos pesos. Equivale ao `simular_dca` do Python.
 */
export function simularDca(
  datas: Dia[],
  valores: Record<string, number[]>,
  pesos: Record<string, number>,
  inicial: number,
  mensal: number,
  dia: number,
): ResultadoDca {
  const nomes = Object.keys(pesos);
  const unidades: Record<string, number> = Object.fromEntries(nomes.map((n) => [n, 0]));
  let aportado = 0;
  const fluxos: Fluxo[] = [];
  const serieV: number[] = [];
  const serieA: number[] = [];
  let ultimoMes: string | null = null;

  datas.forEach((d, i) => {
    let aporte = 0;
    if (i === 0) {
      aporte = inicial;
      ultimoMes = `${anoDe(d)}-${mesDe(d)}`;
    } else if (`${anoDe(d)}-${mesDe(d)}` !== ultimoMes && diaDoMes(d) >= dia) {
      aporte = mensal;
      ultimoMes = `${anoDe(d)}-${mesDe(d)}`;
    }
    if (aporte > 0) {
      for (const n of nomes) unidades[n] += (aporte * pesos[n]) / valores[n][i];
      aportado += aporte;
      fluxos.push({ data: d, valor: aporte });
    }
    serieV.push(nomes.reduce((s, n) => s + unidades[n] * valores[n][i], 0));
    serieA.push(aportado);
  });

  const final = serieV[serieV.length - 1];
  const papel: number[] = [];
  for (let i = 0; i < datas.length; i++) if (serieA[i] > 0) papel.push(1 - serieV[i] / serieA[i]);
  return {
    aportado,
    valorFinal: final,
    ganho: final - aportado,
    tir: fluxos.length ? tirAnual(fluxos, datas[datas.length - 1], final) : null,
    piorQuedaNoPapel: papel.length ? Math.max(0, Math.max(...papel)) : 0,
    pctNoPrejuizo: papel.length ? papel.filter((x) => x > 0).length / papel.length : 0,
    valor: serieV,
    aportes: serieA,
  };
}

/** 'Nome:BTC=0.5,CDI=0.5' ou 'BTC=0.5,CDI=0.5' -> { nome, pesos } (valida que somam 1). */
export function lerCarteira(texto: string): { nome: string; pesos: Record<string, number> } {
  const i = texto.lastIndexOf(":");
  const nome = i >= 0 ? texto.slice(0, i) : texto;
  const resto = i >= 0 ? texto.slice(i + 1) : texto;
  const pesos: Record<string, number> = {};
  for (const par of resto.split(",")) {
    const [k, v] = par.split("=");
    const peso = Number(v);
    if (!k || !Number.isFinite(peso)) throw new Error(`peso inválido em '${par}'`);
    pesos[k.trim().toUpperCase()] = peso;
  }
  const soma = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (Math.abs(soma - 1) > 1e-6) throw new Error(`os pesos de '${nome}' somam ${soma.toFixed(2)}, e deveriam somar 1`);
  return { nome, pesos };
}
