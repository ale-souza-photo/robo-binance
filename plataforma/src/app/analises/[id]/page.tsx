import { notFound } from "next/navigation";
import { Cabecalho } from "@/components/Cabecalho";
import { ResultadoView } from "@/components/ResultadoView";
import type { ResultadoAnalise } from "@/core/analise";
import { horaBr } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

export default async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await clienteServidor();
  const { data: a } = await supabase.from("analises").select("executado_em,gatilho,status,avisos,resultado").eq("id", id).maybeSingle();
  if (!a) notFound();
  const { data: ativos } = await supabase.from("ativos").select("id,nome");
  const nomes = Object.fromEntries((ativos ?? []).map((x) => [x.id as string, x.nome as string]));
  return (
    <>
      <Cabecalho ativa="analises" />
      <main className="pagina">
        <div className="titulo"><div><h1>Análise de {horaBr(a.executado_em as string)}</h1>
          <p className="sub"><span className={`chip ${a.status}`}>{String(a.status).toUpperCase()}</span> {String(a.gatilho).replace("_", " ")}</p></div></div>
        {Array.isArray(a.avisos) && a.avisos.length > 0 && <ul className="avisos">{(a.avisos as string[]).map((v, i) => <li key={i}>⚠ {v}</li>)}</ul>}
        {a.resultado ? <ResultadoView r={a.resultado as ResultadoAnalise} nomes={nomes} /> : <p className="vazio">Sem resultado.</p>}
      </main>
    </>
  );
}
