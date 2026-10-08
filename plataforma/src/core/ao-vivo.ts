/**
 * Núcleo do mercado ao vivo (funções puras, sem rede): símbolos, URLs e leitura das mensagens da Binance.
 * A conexão em si (WebSocket) fica no componente de tela; aqui só o que dá para testar offline.
 */

export type Tick = { simbolo: string; preco: number; abertura: number | null; maxima: number | null; minima: number | null };

/** 'BTC/BRL' -> 'BTCBRL'. Devolve null se não parecer um par válido. */
export function simboloBinance(ref: string): string | null {
  const m = /^([A-Z0-9]{2,12})\/([A-Z0-9]{2,6})$/.exec(ref.trim().toUpperCase());
  return m ? m[1] + m[2] : null;
}

/** Endereço do stream combinado (miniTicker = último preço e abertura de 24h, uma mensagem por segundo por par). */
export function urlStream(simbolos: string[]): string {
  const s = simbolos.map((x) => `${x.toLowerCase()}@miniTicker`).join("/");
  return `wss://stream.binance.com:9443/stream?streams=${s}`;
}

/** Mesma consulta de 24 h, pelo endereço público de dados da Binance (o que os servidores da Vercel usam: ver baixarBinance). */
export function urlTicker24hServidor(simbolos: string[]): string {
  return `https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(simbolos))}`;
}

/** Reserva quando o WebSocket não conecta: consulta de 24h de vários pares de uma vez. */
export function urlTicker24h(simbolos: string[]): string {
  return `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(simbolos))}`;
}

const num = (x: unknown): number | null => {
  const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Lê uma mensagem do stream (com ou sem o envelope `{stream, data}`). Mensagem estranha vira null. */
export function lerMensagem(bruta: unknown): Tick | null {
  const msg = bruta as { data?: unknown } | null;
  const d = (msg && typeof msg === "object" && "data" in msg && msg.data ? msg.data : bruta) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return null;
  const simbolo = typeof d.s === "string" ? d.s.toUpperCase() : null;
  const preco = num(d.c);
  if (!simbolo || preco == null) return null;
  return { simbolo, preco, abertura: num(d.o), maxima: num(d.h), minima: num(d.l) };
}

/** Lê a resposta de /ticker/24hr (lista de pares). Itens inválidos são ignorados. */
export function lerTicker24h(json: unknown): Tick[] {
  if (!Array.isArray(json)) return [];
  const saida: Tick[] = [];
  for (const d of json as Record<string, unknown>[]) {
    const simbolo = typeof d?.symbol === "string" ? d.symbol.toUpperCase() : null;
    const preco = num(d?.lastPrice);
    if (simbolo && preco != null) saida.push({ simbolo, preco, abertura: num(d.openPrice), maxima: num(d.highPrice), minima: num(d.lowPrice) });
  }
  return saida;
}

/** Variação em relação à abertura de 24h (0,012 = +1,2%). Sem abertura válida, null. */
export function variacao(preco: number, abertura: number | null): number | null {
  return abertura && abertura > 0 ? preco / abertura - 1 : null;
}

/** Linha de um gráfico simples (SVG path) a partir dos valores, ajustada à caixa w×h. */
export function caminhoLinha(valores: number[], w: number, h: number, margem = 2): string {
  const v = valores.filter((x) => Number.isFinite(x));
  if (v.length < 2) return "";
  const min = Math.min(...v);
  const max = Math.max(...v);
  const faixa = max - min || 1;
  const passo = (w - 2 * margem) / (v.length - 1);
  return v
    .map((x, i) => `${i === 0 ? "M" : "L"}${(margem + i * passo).toFixed(1)},${(margem + (h - 2 * margem) * (1 - (x - min) / faixa)).toFixed(1)}`)
    .join("");
}

/** 'há 5 s', 'há 3 min', 'há 2 h'. */
export function idadeTexto(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}
