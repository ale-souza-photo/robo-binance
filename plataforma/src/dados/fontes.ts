import { somaDias, hojeUtc } from "@/core/datas";
import { baixarBcb, cdiComoIndice } from "./bcb";
import { baixarBinance } from "./binance";
import { baixarBrapi, baixarYahoo } from "./bolsa";
import { type AtivoDef, type Fonte, type OpcoesCarga, type Serie, ErroFonte } from "./tipos";

const MIN_PONTOS = 60;

async function porFonte(fonte: Fonte, ref: string, o: OpcoesCarga): Promise<Serie> {
  const agora = o.agora ?? new Date();
  const fim = agora.toISOString().slice(0, 10);
  const ini = somaDias(fim, -Math.round(o.anos * 365) - 30);
  switch (fonte) {
    case "binance":
      return baixarBinance(ref, o.anos, o.fetch, agora);
    case "bcb_usd":
      return baixarBcb(Number(ref), ini, fim, o.fetch);
    case "bcb_cdi":
      return cdiComoIndice(await baixarBcb(Number(ref), ini, fim, o.fetch));
    case "brapi":
      return baixarBrapi(ref, o.anos, o.fetch, o.brapiToken);
    case "yahoo":
      return baixarYahoo(ref, o.anos, o.fetch);
  }
}

/** Carrega a série de um ativo; se a fonte principal falhar, tenta a reserva (se houver). */
export async function carregarSerie(def: AtivoDef, o: OpcoesCarga): Promise<{ serie: Serie; fonteUsada: Fonte; avisos: string[] }> {
  const tentativas: { fonte: Fonte; ref: string }[] = [{ fonte: def.fonte, ref: def.ref }];
  if (def.fallback) tentativas.push(def.fallback);
  const avisos: string[] = [];
  for (const t of tentativas) {
    try {
      const serie = await porFonte(t.fonte, t.ref, o);
      if (serie.length < MIN_PONTOS) throw new ErroFonte(t.fonte, `poucos dados (${serie.length} pontos) para ${def.id}`);
      return { serie, fonteUsada: t.fonte, avisos };
    } catch (e) {
      avisos.push(`${def.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new ErroFonte("fontes", avisos.join(" | "));
}

/** Ativos que a plataforma já conhece (o dono pode acrescentar outros, inclusive BDRs). */
export const ATIVOS_PADRAO: AtivoDef[] = [
  { id: "BTC", nome: "Bitcoin", fonte: "binance", ref: "BTC/BRL" },
  { id: "ETH", nome: "Ethereum", fonte: "binance", ref: "ETH/BRL" },
  { id: "DOLAR", nome: "Dólar", fonte: "bcb_usd", ref: "1" },
  { id: "CDI", nome: "CDI (renda fixa)", fonte: "bcb_cdi", ref: "12" },
  { id: "BOVA11", nome: "Ibovespa (BOVA11)", fonte: "brapi", ref: "BOVA11", fallback: { fonte: "yahoo", ref: "BOVA11.SA" } },
  { id: "IVVB11", nome: "S&P 500 em R$ (IVVB11)", fonte: "brapi", ref: "IVVB11", fallback: { fonte: "yahoo", ref: "IVVB11.SA" } },
];

export { hojeUtc };
