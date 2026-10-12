import { baixarCotacaoBrapi } from "@/dados/bolsa";
import { ATIVOS_PADRAO, carregarSerie } from "@/dados/fontes";
import { lerListaBdr, urlListaBdr } from "@/core/destaques";
import { statusEnv } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Testa de verdade cada fonte de dados a partir do SERVIDOR e mostra o que veio (só para o dono logado).
 * Serve para confirmar o que não dá para verificar sem internet: Binance, Banco Central e brapi/Yahoo.
 */
export async function GET() {
  const resultados = [];
  for (const def of ATIVOS_PADRAO) {
    const ini = Date.now();
    try {
      const r = await carregarSerie(def, { anos: 1, fetch, brapiToken: process.env.BRAPI_TOKEN });
      resultados.push({
        ativo: def.id, ok: true, fonteUsada: r.fonteUsada, pontos: r.serie.length,
        primeira: r.serie[0].data, ultima: r.serie[r.serie.length - 1].data, avisos: r.avisos, ms: Date.now() - ini,
      });
    } catch (e) {
      resultados.push({ ativo: def.id, ok: false, erro: e instanceof Error ? e.message : String(e), ms: Date.now() - ini });
    }
  }

  // Cotação atual da bolsa (brapi, com atraso): o formato real ainda não foi confirmado, então testamos aqui.
  const cotacoes = [];
  for (const t of ["BOVA11", "IVVB11"]) {
    const ini = Date.now();
    try {
      const c = await baixarCotacaoBrapi(t, fetch, process.env.BRAPI_TOKEN);
      cotacoes.push({ ticker: t, ok: true, preco: c.preco, hora: c.hora, ms: Date.now() - ini });
    } catch (e) {
      cotacoes.push({ ticker: t, ok: false, erro: e instanceof Error ? e.message : String(e), ms: Date.now() - ini });
    }
  }
  // Lista de BDRs (destaques do dia): confirma se o plano grátis entrega a lista e no formato esperado.
  let bdrs: { ok: boolean; http?: number; itens?: number; exemplo?: string[]; erro?: string } = { ok: false };
  try {
    const r = await fetch(urlListaBdr(), { headers: process.env.BRAPI_TOKEN ? { Authorization: `Bearer ${process.env.BRAPI_TOKEN}` } : {} });
    if (!r.ok) bdrs = { ok: false, http: r.status, erro: (await r.text()).slice(0, 200) };
    else {
      const lista = lerListaBdr(await r.json());
      bdrs = { ok: lista.length > 0, http: r.status, itens: lista.length, exemplo: lista.slice(0, 3).map((x) => x.ticker) };
    }
  } catch (e) {
    bdrs = { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
  return Response.json({ regiao: process.env.VERCEL_REGION ?? "local", variaveis: statusEnv(), resultados, cotacoes, bdrs });
}
