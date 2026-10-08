import { baixarCotacaoBrapi } from "@/dados/bolsa";
import { ehDono } from "@/lib/config";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Cache em memória por ticker. A brapi grátis dá 15.000 pedidos/mês e 1 ticker por pedido: 5 min bastam (o dado já vem atrasado). */
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { em: number; preco: number; hora: string | null }>();
const MAX_TICKERS = 10;

/**
 * Cotações da bolsa (BDR, ação, ETF) com atraso, via brapi. Só para o dono logado, e só dos ativos que ele cadastrou
 * (assim a rota não vira uma porta aberta para gastar a cota). Uma falha num ticker não derruba os outros.
 */
export async function GET(req: Request) {
  const supabase = await clienteServidor();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user || !ehDono(u.user.email)) return Response.json({ erro: "não autorizado" }, { status: 401 });

  const pedidos = [...new Set((new URL(req.url).searchParams.get("t") ?? "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))];
  if (!pedidos.length || pedidos.length > MAX_TICKERS || pedidos.some((t) => !/^[A-Z0-9]{2,15}$/.test(t))) {
    return Response.json({ erro: "tickers inválidos" }, { status: 400 });
  }

  const { data: ativos, error } = await supabase.from("ativos").select("id,tipo,referencia").eq("ativo", true).in("id", pedidos);
  if (error) return Response.json({ erro: "falha ao ler os ativos" }, { status: 500 });
  const permitidos = new Map((ativos ?? []).filter((a) => a.tipo !== "cripto" && a.tipo !== "cambio" && a.tipo !== "renda_fixa").map((a) => [a.id as string, a.referencia as string]));

  const agora = Date.now();
  const cotacoes = await Promise.all(
    pedidos.map(async (id) => {
      const ticker = permitidos.get(id);
      if (!ticker) return { id, ok: false as const, erro: "ativo não cadastrado ou sem cotação ao vivo" };
      const c = cache.get(ticker);
      if (c && agora - c.em < TTL_MS) return { id, ok: true as const, preco: c.preco, hora: c.hora, buscadoEm: new Date(c.em).toISOString(), cache: true };
      try {
        const r = await baixarCotacaoBrapi(ticker, fetch, process.env.BRAPI_TOKEN);
        cache.set(ticker, { em: agora, preco: r.preco, hora: r.hora });
        return { id, ok: true as const, preco: r.preco, hora: r.hora, buscadoEm: new Date(agora).toISOString(), cache: false };
      } catch (e) {
        return { id, ok: false as const, erro: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return Response.json({ cotacoes });
}
