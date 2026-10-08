import type { NextRequest } from "next/server";
import { exigir, PADROES_ANALISE } from "@/lib/config";
import { clienteAdmin } from "@/lib/supabase/servidor";
import { criarDependencias } from "@/servico/real";
import { gatilhoDoCron, rodarAnalise } from "@/servico/analise-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chamado pela Vercel (manhã e tarde) ou à mão com o cabeçalho Authorization: Bearer CRON_SECRET. */
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const deps = criarDependencias(clienteAdmin(), process.env.BRAPI_TOKEN);
    const saida = await rodarAnalise(deps, {
      gatilho: gatilhoDoCron(request.headers.get("x-vercel-cron-schedule")),
      inicial: PADROES_ANALISE.inicial,
      mensal: PADROES_ANALISE.mensal,
      dia: PADROES_ANALISE.dia,
    });
    return Response.json(saida, { status: saida.status === "erro" ? 500 : 200 });
  } catch (e) {
    return Response.json({ status: "erro", erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
