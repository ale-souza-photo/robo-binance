import { adicionarAtivo } from "@/app/acoes";
import { pct, reais, dataBr } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";

type Linha = { ticker: string; nome: string; posicao: number; preco: number; var_dia: number | null; ret_30d: number; data: string };

/** Os 10 BDRs em destaque do último dia calculado (cron nos dias úteis, 18:30). Cada um pode ser adicionado às análises com um clique. */
export async function DestaquesBdr() {
  const supabase = await clienteServidor();
  const { data: ultima } = await supabase.from("destaques_bdr").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
  const { data: cad } = await supabase.from("ativos").select("id");
  const cadastrados = new Set((cad ?? []).map((a) => a.id as string));
  let linhas: Linha[] = [];
  if (ultima?.data) {
    const { data } = await supabase.from("destaques_bdr").select("ticker,nome,posicao,preco,var_dia,ret_30d,data").eq("data", ultima.data).order("posicao");
    linhas = (data ?? []).map((r) => ({
      ticker: r.ticker as string, nome: r.nome as string, posicao: Number(r.posicao), preco: Number(r.preco),
      var_dia: r.var_dia == null ? null : Number(r.var_dia), ret_30d: Number(r.ret_30d), data: r.data as string,
    }));
  }
  return (
    <div className="card">
      <h2>Destaques do dia · BDRs {linhas[0] && <span className="mut">· {dataBr(linhas[0].data)}</span>}</h2>
      {linhas.length === 0 ? (
        <p className="vazio">Ainda sem destaques. Eles são atualizados nos dias úteis às 18:30 (Brasília).</p>
      ) : (
        <>
          <div className="rolagem"><table>
            <thead><tr><th>#</th><th>BDR</th><th>Preço</th><th>No dia</th><th>30 dias</th><th></th></tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.ticker}>
                <td>{l.posicao}</td>
                <td className="nome-regra"><b>{l.ticker}</b><br /><small className="mut">{l.nome}</small></td>
                <td>{reais(l.preco, 2)}</td>
                <td className={l.var_dia == null ? "mut" : l.var_dia >= 0 ? "pos" : "neg"}>{pct(l.var_dia, 2)}</td>
                <td className={l.ret_30d >= 0 ? "pos" : "neg"}>{pct(l.ret_30d, 1)}</td>
                <td>
                  {cadastrados.has(l.ticker) ? <span className="chip ok">JÁ ACOMPANHADO</span> : (
                    <form action={adicionarAtivo}>
                      <input type="hidden" name="tipo" value="bdr" /><input type="hidden" name="codigo" value={l.ticker} /><input type="hidden" name="nome" value={l.nome} />
                      <button className="btn mini" type="submit">ACOMPANHAR</button>
                    </form>
                  )}
                </td>
              </tr>))}</tbody>
          </table></div>
          <p className="sub">Critério: entre os BDRs mais negociados do dia, os 10 com maior retorno nos últimos 30 dias. Retorno passado não indica o que vem depois, e esta lista muda de um dia para o outro. Não é recomendação.</p>
        </>
      )}
    </div>
  );
}
