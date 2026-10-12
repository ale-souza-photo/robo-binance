import { Cabecalho } from "@/components/Cabecalho";
import { excluirCaixinha, salvarCaixinha } from "@/app/acoes-caixinhas";
import { cdiAnualDe, rendimento, resumir, taxaAnualCaixinha, type Caixinha } from "@/core/caixinhas";
import { nf, pct, reais } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = {
  nome_invalido: "Dê um nome para a caixinha (até 60 letras).",
  pct_invalido: "Informe a rentabilidade em % do CDI (ex.: 100, 110, 120).",
  saldo_invalido: "O saldo não pode ser negativo.",
  dados_invalidos: "Não entendi o pedido.",
  falha_banco: "Não consegui gravar no banco.",
  salvo: "Caixinha salva.",
  excluida: "Caixinha excluída.",
};

export default async function Caixinhas({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const q = await searchParams;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("caixinhas").select("id,nome,pct_cdi,saldo").order("criado_em");
  const lista: Caixinha[] = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, pctCdi: Number(c.pct_cdi), saldo: Number(c.saldo) }));
  const { data: cdi } = await supabase.from("precos_diarios").select("data,valor").eq("ativo_id", "CDI").order("data", { ascending: false }).limit(64);
  const cdiAnual = cdiAnualDe((cdi ?? []).map((r) => ({ data: r.data as string, valor: Number(r.valor) })).reverse());
  const r = resumir(lista, cdiAnual);
  const msg = q.erro ?? q.ok;
  return (
    <>
      <Cabecalho ativa="caixinhas" />
      <main className="pagina">
        <div className="titulo"><div><h1>Caixinhas</h1>
          <p className="sub">Suas caixinhas de renda fixa, com rentabilidade fixa em % do CDI. Preencha o nome e a % do CDI (o saldo é opcional, mas sem ele não dá para estimar o rendimento). O resumo vai para o parecer diário que o Rockefeller lê.</p></div></div>
        {msg && <div className="aviso-topo">{MSG[msg] ?? msg}</div>}

        <div className="kpis">
          <div className="kpi"><span>CAIXINHAS</span><b>{r.quantidade}</b></div>
          <div className="kpi"><span>TOTAL GUARDADO</span><b>{reais(r.total, 2)}</b></div>
          <div className="kpi"><span>% DO CDI (MÉDIA)</span><b>{r.pctCdiMedio == null ? "—" : `${nf(r.pctCdiMedio, 0)}%`}</b></div>
          <div className="kpi"><span>RENDE POR MÊS*</span><b>{reais(r.rendMes, 2)}</b></div>
          <div className="kpi"><span>CDI AO ANO (HOJE)</span><b>{cdiAnual == null ? "—" : pct(cdiAnual, 2).replace("+", "")}</b></div>
        </div>

        <div className="card">
          <h2>Nova caixinha</h2>
          <form action={salvarCaixinha} className="linha">
            <label className="campo">NOME<input name="nome" required maxLength={60} placeholder="Ex.: Viagem" /></label>
            <label className="campo">% DO CDI<input name="pct" required inputMode="decimal" placeholder="100" /></label>
            <label className="campo">SALDO (R$) · OPCIONAL<input name="saldo" inputMode="decimal" placeholder="0,00" /></label>
            <button className="btn" type="submit">ADICIONAR</button>
          </form>
        </div>

        <div className="card">
          <h2>Suas caixinhas ({lista.length})</h2>
          {lista.length === 0 ? <p className="vazio">Nenhuma caixinha ainda.</p> : (
            <div className="rolagem"><table>
              <thead><tr><th>Nome</th><th>% CDI</th><th>Saldo</th><th>Ao ano*</th><th>Por mês*</th><th></th></tr></thead>
              <tbody>{lista.map((c) => {
                const rd = cdiAnual == null ? null : rendimento(c, cdiAnual);
                return (
                  <tr key={c.id}>
                    <td colSpan={5}>
                      <form action={salvarCaixinha} className="linha">
                        <input type="hidden" name="id" value={c.id} />
                        <label className="campo">NOME<input name="nome" defaultValue={c.nome} maxLength={60} /></label>
                        <label className="campo">% CDI<input name="pct" defaultValue={String(c.pctCdi).replace(".", ",")} inputMode="decimal" style={{ minWidth: 80, width: 90 }} /></label>
                        <label className="campo">SALDO (R$)<input name="saldo" defaultValue={nf(c.saldo, 2)} inputMode="decimal" style={{ minWidth: 110, width: 130 }} /></label>
                        <span className="mut">{cdiAnual == null ? "—" : pct(taxaAnualCaixinha(cdiAnual, c.pctCdi), 2).replace("+", "")} ao ano</span>
                        <span className="pos">{rd ? `+${reais(rd.mes, 2)} por mês` : ""}</span>
                        <button className="btn mini" type="submit">SALVAR</button>
                      </form>
                    </td>
                    <td><form action={excluirCaixinha}><input type="hidden" name="id" value={c.id} /><button className="btn mini perigo" type="submit">EXCLUIR</button></form></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          <p className="sub">*Estimativa com o CDI de hoje, antes do imposto de renda (muitos produtos têm IR sobre o rendimento). A taxa real depende do banco e muda com o CDI. Não é promessa.</p>
        </div>
      </main>
    </>
  );
}
