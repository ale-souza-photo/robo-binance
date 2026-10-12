import type { NextRequest } from "next/server";
import { bearerConfere } from "@/lib/seguranca";
import { clienteAdmin } from "@/lib/supabase/servidor";
import { criarDependenciasParecer } from "@/servico/real";
import { rodarParecer } from "@/servico/parecer-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Chamado todo dia às 10:00 (Brasília) pelo agendador do Supabase, com Authorization: Bearer CRON_SECRET. Sem IA, sem custo. */
export async function GET(request: NextRequest) {
  if (!bearerConfere(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Não autorizado", { status: 401 });
  }
  try {
    const saida = await rodarParecer(criarDependenciasParecer(clienteAdmin()));
    return Response.json(saida, { status: saida.status === "erro" ? 500 : 200 });
  } catch (e) {
    return Response.json({ status: "erro", erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
