import { Cabecalho } from "@/components/Cabecalho";
import { adicionarAtivo, alternarAtivo, carregarPadrao, removerAtivo } from "@/app/acoes";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = {
  dados_invalidos: "Código inválido (use só letras e números, ex.: AAPL34).",
  ja_existe: "Esse ativo já está cadastrado.",
  falha_banco: "Não consegui gravar no banco.",
  adicionado: "Ativo adicionado.",
  padrao: "Conjunto padrão carregado.",
};

export default async function Ativos({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const q = await searchParams;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("ativos").select("id,nome,tipo,fonte,ativo").order("id");
  const lista = data ?? [];
  const msg = q.erro ?? q.ok;
  return (
    <>
      <Cabecalho ativa="ativos" />
      <main className="pagina">
        <div className="titulo"><div><h1>Ativos</h1><p className="sub">Escolha o que entra nas análises. BDRs, ações e ETFs da B3 usam o código da bolsa (ex.: <code>AAPL34</code>, <code>BOVA11</code>).</p></div>
          <form action={carregarPadrao}><button className="btn" type="submit">CARREGAR CONJUNTO PADRÃO</button></form></div>
        {msg && <div className="aviso-topo">{MSG[msg] ?? msg}</div>}
        <div className="card">
          <h2>Adicionar</h2>
          <form action={adicionarAtivo} className="linha">
            <label className="campo">TIPO<select name="tipo" defaultValue="bdr"><option value="bdr">BDR</option><option value="acao">Ação</option><option value="etf">ETF</option><option value="cripto">Cripto (par em R$)</option></select></label>
            <label className="campo">CÓDIGO<input name="codigo" required placeholder="AAPL34" maxLength={15} /></label>
            <label className="campo">NOME<input name="nome" placeholder="Apple (BDR)" /></label>
            <button className="btn" type="submit">ADICIONAR</button>
          </form>
        </div>
        <div className="card">
          <h2>Cadastrados ({lista.length})</h2>
          {lista.length === 0 ? <p className="vazio">Nenhum ativo ainda.</p> : (
            <div className="rolagem"><table>
              <thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Fonte</th><th>Em uso</th><th></th></tr></thead>
              <tbody>{lista.map((a) => (
                <tr key={a.id as string}>
                  <td>{a.id as string}</td><td>{a.nome as string}</td><td>{a.tipo as string}</td><td>{a.fonte as string}</td>
                  <td>
                    <form action={alternarAtivo}><input type="hidden" name="id" value={a.id as string} /><input type="hidden" name="ativar" value={a.ativo ? "0" : "1"} />
                      <button className="btn mini" type="submit">{a.ativo ? "SIM" : "NÃO"}</button></form>
                  </td>
                  <td><form action={removerAtivo}><input type="hidden" name="id" value={a.id as string} /><button className="btn mini perigo" type="submit">REMOVER</button></form></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
      </main>
    </>
  );
}
