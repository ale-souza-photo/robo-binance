import type { SupabaseClient } from "@supabase/supabase-js";
import { lerTicker24h, urlTicker24hServidor } from "@/core/ao-vivo";
import { bearerConfere } from "@/lib/seguranca";
import { clienteAdmin } from "@/lib/supabase/servidor";
import { carregarMovimentos, ultimosPrecos } from "@/servico/carteira-db";
import { cotacaoBolsa } from "@/servico/cotacao-bolsa";
import { type AtivoLinha, type DepsWidget, gerarWidget } from "@/servico/widget-dados";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function depsReais(db: SupabaseClient<any, any, any>): DepsWidget {
  return {
    async ativos() {
      const { data, error } = await db.from("ativos").select("id,nome,tipo,referencia,user_id").eq("ativo", true).order("id");
      if (error) throw new Error(error.message);
      return (data ?? []) as AtivoLinha[];
    },
    fechamentos: (ids) => ultimosPrecos(db, ids),
    async contaEspelho(donoId) {
      const { data } = await db.from("contas_teste").select("id,nome,espelha_reserva,criado_em").eq("user_id", donoId).order("espelha_reserva", { ascending: false }).order("criado_em").limit(1);
      return data?.[0] ? { id: data[0].id as string, nome: data[0].nome as string } : null;
    },
    movimentos: (contaId) => carregarMovimentos(db, contaId),
    async ticks24h(simbolos) {
      const r = await fetch(urlTicker24hServidor(simbolos), { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return lerTicker24h(await r.json());
    },
    cotacaoBolsa: (ticker) => cotacaoBolsa(ticker, process.env.BRAPI_TOKEN),
    agora: () => new Date(),
  };
}

/**
 * Dados para o widget do iPhone (Scriptable): ativos do mercado e a linha do saldo da conta de teste.
 * Protegido por um token só deste endereço (WIDGET_TOKEN): se vazar, só mostra preços e saldo fictício e nunca dá acesso à conta.
 */
export async function GET(request: Request) {
  if (!bearerConfere(request.headers.get("authorization"), process.env.WIDGET_TOKEN)) {
    return new Response("Não autorizado", { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const payload = await gerarWidget(depsReais(clienteAdmin()));
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("widget falhou:", e);
    return Response.json({ erro: "falha ao montar os dados" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
