import type { NextRequest } from "next/server";
import { PADROES_ANALISE } from "@/lib/config";
import { bearerConfere } from "@/lib/seguranca";
import { clienteAdmin } from "@/lib/supabase/servidor";
import { criarDependencias } from "@/servico/real";
import { gatilhoDaChamada, rodarAnalise } from "@/servico/analise-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chamado às 08:00 e 18:00 (Brasília) pelo agendador do Supabase (`?gatilho=cron_manha|cron_tarde`) ou pela Vercel,
 * sempre com o cabeçalho Authorization: Bearer CRON_SECRET. Sem o segredo certo, 401.
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!bearerConfere(request.headers.get("authorization"), segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const deps = criarDependencias(clienteAdmin(), process.env.BRAPI_TOKEN);
    const saida = await rodarAnalise(deps, {
      gatilho: gatilhoDaChamada(request.headers.get("x-vercel-cron-schedule"), request.nextUrl.searchParams.get("gatilho")),
      inicial: PADROES_ANALISE.inicial,
      mensal: PADROES_ANALISE.mensal,
      dia: PADROES_ANALISE.dia,
    });
    return Response.json(saida, { status: saida.status === "erro" ? 500 : 200 });
  } catch (e) {
    return Response.json({ status: "erro", erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
