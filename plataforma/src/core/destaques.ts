/**
 * Destaques do dia: os BDRs mais negociados (popularidade) ordenados pelo retorno dos últimos 30 dias, com a variação do dia ao lado.
 * Funções puras (sem rede). Educativo: retorno passado não indica o que vem depois, e o ranking muda de um dia para o outro.
 */
import { somaDias } from "@/core/datas";
import type { Serie } from "@/core/series";

export type CandidatoBdr = { ticker: string; nome: string; preco: number; varDia: number | null; volume: number };
export type Destaque = CandidatoBdr & { posicao: number; ret30d: number };

export const QTD_DESTAQUES = 10;
/** Quantos dos mais negociados entram na disputa (cada um custa um pedido de histórico). */
export const TAMANHO_POOL = 30;
export const MIN_COM_RETORNO = 3;

/** BDR da B3: 4 letras + 32, 33, 34, 35 ou 39 (ex.: AAPL34, MSFT34, NVDC34). Não aceita fracionário (termina em F). */
export const ehTickerBdr = (t: string): boolean => /^[A-Z]{4}(32|33|34|35|39)$/.test(t);

/** Lista de BDRs por volume (um pedido só). ATENÇÃO: formato e disponibilidade no plano grátis não verificados: ver /api/diagnostico. */
export const urlListaBdr = (limite = 60) =>
  `https://brapi.dev/api/quote/list?type=bdr&sortBy=volume&sortOrder=desc&limit=${limite}`;

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lê a lista da brapi (`stocks[]` com `stock`, `name`, `close`, `change` em %, `volume`). Item inválido é ignorado. */
export function lerListaBdr(json: unknown): CandidatoBdr[] {
  const lista = (json as { stocks?: unknown })?.stocks;
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const saida: CandidatoBdr[] = [];
  for (const d of lista as Record<string, unknown>[]) {
    const ticker = typeof d?.stock === "string" ? d.stock.trim().toUpperCase() : "";
    const preco = num(d?.close);
    const volume = num(d?.volume);
    if (!ehTickerBdr(ticker) || vistos.has(ticker) || preco == null || preco <= 0 || volume == null || volume <= 0) continue;
    vistos.add(ticker);
    const ch = num(d?.change);
    saida.push({ ticker, nome: typeof d.name === "string" && d.name.trim() ? d.name.trim() : ticker, preco, varDia: ch == null ? null : ch / 100, volume });
  }
  return saida.sort((a, b) => b.volume - a.volume);
}

/** Retorno dos últimos 30 dias corridos: último preço / preço do último pregão até 30 dias antes. Sem histórico suficiente, null. */
export function retorno30d(serie: Serie): number | null {
  if (serie.length < 2) return null;
  const ult = serie[serie.length - 1];
  const alvo = somaDias(ult.data, -30);
  let base: number | null = null;
  for (const p of serie) {
    if (p.data <= alvo) base = p.valor;
    else break;
  }
  return base && base > 0 && ult.valor > 0 ? ult.valor / base - 1 : null;
}

/** Fica com os mais negociados que têm retorno calculado e ordena por retorno de 30 dias (maior primeiro). */
export function escolherDestaques(pool: { cand: CandidatoBdr; ret30d: number | null }[], quantos = QTD_DESTAQUES): Destaque[] {
  return pool
    .filter((p): p is { cand: CandidatoBdr; ret30d: number } => p.ret30d != null && Number.isFinite(p.ret30d))
    .sort((a, b) => b.ret30d - a.ret30d || b.cand.volume - a.cand.volume)
    .slice(0, quantos)
    .map((p, i) => ({ ...p.cand, posicao: i + 1, ret30d: p.ret30d }));
}
