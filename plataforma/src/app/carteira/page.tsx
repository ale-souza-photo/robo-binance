import Link from "next/link";
import { aportarDca, criarConta, depositar, excluirConta, negociar, sincronizarReserva } from "@/app/acoes-carteira";
import { Cabecalho } from "@/components/Cabecalho";
import { aplicar, avaliar, custosDoTipo, planejarSincronia } from "@/core/paper";
import { dataBr, horaBr, nf, pct, reais } from "@/lib/format";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ativosNegociaveis, carregarMovimentos, lerReservaRockefeller, listarContas, ultimosPrecos, type ReservaRockefeller } from "@/servico/carteira-db";

export const dynamic = "force-dynamic";

const cor = (n: number | null | undefined) => (n == null ? "" : n >= 0 ? "pos" : "neg");
const qtd = (n: number) => nf(n, n < 1 ? 8 : n % 1 === 0 ? 0 : 4);

export default async function Carteira({ searchParams }: { searchParams: Promise<{ conta?: string; ok?: string; erro?: string }> }) {
  const q = await searchParams;
  const supabase = await clienteServidor();
  const contas = await listarContas(supabase);
  const conta = contas.find((c) => c.id === q.conta) ?? contas[0] ?? null;

  const aviso = (
    <>
      {q.erro && <div className="aviso-topo">{q.erro}</div>}
      {q.ok && <div className="aviso-topo" style={{ borderColor: "var(--up)", color: "var(--up)", background: "rgba(46,229,157,.07)" }}>{q.ok}</div>}
    </>
  );

  if (!conta) {
    return (
      <>
        <Cabecalho ativa="carteira" />
        <main className="pagina">
          <div className="titulo"><div><h1>Carteira de teste</h1><p className="sub">Simule compras e vendas com <b>dinheiro fictício</b>, com taxas e variação de preço contra você, como no mercado de verdade.</p></div></div>
          {aviso}
          <div className="card">
            <h2>Criar a primeira conta</h2>
            <form action={criarConta} className="linha" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label className="campo">NOME<input name="nome" required maxLength={60} defaultValue="Minha conta de teste" /></label>
              <label className="chip" style={{ cursor: "pointer", padding: "8px 12px" }}>
                <input type="checkbox" name="espelho" value="1" defaultChecked style={{ minWidth: 0 }} /> ESPELHAR A RESERVA DE EMERGÊNCIA DO ROCKEFELLER (o saldo fictício acompanha o saldo de lá)
              </label>
              <label className="campo">SALDO INICIAL (R$), usado só se NÃO espelhar<input name="saldo" inputMode="decimal" defaultValue="100" /></label>
              <div><button className="btn" type="submit">CRIAR CONTA</button></div>
            </form>
          </div>
        </main>
      </>
    );
  }

  const [movs, ativos] = await Promise.all([carregarMovimentos(supabase, conta.id), ativosNegociaveis(supabase)]);
  const est = aplicar(movs);
  let reserva: ReservaRockefeller | null = null;
  let erroReserva: string | null = null;
  if (conta.espelhaReserva) {
    try {
      reserva = await lerReservaRockefeller(supabase);
    } catch (e) {
      erroReserva = e instanceof Error ? e.message : "Não consegui ler a reserva.";
    }
  }
  let plano: ReturnType<typeof planejarSincronia> | null = null;
  if (reserva) {
    try { plano = planejarSincronia(reserva.valor, est); } catch { plano = null; }
  }
  const precos = await ultimosPrecos(supabase, [...ativos.map((a) => a.id), ...Object.keys(est.posicoes)]);
  const aval = avaliar(est, Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, v.valor])));
  const travaAtiva = est.aportado > 0 && aval.patrimonio <= est.aportado * (1 - conta.travaPerda);
  const recentes = [...movs].reverse().slice(0, 25);

  return (
    <>
      <Cabecalho ativa="carteira" />
      <main className="pagina">
        <div className="titulo">
          <div>
            <h1>{conta.nome}</h1>
            <p className="sub">
              <b>Dinheiro fictício.</b> Preços são o último fechamento salvo (atualizado nas análises de 08:00 e 18:00). Cada ordem paga taxa
              (cripto 0,10%, bolsa 0,03%) e escorrega 0,05% contra você.
            </p>
          </div>
          {contas.length > 1 && (
            <div className="linha">{contas.map((c) => <Link key={c.id} className={`btn mini ${c.id === conta.id ? "" : "perigo"}`} href={`/carteira?conta=${c.id}`}>{c.nome}</Link>)}</div>
          )}
        </div>
        {aviso}
        {travaAtiva && <div className="aviso-topo">Trava de perda ativa: o patrimônio está {nf(100 * conta.travaPerda, 0)}% ou mais abaixo do aportado. Novas compras estão bloqueadas.</div>}
        {aval.semPreco.length > 0 && <div className="aviso-topo">Sem preço salvo para: {aval.semPreco.join(", ")}. Estão contados pelo custo. Rode a análise no Painel.</div>}

        {conta.espelhaReserva && (
          <div className="card">
            <h2>Espelho da reserva de emergência (Rockefeller)</h2>
            {erroReserva ? <p className="vazio">{erroReserva}</p> : !reserva ? <p className="vazio">Não encontrei os dados do Rockefeller para este usuário.</p> : (
              <div className="linha" style={{ justifyContent: "space-between" }}>
                <p className="sub" style={{ margin: 0 }}>
                  Reserva hoje no Rockefeller: <b>{reais(reserva.valor, 2)}</b>
                  {reserva.atualizadoEm ? <> (atualizada em {horaBr(reserva.atualizadoEm)})</> : null}. Já espelhado aqui: <b>{reais(aval.aportado, 2)}</b>.{" "}
                  {plano?.aviso ? <span className="neg">{plano.aviso}</span>
                    : plano?.tipo === "deposito" ? <>Faltam entrar <b className="pos">{reais(plano.valor, 2)}</b>.</>
                    : plano?.tipo === "retirada" ? <>Vão sair <b className="neg">{reais(plano.valor, 2)}</b>.</>
                    : <>Está igual.</>}
                </p>
                <form action={sincronizarReserva}><input type="hidden" name="conta" value={conta.id} /><button className="btn" type="submit">SINCRONIZAR</button></form>
              </div>
            )}
            <p className="sub">Só leitura: o Trader Bit nunca altera nada no Rockefeller. Este saldo é fictício e serve para ver como a sua reserva poderia render investida.</p>
          </div>
        )}

        <div className="kpis">
          <div className="kpi"><span>PATRIMÔNIO</span><b>{reais(aval.patrimonio, 2)}</b></div>
          <div className="kpi"><span>CAIXA</span><b>{reais(aval.caixa, 2)}</b></div>
          <div className="kpi"><span>APORTADO</span><b>{reais(aval.aportado, 2)}</b></div>
          <div className="kpi"><span>RESULTADO</span><b className={cor(aval.resultado)}>{reais(aval.resultado, 2)} <small>{pct(aval.retorno)}</small></b></div>
          <div className="kpi"><span>TAXAS PAGAS</span><b>{reais(aval.taxasPagas, 2)}</b></div>
        </div>

        <div className="card">
          <h2>Posições</h2>
          {aval.posicoes.length === 0 ? <p className="vazio">Nenhuma posição ainda. Faça uma compra ou o DCA do mês abaixo.</p> : (
            <div className="rolagem"><table>
              <thead><tr><th>Ativo</th><th>Quantidade</th><th>Preço médio</th><th>Preço atual</th><th>Valor</th><th>Resultado</th></tr></thead>
              <tbody>{aval.posicoes.map((p) => (
                <tr key={p.ativoId}>
                  <td>{p.ativoId}</td><td>{qtd(p.quantidade)}</td><td>{reais(p.precoMedio, 2)}</td>
                  <td>{p.preco == null ? "—" : reais(p.preco, 2)}<br /><small className="mut">{precos[p.ativoId] ? dataBr(precos[p.ativoId].data) : ""}</small></td>
                  <td>{reais(p.valor, 2)}</td>
                  <td className={cor(p.resultado)}>{reais(p.resultado, 2)}<br /><small>{pct(p.retorno)}</small></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>

        <div className="grade">
          <div className="card c6">
            <h2>Comprar ou vender</h2>
            <form action={negociar} className="linha" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <input type="hidden" name="conta" value={conta.id} />
              <label className="campo">ATIVO
                <select name="ativo" required>
                  {ativos.map((a) => {
                    const p = precos[a.id];
                    return <option key={a.id} value={a.id}>{a.id} — {a.nome}{p ? ` · ${reais(p.valor, 2)} (${dataBr(p.data)})` : " · sem preço"}</option>;
                  })}
                </select>
              </label>
              <label className="campo">COMPRA: VALOR A GASTAR (R$, taxa inclusa)<input name="valor" inputMode="decimal" placeholder="50,00" /></label>
              <label className="campo">VENDA: QUANTIDADE<input name="quantidade" inputMode="decimal" placeholder="0,001" /></label>
              <div className="linha">
                <button className="btn" type="submit" name="lado" value="compra">COMPRAR</button>
                <button className="btn perigo" type="submit" name="lado" value="venda">VENDER</button>
              </div>
              <p className="sub">Cripto aceita frações; bolsa (BDR, ação, ETF) só unidades inteiras, então com pouco dinheiro pode não dar para 1 unidade.</p>
            </form>
          </div>

          <div className="card c6">
            <h2>DCA do mês (aporte recorrente simulado)</h2>
            <form action={aportarDca} className="linha" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <input type="hidden" name="conta" value={conta.id} />
              <label className="campo">VALOR DO APORTE (R$)<input name="valor" inputMode="decimal" defaultValue="50" required /></label>
              <div className="campo">REPARTIR POR IGUAL ENTRE
                <div className="linha" style={{ marginTop: 6 }}>
                  {ativos.map((a) => <label key={a.id} className="chip" style={{ cursor: "pointer" }}><input type="checkbox" name="ativo" value={a.id} style={{ minWidth: 0 }} /> {a.id}</label>)}
                </div>
              </div>
              <button className="btn" type="submit">APORTAR AGORA</button>
              <p className="sub">Só um DCA por ativo a cada mês. Se clicar duas vezes, a segunda é recusada. Tudo entra junto ou nada entra.</p>
            </form>
            {!conta.espelhaReserva && (
              <form action={depositar} className="linha" style={{ marginTop: 14 }}>
                <input type="hidden" name="conta" value={conta.id} />
                <label className="campo">ADICIONAR SALDO FICTÍCIO (R$)<input name="valor" inputMode="decimal" placeholder="100,00" required /></label>
                <button className="btn mini" type="submit">ADICIONAR</button>
              </form>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Últimos movimentos</h2>
          {recentes.length === 0 ? <p className="vazio">Nada ainda.</p> : (
            <div className="rolagem"><table>
              <thead><tr><th>Quando</th><th>Tipo</th><th>Ativo</th><th>Quantidade</th><th>Preço exec.</th><th>Taxa</th><th>Caixa</th></tr></thead>
              <tbody>{recentes.map((m) => (
                <tr key={m.id}>
                  <td>{horaBr(m.criadoEm)}</td>
                  <td>{m.tipo}{m.origem === "dca" ? " (DCA)" : ""}</td>
                  <td>{m.ativoId ?? "—"}</td>
                  <td>{m.quantidade == null ? "—" : qtd(m.quantidade)}</td>
                  <td>{m.precoExec == null ? "—" : reais(m.precoExec, 2)}</td>
                  <td>{m.taxa ? reais(m.taxa, 2) : "—"}</td>
                  <td className={cor(m.caixaDelta)}>{reais(m.caixaDelta, 2)}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <h2>Excluir esta conta</h2>
          <form action={excluirConta} className="linha">
            <input type="hidden" name="conta" value={conta.id} />
            <label className="chip" style={{ cursor: "pointer", padding: "8px 12px" }}>
              <input type="checkbox" name="confirmo" value="1" required style={{ minWidth: 0 }} /> Entendo que isto apaga a conta e todos os movimentos dela (não dá para desfazer)
            </label>
            <button className="btn mini perigo" type="submit">EXCLUIR CONTA</button>
          </form>
        </div>
        <p className="sub">Custos usados: cripto {nf(100 * custosDoTipo("cripto").taxa, 2)}% por lado, bolsa {nf(100 * custosDoTipo("etf").taxa, 2)}%; slippage 0,05%. Simulação: não é recomendação de investimento.</p>
      </main>
    </>
  );
}
