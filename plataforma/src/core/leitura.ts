import type { Estatisticas } from "./estatisticas";
import type { ResultadoDca } from "./carteira";

export const NOMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  DOLAR: "Dólar",
  CDI: "CDI (renda fixa)",
  BOVA11: "Ibovespa (BOVA11)",
  IVVB11: "S&P 500 em R$ (IVVB11)",
};

/** Percentual com sinal e vírgula: 0.546 -> '+54,6%'. */
export function pct(x: number | null | undefined, d = 1): string {
  if (x == null) return "—";
  const t = (100 * x).toFixed(d).replace(".", ",");
  return (x >= 0 ? "+" : "") + t + "%";
}

const virg = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

/** Frases em português simples, geradas dos números. Descrevem o PASSADO. */
export function leituraRapida(
  stats: Record<string, Estatisticas>,
  nomesCorr: string[],
  corr: Record<string, Record<string, number>>,
  carteiras: Record<string, Pick<ResultadoDca, "valorFinal" | "piorQuedaNoPapel">>,
  nomes: Record<string, string> = NOMES,
): string[] {
  const frases: string[] = [];
  const nome = (k: string) => nomes[k] ?? k;
  const cdi = stats["CDI"];
  if (cdi) {
    const abaixo = Object.keys(stats).filter((k) => k !== "CDI" && stats[k].cagr < cdi.cagr).map(nome);
    frases.push(
      `O CDI rendeu ${pct(cdi.cagr)} ao ano, quase sem oscilar. ` +
        (abaixo.length
          ? `Ficaram abaixo dele no período: ${abaixo.join(", ")}. Nesses casos, o risco não foi pago pelo retorno.`
          : "Todos os outros ativos renderam mais que ele, mas com oscilação bem maior."),
    );
  }
  const risco = Object.keys(stats).filter((k) => k !== "CDI");
  if (risco.length) {
    const m = risco.reduce((a, b) => (stats[b].cagr > stats[a].cagr ? b : a));
    const quedaM = (100 * stats[m].piorQueda).toFixed(0);
    frases.push(
      `Maior retorno anual: ${nome(m)} (${pct(stats[m].cagr)} ao ano), com pior queda de ${quedaM}%. Ou seja, em algum momento ` +
        `quem tinha esse ativo viu o valor cair quase ${quedaM}% antes de se recuperar.`,
    );
    const comCalmar = risco.filter((k) => stats[k].calmar != null);
    if (comCalmar.length) {
      const b = comCalmar.reduce((x, y) => ((stats[y].calmar as number) > (stats[x].calmar as number) ? y : x));
      frases.push(
        `Melhor retorno por ponto de queda: ${nome(b)} (${virg(stats[b].calmar as number)}). Quanto maior, mais retorno ` +
          "você teve para cada ponto de risco que aguentou.",
      );
    }
    for (const k of risco) {
      const s = stats[k];
      if (s.pos12m != null && s.pos12m < 0.75) {
        frases.push(
          `${nome(k)}: em ${(100 * (1 - s.pos12m)).toFixed(0)}% das janelas de 12 meses o resultado foi NEGATIVO ` +
            `(pior janela: ${pct(s.pior12m, 0)}). Quem precisasse do dinheiro nessa hora teria perdido.`,
        );
      }
    }
  }
  const pares: [string, string, number][] = [];
  nomesCorr.forEach((a, i) => {
    for (const b of nomesCorr.slice(i + 1)) pares.push([a, b, corr[a][b]]);
  });
  const fmt = ([a, b, c]: [string, string, number]) => `${nome(a)} e ${nome(b)} (${virg(c)})`;
  const juntos = [...pares].sort((x, y) => y[2] - x[2]).filter((p) => p[2] >= 0.7).slice(0, 4).map(fmt);
  const soltos = [...pares].sort((x, y) => Math.abs(x[2]) - Math.abs(y[2])).filter((p) => Math.abs(p[2]) <= 0.2).slice(0, 4).map(fmt);
  if (juntos.length) frases.push(`Andam muito juntos (correlação alta): ${juntos.join("; ")}. Dividir dinheiro entre eles diversifica pouco.`);
  if (soltos.length) {
    frases.push(`Têm pouca relação entre si (os pares mais independentes): ${soltos.join("; ")}. É aí que a diversificação ajuda mais.`);
  }
  const nc = Object.keys(carteiras);
  if (nc.length) {
    const melhor = nc.reduce((a, b) => (carteiras[b].valorFinal > carteiras[a].valorFinal ? b : a));
    const menor = nc.reduce((a, b) => (carteiras[b].piorQuedaNoPapel < carteiras[a].piorQuedaNoPapel ? b : a));
    frases.push(
      `Nas carteiras simuladas com os seus aportes, a que mais acumulou foi '${melhor}' e a que menos chegou a valer menos que o ` +
        `aportado foi '${menor}'. Em geral, quem mais ganha é quem mais oscila.`,
    );
  }
  frases.push(
    "Tudo isso é o PASSADO: o que veio antes não garante o que vem depois, e cada ativo pode ter um período futuro muito diferente. " +
      "Não é recomendação de investimento.",
  );
  return frases;
}
