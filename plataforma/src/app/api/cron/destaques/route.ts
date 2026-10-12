import type { NextRequest } from "next/server";
import { bearerConfere } from "@/lib/seguranca";
import { clienteAdmin } from "@/lib/supabase/servidor";
import { criarDependenciasDestaques } from "@/servico/real";
import { rodarDestaques } from "@/servico/destaques-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chamado nos dias úteis às 18:30 (Brasília) pelo agendador do Supabase, com Authorization: Bearer CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!bearerConfere(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const saida = await rodarDestaques(criarDependenciasDestaques(clienteAdmin(), process.env.BRAPI_TOKEN));
    return Response.json(saida, { status: saida.status === "erro" ? 500 : 200 });
  } catch (e) {
    return Response.json({ status: "erro", avisos: [e instanceof Error ? e.message : String(e)] }, { status: 500 });
  }
}
