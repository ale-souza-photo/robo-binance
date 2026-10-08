import { type Dia, somaDias } from "@/core/datas";
import { indiceCdi } from "@/core/series";
import { type FetchLike, type Serie, ErroFonte } from "./tipos";

const dmy = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ymd = (s: string): Dia => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;

export const urlBcb = (serie: number, ini: Dia, fim: Dia) =>
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json&dataInicial=${dmy(ini)}&dataFinal=${dmy(fim)}`;

/** JSON do Banco Central (SGS): [{ data: 'dd/mm/aaaa', valor: '0.04' }]. */
export function parseBcb(dados: unknown): Serie {
  if (!Array.isArray(dados)) throw new ErroFonte("bcb", "resposta inesperada (não é uma lista)");
  const saida: Serie = [];
  for (const d of dados as { data?: string; valor?: string | null }[]) {
    if (!d?.data || d.valor == null || d.valor === "") continue;
    const v = Number(d.valor);
    if (Number.isFinite(v)) saida.push({ data: ymd(d.data), valor: v });
  }
  return saida;
}

/** Baixa em janelas de 3 anos (a API limita o tamanho da consulta) e remove repetidos. */
export async function baixarBcb(serie: number, ini: Dia, fim: Dia, f: FetchLike): Promise<Serie> {
  const porData = new Map<string, number>();
  let atual = ini;
  while (atual <= fim) {
    const fimJ = somaDias(atual, 365 * 3) < fim ? somaDias(atual, 365 * 3) : fim;
    const r = await f(urlBcb(serie, atual, fimJ));
    if (!r.ok) throw new ErroFonte("bcb", `série ${serie}: HTTP ${r.status}`);
    for (const p of parseBcb(await r.json())) porData.set(p.data, p.valor);
    atual = somaDias(fimJ, 1);
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, valor]) => ({ data, valor }));
}

/** CDI: taxa diária (% ao dia) acumulada em um índice. */
export const cdiComoIndice = (taxas: Serie): Serie => indiceCdi(taxas);
