import { describe, expect, it } from "vitest";
import { caminhoLinha, idadeTexto, lerMensagem, lerTicker24h, simboloBinance, urlStream, urlTicker24h, variacao } from "@/core/ao-vivo";
import { baixarCotacaoBrapi, parseCotacaoBrapi, urlCotacaoBrapi } from "@/dados/bolsa";

describe("símbolos e endereços da Binance", () => {
  it("converte o par e recusa lixo", () => {
    expect(simboloBinance("BTC/BRL")).toBe("BTCBRL");
    expect(simboloBinance(" eth/brl ")).toBe("ETHBRL");
    for (const x of ["BTC", "BTC/", "/BRL", "BTC/BRL/X", "BT C/BRL", "../BRL", ""]) expect(simboloBinance(x)).toBeNull();
  });
  it("monta o stream combinado em minúsculas", () => {
    expect(urlStream(["BTCBRL", "ETHBRL"])).toBe("wss://stream.binance.com:9443/stream?streams=btcbrl@miniTicker/ethbrl@miniTicker");
  });
  it("monta a consulta de reserva com a lista codificada", () => {
    const u = urlTicker24h(["BTCBRL", "ETHBRL"]);
    expect(u).toContain("/api/v3/ticker/24hr?symbols=");
    expect(decodeURIComponent(u.split("symbols=")[1])).toBe('["BTCBRL","ETHBRL"]');
  });
});

describe("leitura das mensagens", () => {
  const dados = { e: "24hrMiniTicker", s: "BTCBRL", c: "419307.00", o: "410000.00", h: "420000.00", l: "405000.00", v: "10", q: "9" };
  it("com e sem o envelope do stream combinado", () => {
    const esperado = { simbolo: "BTCBRL", preco: 419307, abertura: 410000, maxima: 420000, minima: 405000 };
    expect(lerMensagem({ stream: "btcbrl@miniTicker", data: dados })).toEqual(esperado);
    expect(lerMensagem(dados)).toEqual(esperado);
  });
  it("mensagem quebrada, sem preço ou com preço inválido vira null (nunca um preço falso)", () => {
    for (const x of [null, undefined, 5, "x", {}, { s: "BTCBRL" }, { s: "BTCBRL", c: "0" }, { s: "BTCBRL", c: "abc" }, { s: "BTCBRL", c: "-3" }, { c: "10" }, { data: null }]) {
      expect(lerMensagem(x)).toBeNull();
    }
  });
  it("abertura ausente não impede o preço", () => {
    expect(lerMensagem({ s: "ETHBRL", c: "15000" })).toEqual({ simbolo: "ETHBRL", preco: 15000, abertura: null, maxima: null, minima: null });
  });
  it("lista de 24h: ignora itens inválidos", () => {
    const r = lerTicker24h([{ symbol: "BTCBRL", lastPrice: "100", openPrice: "90", highPrice: "110", lowPrice: "80" }, { symbol: "X", lastPrice: "0" }, null, {}]);
    expect(r).toEqual([{ simbolo: "BTCBRL", preco: 100, abertura: 90, maxima: 110, minima: 80 }]);
    expect(lerTicker24h({ erro: 1 })).toEqual([]);
  });
});

describe("variação, gráfico e idade", () => {
  it("variação em relação à abertura", () => {
    expect(variacao(110, 100)).toBeCloseTo(0.1, 12);
    expect(variacao(90, 100)).toBeCloseTo(-0.1, 12);
    expect(variacao(100, null)).toBeNull();
    expect(variacao(100, 0)).toBeNull();
  });
  it("caminho do gráfico: sobe é y menor; série curta não desenha; infinito é ignorado", () => {
    const c = caminhoLinha([1, 2, 3], 100, 20, 0);
    expect(c).toBe("M0.0,20.0L50.0,10.0L100.0,0.0");
    expect(caminhoLinha([5], 100, 20)).toBe("");
    expect(caminhoLinha([1, Number.POSITIVE_INFINITY, 2, 3], 100, 20, 0)).toBe(caminhoLinha([1, 2, 3], 100, 20, 0));
    expect(caminhoLinha([7, 7, 7], 100, 20, 0)).not.toContain("NaN"); // série constante não dá divisão por zero
  });
  it("idade em texto", () => {
    expect(idadeTexto(4_000)).toBe("há 4 s");
    expect(idadeTexto(3 * 60_000)).toBe("há 3 min");
    expect(idadeTexto(2 * 3_600_000)).toBe("há 2 h");
    expect(idadeTexto(-50)).toBe("há 0 s");
  });
});

describe("cotação da brapi (formato NÃO verificado contra a API real: leitura defensiva)", () => {
  it("lê preço e hora (epoch em segundos ou ISO)", () => {
    expect(parseCotacaoBrapi({ results: [{ regularMarketPrice: 130.5, regularMarketTime: 1_791_000_000 }] })).toEqual({
      preco: 130.5, hora: new Date(1_791_000_000_000).toISOString(),
    });
    expect(parseCotacaoBrapi({ results: [{ regularMarketPrice: 130.5, regularMarketTime: "2026-10-08T17:00:00.000Z" }] }).hora).toBe("2026-10-08T17:00:00.000Z");
    expect(parseCotacaoBrapi({ results: [{ regularMarketPrice: 10 }] }).hora).toBeNull();
  });
  it("mensagens claras quando a resposta não presta", () => {
    expect(() => parseCotacaoBrapi({})).toThrow(/results/);
    expect(() => parseCotacaoBrapi({ results: [{ regularMarketPrice: 0 }] })).toThrow(/regularMarketPrice/);
    expect(() => parseCotacaoBrapi({ results: [{ regularMarketPrice: "x" }] })).toThrow(/regularMarketPrice/);
  });
  it("pede só a cotação (sem range) e manda o token no cabeçalho, não na URL", async () => {
    expect(urlCotacaoBrapi("BOVA11")).toBe("https://brapi.dev/api/quote/BOVA11");
    let visto: { url: string; auth?: string } | null = null;
    const f = (async (u: string, init?: RequestInit) => {
      visto = { url: u, auth: (init?.headers as Record<string, string>)?.Authorization };
      return new Response(JSON.stringify({ results: [{ regularMarketPrice: 140 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await baixarCotacaoBrapi("BOVA11", f, "segredo")).preco).toBe(140);
    expect(visto).toEqual({ url: "https://brapi.dev/api/quote/BOVA11", auth: "Bearer segredo" });
    const ruim = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(baixarCotacaoBrapi("X", ruim)).rejects.toThrow(/HTTP 401/);
  });
});
