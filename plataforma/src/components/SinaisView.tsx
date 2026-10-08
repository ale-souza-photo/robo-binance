import { Cabecalho } from "@/components/Cabecalho";
import type { AvaliacaoRegra, Selo } from "@/core/backtest-regras";
import type { Cartao } from "@/core/sinais-cartao";
import { dataBr, nf, pct, queda, reais } from "@/lib/format";

const SELO: Record<Selo, { texto: string; classe: string }> = {
  indicio: { texto: "INDÍCIO, NÃO CONFIRMADO", classe: "selo-indicio" },
  menos_risco: { texto: "MENOS QUEDA (FICA FORA PARTE DO TEMPO)", classe: "selo-menos_risco" },
  sem_vantagem: { texto: "SEM VANTAGEM COMPROVADA", classe: "selo-sem_vantagem" },
  insuficiente: { texto: "DADOS INSUFICIENTES", classe: "selo-insuficiente" },
};

function Linha({ a }: { a: AvaliacaoRegra }) {
  const s = SELO[a.selo];
  const t = a.teste;
  return (
    <tr>
      <td className="nome-regra" title={a.descricao}>{a.nome}<br /><small className="mut">{a.leitura}</small></td>
      <td>{a.sinalAgora == null ? "—" : a.sinalAgora === 1 ? <span className="pos">DENTRO</span> : <span className="mut">FORA</span>}{t ? <><br /><small className="mut">ficou dentro {nf(100 * t.momento.exposicao, 0)}% do teste</small></> : null}</td>
      <td>{t ? <>{pct(t.regra.retorno, 0)}<br /><small className="mut">compr. e manter {pct(t.base.retorno, 0)}</small></> : "—"}</td>
      <td>{t ? <>{queda(t.regra.quedaMax)}<br /><small className="mut">compr. e manter {queda(t.base.quedaMax)}</small></> : "—"}</td>
      <td>{a.trades}</td>
      <td style={{ textAlign: "left" }}><span className={`selo ${s.classe}`}>{s.texto}</span><br /><small className="mut">{a.motivo}</small></td>
    </tr>
  );
}

export function SinaisView({ cartoes }: { cartoes: Cartao[] }) {
  return (
    <>
      <Cabecalho ativa="sinais" />
      <main className="pagina">
        <div className="titulo">
          <div>
            <h1>Sinais e protocolos</h1>
            <p className="sub">
              Regras simples aplicadas ao seu histórico de preços, <b>cada uma com a evidência ao lado</b>: como ela teria ido contra apenas comprar e manter,
              já descontando taxa e slippage, num período de <b>treino</b> (70%) e num de <b>teste</b> (30% finais, que a regra não viu).
            </p>
          </div>
        </div>

        <div className="aviso-topo">
          Isto NÃO é recomendação de compra ou venda. Nos nossos testes, nenhuma estratégia de trade superou comprar e manter de forma confiável. O selo padrão é
          “sem vantagem comprovada”. O selo “indício” só aparece com evidência estatística forte (medimos que, em dados sem nenhuma vantagem real, ele aparece
          em cerca de 1 caso a cada 500), e mesmo assim não é confirmação. “Menos queda” só diz que a regra ficou fora parte do tempo, o que reduz a queda
          por construção; não prova que ela acerta o momento.
        </div>

        {cartoes.length === 0 && <div className="card"><p className="vazio">Nenhum ativo negociável cadastrado. Vá em ATIVOS e carregue o conjunto padrão.</p></div>}

        {cartoes.map((c) => (
          <div className="card" key={c.id}>
            <h2>{c.id} · {c.nome}</h2>
            {c.curto ? (
              <p className="vazio">Só {c.n} dias de histórico salvo. Rode a análise no Painel para baixar mais.</p>
            ) : (
              <>
                <p className="sub" style={{ marginTop: 0 }}>
                  Último fechamento {reais(c.ultimo, c.ultimo < 10 ? 4 : 2)} ({dataBr(c.ultimaData)}). Histórico de {dataBr(c.primeiraData)} a {dataBr(c.ultimaData)} ({nf(c.n, 0)} dias).
                  Só comprar e manter nesse período: <b className={c.geral.retorno >= 0 ? "pos" : "neg"}>{pct(c.geral.retorno, 0)}</b> com queda máxima de <b className="neg">{queda(c.geral.quedaMax)}</b>.
                </p>
                <div className="rolagem"><table>
                  <thead><tr><th>Regra</th><th>Hoje</th><th>Retorno no teste</th><th>Queda máx. no teste</th><th>Operações</th><th style={{ textAlign: "left" }}>Evidência</th></tr></thead>
                  <tbody>{c.regras.map((a) => <Linha key={a.regraId} a={a} />)}</tbody>
                </table></div>
              </>
            )}
          </div>
        ))}

        <div className="card">
          <h2>Protocolos de disciplina</h2>
          <ol className="passos">
            <li><b>Aporte regular (DCA).</b> Mesmo valor, em dias fixos, sem tentar adivinhar o melhor momento. É o método que o laboratório não conseguiu bater de forma confiável.</li>
            <li><b>Um sinal sem “vantagem comprovada” não é motivo para mudar de plano.</b> Se o selo for esse, trate como curiosidade, não como ordem.</li>
            <li><b>As travas valem sempre:</b> não gastar mais que o caixa, não vender o que não tem, parar de comprar se o patrimônio cair 20% abaixo do aportado, e não operar com preço desatualizado.</li>
            <li><b>Dinheiro real só depois de validar.</b> Primeiro a simulação (CARTEIRA), por meses, com custos reais da sua corretora. Esta plataforma não envia nenhuma ordem real.</li>
          </ol>
        </div>
      </main>
    </>
  );
}
