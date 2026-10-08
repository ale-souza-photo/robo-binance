import { ehDono } from "@/lib/config";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cotacaoBolsa } from "@/servico/cotacao-bolsa";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  // Um ticker por vez: o plano grátis da brapi é de 1 ticker por chamada e pode recusar pedidos simultâneos.
  const cotacoes = [];
  for (const id of pedidos) {
    const ticker = permitidos.get(id);
    if (!ticker) {
      cotacoes.push({ id, ok: false as const, erro: "ativo não cadastrado ou sem cotação ao vivo" });
      continue;
    }
    try {
      const r = await cotacaoBolsa(ticker, process.env.BRAPI_TOKEN);
      cotacoes.push({ id, ok: true as const, preco: r.preco, hora: r.hora, buscadoEm: r.buscadoEm, cache: r.cache });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`cotacao ${id} falhou: ${erro}`); // vai para o log da Vercel (a resposta é 200, então sem isto o erro sumia)
      cotacoes.push({ id, ok: false as const, erro });
    }
  }
  return Response.json({ cotacoes });
}
