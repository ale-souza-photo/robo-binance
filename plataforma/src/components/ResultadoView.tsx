import type { ResultadoAnalise } from "@/core/analise";
import { NOMES } from "@/core/leitura";
import { dataBr, nf, pct, queda, reais } from "@/lib/format";

const cor = (n: number | null | undefined) => (n == null ? "" : n >= 0 ? "pos" : "neg");

export function ResultadoView({ r, nomes = {} }: { r: ResultadoAnalise; nomes?: Record<string, string> }) {
  const nome = (k: string) => nomes[k] ?? NOMES[k] ?? k;
  const ativos = Object.keys(r.stats);
  return (
    <>
      <div className="card">
        <h2>Leitura rápida · {dataBr(r.periodo.inicio)} a {dataBr(r.periodo.fim)} ({nf(r.periodo.anos, 1)} anos)</h2>
        <ul className="frases">
          {r.frases.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Cada ativo, sozinho</h2>
        <div className="rolagem">
          <table>
            <thead>
              <tr><th>Ativo</th><th>Retorno total</th><th>Ao ano</th><th>Oscilação</th><th>Pior queda</th><th>Em 12 meses: positivo</th><th>Pior 12m</th></tr>
            </thead>
            <tbody>
              {ativos.map((k) => {
                const s = r.stats[k];
                return (
                  <tr key={k}>
                    <td className="nome">{nome(k)}</td>
                    <td className={cor(s.retornoTotal)}>{pct(s.retornoTotal, 0)}</td>
                    <td className={cor(s.cagr)}>{pct(s.cagr)}</td>
                    <td>{pct(s.vol, 0).replace("+", "")}</td>
                    <td className="neg">{queda(s.piorQueda)}</td>
                    <td>{s.pos12m == null ? "—" : `${nf(100 * s.pos12m, 0)}%`}</td>
                    <td className={cor(s.pior12m)}>{pct(s.pior12m, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>Carteiras simuladas com aportes</h2>
        {Object.keys(r.carteiras).length === 0 ? (
          <p className="vazio">Nenhuma carteira pôde ser simulada com os ativos disponíveis.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr><th>Carteira</th><th>Aportado</th><th>Valor final</th><th>Ganho</th><th>Retorno ao ano (TIR)</th><th>Pior queda no papel</th><th>Tempo no prejuízo</th></tr>
              </thead>
              <tbody>
                {Object.entries(r.carteiras).map(([n, c]) => (
                  <tr key={n}>
                    <td className="nome">{n}</td>
                    <td>{reais(c.aportado)}</td>
                    <td>{reais(c.valorFinal)}</td>
                    <td className={cor(c.ganho)}>{reais(c.ganho)}</td>
                    <td className={cor(c.tir)}>{pct(c.tir)}</td>
                    <td className="neg">{queda(c.piorQuedaNoPapel)}</td>
                    <td>{nf(100 * c.pctNoPrejuizo, 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.carteirasIgnoradas.length > 0 && (
          <p className="sub">
            Ignoradas por falta de dados: {r.carteirasIgnoradas.map((c) => `${c.nome} (faltam ${c.faltam.join(", ")})`).join("; ")}.
          </p>
        )}
      </div>
      <p className="sub">Passado não garante futuro. Isto é simulação com dinheiro fictício, não recomendação de investimento.</p>
    </>
  );
}
