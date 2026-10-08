import { deMilissegundos } from "@/core/datas";
import { type FetchLike, type Serie, ErroFonte } from "./tipos";

// Endereço de dados públicos: funciona de servidores fora do Brasil/EUA, sem chave.
const BASE = "https://data-api.binance.vision/api/v3/klines";

export const simboloBinance = (par: string) => par.replace("/", "").toUpperCase();

export const urlKlines = (par: string, desdeMs: number, limite = 1000) =>
  `${BASE}?symbol=${simboloBinance(par)}&interval=1d&startTime=${desdeMs}&limit=${limite}`;

type Kline = [number, string, string, string, string, string, number, ...unknown[]];

/** Candles diários -> série de fechamentos. `agoraMs` descarta o candle de hoje (ainda aberto). */
export function parseKlines(dados: unknown, agoraMs: number): { serie: Serie; ultimoAbertura: number; total: number } {
  if (!Array.isArray(dados)) throw new ErroFonte("binance", "resposta inesperada (não é uma lista de candles)");
  const klines = dados as Kline[];
  const serie: Serie = [];
  for (const k of klines) {
    const fechamentoMs = Number(k[6]);
    const preco = Number(k[4]);
    if (!Number.isFinite(preco) || preco <= 0 || fechamentoMs > agoraMs) continue;
    serie.push({ data: deMilissegundos(Number(k[0])), valor: preco });
  }
  return { serie, ultimoAbertura: klines.length ? Number(klines[klines.length - 1][0]) : 0, total: klines.length };
}

export async function baixarBinance(par: string, anos: number, f: FetchLike, agora = new Date()): Promise<Serie> {
  const porData = new Map<string, number>();
  let desde = agora.getTime() - Math.round(anos * 365.25 * 86_400_000);
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await f(urlKlines(par, desde));
    if (!r.ok) throw new ErroFonte("binance", `${par}: HTTP ${r.status}`);
    const { serie, ultimoAbertura, total } = parseKlines(await r.json(), agora.getTime());
    for (const p of serie) porData.set(p.data, p.valor);
    if (total < 1000) break;
    desde = ultimoAbertura + 1;
  }
  return [...porData.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, valor]) => ({ data, valor }));
}
