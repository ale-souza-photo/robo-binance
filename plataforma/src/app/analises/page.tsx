import Link from "next/link";
import { Cabecalho } from "@/components/Cabecalho";
import { horaBr } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

export default async function Analises() {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("analises").select("id,executado_em,gatilho,status,ativos").order("executado_em", { ascending: false }).limit(60);
  const lista = data ?? [];
  return (
    <>
      <Cabecalho ativa="analises" />
      <main className="pagina">
        <div className="titulo"><div><h1>Histórico de análises</h1><p className="sub">Cada execução automática (manhã e tarde) e manual fica guardada.</p></div></div>
        <div className="card">
          {lista.length === 0 ? <p className="vazio">Nada ainda.</p> : (
            <div className="rolagem"><table>
              <thead><tr><th>Quando</th><th>Origem</th><th>Status</th><th>Ativos</th></tr></thead>
              <tbody>{lista.map((a) => (
                <tr key={a.id as string}>
                  <td><Link href={`/analises/${a.id}`}>{horaBr(a.executado_em as string)}</Link></td>
                  <td>{String(a.gatilho).replace("_", " ")}</td>
                  <td><span className={`chip ${a.status}`}>{String(a.status).toUpperCase()}</span></td>
                  <td>{(a.ativos as string[]).join(", ")}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      </main>
    </>
  );
}
