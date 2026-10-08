import { Cabecalho } from "@/components/Cabecalho";
import { ResultadoView } from "@/components/ResultadoView";
import { rodarAgora } from "@/app/acoes";
import type { ResultadoAnalise } from "@/core/analise";
import { statusEnv, supabaseConfigurado } from "@/lib/config";
import { horaBr } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

function Configuracao() {
  const env = statusEnv();
  return (
    <main className="pagina">
      <div className="titulo"><div><h1>Falta configurar</h1><p className="sub">A plataforma está no ar, mas ainda sem banco de dados. Siga o <code>README.md</code> da pasta <code>plataforma</code>.</p></div></div>
      <div className="card">
        <h2>Variáveis de ambiente</h2>
        <ul className="passos">
          {Object.entries(env).map(([n, ok]) => (
            <li key={n}><code>{n}</code> {ok ? <span className="pos">preenchida</span> : <span className="neg">faltando</span>}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default async function Painel({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!supabaseConfigurado()) return <Configuracao />;
  const q = await searchParams;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("analises").select("id,executado_em,gatilho,status,avisos,resultado").order("executado_em", { ascending: false }).limit(1);
  const a = data?.[0];
  const { data: ativos } = await supabase.from("ativos").select("id,nome");
  const nomes = Object.fromEntries((ativos ?? []).map((x) => [x.id as string, x.nome as string]));
  return (
    <>
      <Cabecalho ativa="painel" />
      <main className="pagina">
        {q.erro && <div className="aviso-topo">A análise falhou. Veja os avisos e confira os ativos cadastrados.</div>}
        <div className="titulo">
          <div>
            <h1>Painel</h1>
            <p className="sub">Análises automáticas às <b>08:00</b> e <b>18:00</b> (Brasília). Saldo e operações são <b>fictícios</b>.</p>
          </div>
          <form action={rodarAgora}><button className="btn" type="submit">RODAR ANÁLISE AGORA</button></form>
        </div>
        {!a ? (
          <div className="card"><p className="vazio">Ainda não há análises. Cadastre ativos na aba ATIVOS (ou carregue o conjunto padrão) e clique em “Rodar análise agora”.</p></div>
        ) : (
          <>
            <div className="card">
              <h2>Última análise</h2>
              <p><span className={`chip ${a.status}`}>{String(a.status).toUpperCase()}</span> <span className="mut">{horaBr(a.executado_em as string)} · {String(a.gatilho).replace("_", " ")}</span></p>
              {Array.isArray(a.avisos) && a.avisos.length > 0 && (
                <ul className="avisos" style={{ marginTop: 10 }}>{(a.avisos as string[]).map((v, i) => <li key={i}>⚠ {v}</li>)}</ul>
              )}
            </div>
            {a.resultado ? <ResultadoView r={a.resultado as ResultadoAnalise} nomes={nomes} /> : <p className="vazio">Esta execução não gerou resultado.</p>}
          </>
        )}
      </main>
    </>
  );
}
