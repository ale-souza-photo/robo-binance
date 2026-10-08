/**
 * Regras simples de sinal (funções puras). Cada regra olha SÓ o passado até o dia t e diz se, ao fechamento
 * do dia t, estaria "dentro" (1) do ativo ou "fora" (0, em caixa). Sem venda a descoberto e sem alavancagem.
 * Janelas contam observações (dias de dado), não dias de calendário.
 */
/** Percentual sem sinal, com vírgula: 0,061 -> '6,1%'. A direção ("acima", "queda") já vai escrita na frase. */
const pct = (x: number) => `${(100 * Math.abs(x)).toFixed(1).replace(".", ",")}%`;

export type Sinal = 0 | 1;

/** Média móvel simples de `n` pontos; null enquanto não há `n` pontos. */
export function sma(v: number[], n: number): (number | null)[] {
  const saida: (number | null)[] = new Array(v.length).fill(null);
  let soma = 0;
  for (let i = 0; i < v.length; i++) {
    soma += v[i];
    if (i >= n) soma -= v[i - n];
    if (i >= n - 1) saida[i] = soma / n;
  }
  return saida;
}

/** RSI de Wilder (suavização exponencial de ganhos e perdas). null até haver `n` variações. */
export function rsi(v: number[], n = 14): (number | null)[] {
  const saida: (number | null)[] = new Array(v.length).fill(null);
  if (v.length <= n) return saida;
  let ganho = 0;
  let perda = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) ganho += d;
    else perda -= d;
  }
  ganho /= n;
  perda /= n;
  const calc = () => (perda === 0 ? (ganho === 0 ? 50 : 100) : 100 - 100 / (1 + ganho / perda));
  saida[n] = calc();
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ganho = (ganho * (n - 1) + Math.max(d, 0)) / n;
    perda = (perda * (n - 1) + Math.max(-d, 0)) / n;
    saida[i] = calc();
  }
  return saida;
}

export type RegraId = "sma200" | "cruz50_200" | "mom90" | "rsi_reversao";

export type Regra = {
  id: RegraId;
  nome: string;
  descricao: string;
  /** Quantas observações a regra precisa antes de opinar. */
  aquecimento: number;
  /** Posição desejada ao fechamento de cada dia (null no aquecimento). */
  posicoes(v: number[]): (Sinal | null)[];
  /** Frase com os números do último dia. */
  leitura(v: number[]): string;
};

const ultimo = <T,>(a: T[]): T => a[a.length - 1];

export const REGRAS: Regra[] = [
  {
    id: "sma200",
    nome: "Acima da média de 200 dias",
    descricao: "Fica comprado enquanto o preço estiver acima da média dos últimos 200 dias; senão, em caixa.",
    aquecimento: 200,
    posicoes(v) {
      const m = sma(v, 200);
      return v.map((p, i) => (m[i] == null ? null : p > (m[i] as number) ? 1 : 0));
    },
    leitura(v) {
      const m = ultimo(sma(v, 200));
      if (m == null) return "Histórico curto demais.";
      const d = ultimo(v) / m - 1;
      return `Preço ${pct(d)} ${d >= 0 ? "acima" : "abaixo"} da média de 200 dias.`;
    },
  },
  {
    id: "cruz50_200",
    nome: "Cruzamento de médias 50 e 200",
    descricao: "Fica comprado quando a média de 50 dias está acima da de 200; senão, em caixa.",
    aquecimento: 200,
    posicoes(v) {
      const a = sma(v, 50);
      const b = sma(v, 200);
      return v.map((_, i) => (b[i] == null ? null : (a[i] as number) > (b[i] as number) ? 1 : 0));
    },
    leitura(v) {
      const a = ultimo(sma(v, 50));
      const b = ultimo(sma(v, 200));
      if (a == null || b == null) return "Histórico curto demais.";
      const d = a / b - 1;
      return `Média de 50 dias ${pct(d)} ${d >= 0 ? "acima" : "abaixo"} da de 200.`;
    },
  },
  {
    id: "mom90",
    nome: "Momento de 90 dias",
    descricao: "Fica comprado se o ativo subiu nos últimos 90 dias; senão, em caixa.",
    aquecimento: 90,
    posicoes(v) {
      return v.map((p, i) => (i < 90 ? null : p > v[i - 90] ? 1 : 0));
    },
    leitura(v) {
      if (v.length <= 90) return "Histórico curto demais.";
      const d = ultimo(v) / v[v.length - 1 - 90] - 1;
      return `${d >= 0 ? "Alta" : "Queda"} de ${pct(d)} em 90 dias.`;
    },
  },
  {
    id: "rsi_reversao",
    nome: "Reversão pelo RSI",
    descricao: "Compra quando o RSI de 14 dias cai abaixo de 30 (queda forte) e vende quando passa de 50; no meio, mantém.",
    aquecimento: 15,
    posicoes(v) {
      const r = rsi(v, 14);
      const saida: (Sinal | null)[] = [];
      let atual: Sinal = 0;
      for (let i = 0; i < v.length; i++) {
        const x = r[i];
        if (x == null) {
          saida.push(null);
          continue;
        }
        if (x < 30) atual = 1;
        else if (x > 50) atual = 0;
        saida.push(atual);
      }
      return saida;
    },
    leitura(v) {
      const x = ultimo(rsi(v, 14));
      if (x == null) return "Histórico curto demais.";
      return `RSI de 14 dias em ${x.toFixed(0)} (abaixo de 30 = queda forte; acima de 70 = alta forte).`;
    },
  },
];
