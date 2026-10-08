import { dePosixSegundos } from "@/core/datas";
import { type FetchLike, type Serie, ErroFonte } from "./tipos";

/* ------------------------------ brapi.dev (bolsa brasileira) ------------------------------ */
// ATENÇÃO: formato e limites do plano gratuito NÃO foram verificados contra a API real neste ambiente.
// A rota /api/diagnostico testa de verdade. O leitor é defensivo e diz o que veio de errado.
export const urlBrapi = (ticker: string, anos: number) =>
  `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?range=${rangeBrapi(anos)}&interval=1d`;

export function rangeBrapi(anos: number): string {
  const opcoes: [number, string][] = [[0.25, "3mo"], [0.5, "6mo"], [1, "1y"], [2, "2y"], [5, "5y"], [10, "10y"]];
  return (opcoes.find(([a]) => anos <= a) ?? [0, "max"])[1];
}

type CotacaoBrapi = { date: number; close?: number | null; adjustedClose?: number | null };

export function parseBrapi(dados: unknown): Serie {
  const r = (dados as { results?: { historicalDataPrice?: CotacaoBrapi[] }[] })?.results?.[0];
  if (!r) throw new ErroFonte("brapi", "resposta sem 'results' (token inválido, ticker inexistente ou limite do plano?)");
  const hist = r.historicalDataPrice;
  if (!Array.isArray(hist) || hist.length === 0) throw new ErroFonte("brapi", "sem histórico de preços (o plano gratuito pode não incluir este período)");
  const porData = new Map<string, number>();
  for (const h of hist) {
    const v = h.adjustedClose ?? h.close;
    if (v != null && Number.isFinite(v) && v > 0) porData.set(dePosixSegundos(h.date), v);
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, valor]) => ({ data, valor }));
}

export async function baixarBrapi(ticker: string, anos: number, f: FetchLike, token?: string): Promise<Serie> {
  const r = await f(urlBrapi(ticker, anos), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new ErroFonte("brapi", `${ticker}: HTTP ${r.status}`);
  return parseBrapi(await r.json());
}

/* ------------------------------ Yahoo Finance (reserva, não oficial) ------------------------------ */
export const urlYahoo = (ticker: string, anos: number) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${Math.max(1, Math.ceil(anos) + 1)}y&interval=1d`;

export function parseYahoo(dados: unknown): Serie {
  const res = (dados as { chart?: { result?: any[] } })?.chart?.result?.[0];
  if (!res?.timestamp) throw new ErroFonte("yahoo", "resposta sem 'timestamp'");
  const adj: (number | null)[] | undefined = res.indicators?.adjclose?.[0]?.adjclose;
  const precos: (number | null)[] = adj ?? res.indicators?.quote?.[0]?.close ?? [];
  const porData = new Map<string, number>();
  (res.timestamp as number[]).forEach((t, i) => {
    const v = precos[i];
    if (v != null && Number.isFinite(v) && v > 0) porData.set(dePosixSegundos(t), v);
  });
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, valor]) => ({ data, valor }));
}

export async function baixarYahoo(ticker: string, anos: number, f: FetchLike): Promise<Serie> {
  const r = await f(urlYahoo(ticker, anos), { headers: { "User-Agent": "Mozilla/5.0 (compatible; trader-bit/1.0)" } });
  if (!r.ok) throw new ErroFonte("yahoo", `${ticker}: HTTP ${r.status}`);
  return parseYahoo(await r.json());
}
