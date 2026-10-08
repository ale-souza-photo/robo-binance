import { baixarCotacaoBrapi } from "@/dados/bolsa";

/** Cache em memória por ticker. A brapi grátis dá 15.000 pedidos/mês e 1 ticker por pedido: 5 min bastam (o dado já vem atrasado). */
export const TTL_COTACAO_MS = 5 * 60_000;
const cache = new Map<string, { em: number; preco: number; hora: string | null }>();

export type CotacaoBolsa = { preco: number; hora: string | null; buscadoEm: string; cache: boolean };

/** Cotação (com atraso) de um ticker da bolsa, com cache de 5 min. Lança erro se a brapi falhar. */
export async function cotacaoBolsa(ticker: string, token: string | undefined, f: typeof fetch = fetch, agora = Date.now()): Promise<CotacaoBolsa> {
  const c = cache.get(ticker);
  if (c && agora - c.em < TTL_COTACAO_MS) return { preco: c.preco, hora: c.hora, buscadoEm: new Date(c.em).toISOString(), cache: true };
  const r = await baixarCotacaoBrapi(ticker, f, token);
  cache.set(ticker, { em: agora, preco: r.preco, hora: r.hora });
  return { preco: r.preco, hora: r.hora, buscadoEm: new Date(agora).toISOString(), cache: false };
}
