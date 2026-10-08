import { describe, expect, it } from "vitest";
import { parseKlines, baixarBinance, urlKlines } from "@/dados/binance";
import { parseBcb, baixarBcb, urlBcb, cdiComoIndice } from "@/dados/bcb";
import { parseBrapi, rangeBrapi, baixarBrapi, parseYahoo } from "@/dados/bolsa";
import { carregarSerie } from "@/dados/fontes";
import { ErroFonte, type AtivoDef } from "@/dados/tipos";

const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const dia = (n: number) => 1_700_000_000_000 + n * 86_400_000; // ms de um dia qualquer + n dias
const kline = (n: number, preco: number): unknown[] => [dia(n), "1", "1", "1", String(preco), "1", dia(n) + 86_399_999, "0", 0, "0", "0", "0"];

describe("Binance", () => {
  it("lê fechamentos e descarta o candle de hoje, que ainda está aberto", () => {
    const agora = dia(2) + 1000; // o candle 2 ainda não fechou
    const { serie, total } = parseKlines([kline(0, 100), kline(1, 101), kline(2, 102)], agora);
    expect(total).toBe(3);
    expect(serie.map((p) => p.valor)).toEqual([100, 101]);
    expect(serie[0].data).toBe("2023-11-14");
  });

  it("monta a URL do endereço público de dados e converte o par", () => {
    const u = urlKlines("BTC/BRL", 123);
    expect(u).toContain("data-api.binance.vision");
    expect(u).toContain("symbol=BTCBRL");
    expect(u).toContain("startTime=123");
  });

  it("pagina de 1000 em 1000 e não repete dias", async () => {
    const pedidos: string[] = [];
    const f = (async (url: string) => {
      pedidos.push(url);
      const desde = Number(new URL(url).searchParams.get("startTime"));
      const primeiro = Math.round((desde - 1_700_000_000_000) / 86_400_000);
      const n = pedidos.length === 1 ? 1000 : 30;
      return resp(Array.from({ length: n }, (_, i) => kline(Math.max(0, primeiro) + i, 100 + i)));
    }) as unknown as typeof fetch;
    const agora = new Date(dia(5000));
    const serie = await baixarBinance("ETH/BRL", 5, f, agora);
    expect(pedidos.length).toBe(2);
    expect(Number(new URL(pedidos[1]).searchParams.get("startTime"))).toBeGreaterThan(dia(999));
    expect(new Set(serie.map((p) => p.data)).size).toBe(serie.length);
    expect(serie.length).toBeGreaterThanOrEqual(1000);
  });

  it("explica o erro quando a Binance recusa (ex.: 451 = região bloqueada)", async () => {
    const f = (async () => resp({}, 451)) as unknown as typeof fetch;
    await expect(baixarBinance("BTC/BRL", 1, f)).rejects.toThrow(/HTTP 451/);
  });
});

describe("Banco Central", () => {
  it("lê o JSON do SGS e ignora valores vazios", () => {
    const s = parseBcb([{ data: "02/01/2025", valor: "0.043739" }, { data: "03/01/2025", valor: "" }, { data: "04/01/2025", valor: null }]);
    expect(s).toEqual([{ data: "2025-01-02", valor: 0.043739 }]);
  });

  it("usa datas dd/mm/aaaa na URL", () => {
    expect(urlBcb(12, "2024-03-05", "2025-01-31")).toContain("dataInicial=05/03/2024&dataFinal=31/01/2025");
  });

  it("baixa em janelas de 3 anos e remove repetidos", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => {
      urls.push(u);
      return resp([{ data: "01/06/2024", valor: "5.0" }]);
    }) as unknown as typeof fetch;
    const s = await baixarBcb(1, "2018-01-01", "2025-01-01", f);
    expect(urls.length).toBeGreaterThanOrEqual(3);
    expect(s).toEqual([{ data: "2024-06-01", valor: 5 }]);
  });

  it("acumula o CDI diário em índice", () => {
    const i = cdiComoIndice([{ data: "2025-01-02", valor: 1 }, { data: "2025-01-03", valor: 1 }]);
    expect(i[1].valor).toBeCloseTo(1.01 * 1.01, 12);
  });
});

describe("bolsa brasileira", () => {
  const t0 = 1_735_822_800; // 2025-01-02 13:00 UTC
  it("brapi: usa o preço ajustado quando existe", () => {
    const s = parseBrapi({ results: [{ historicalDataPrice: [{ date: t0, close: 10, adjustedClose: 9.5 }, { date: t0 + 86400, close: 11, adjustedClose: null }] }] });
    expect(s).toEqual([{ data: "2025-01-02", valor: 9.5 }, { data: "2025-01-03", valor: 11 }]);
  });

  it("brapi: mensagens claras quando a resposta não presta", () => {
    expect(() => parseBrapi({ error: true, message: "token" })).toThrow(/token inválido|limite do plano/);
    expect(() => parseBrapi({ results: [{ historicalDataPrice: [] }] })).toThrow(/sem histórico/);
  });

  it("brapi: escolhe o intervalo e manda o token no cabeçalho, não na URL", async () => {
    expect(rangeBrapi(0.2)).toBe("3mo");
    expect(rangeBrapi(5)).toBe("5y");
    expect(rangeBrapi(30)).toBe("max");
    let visto: { url: string; auth?: string } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      visto = { url, auth: (init?.headers as Record<string, string>)?.Authorization };
      return resp({ results: [{ historicalDataPrice: [{ date: t0, close: 10 }] }] });
    }) as unknown as typeof fetch;
    await baixarBrapi("BOVA11", 3, f, "SEGREDO");
    expect(visto!.auth).toBe("Bearer SEGREDO");
    expect(visto!.url).not.toContain("SEGREDO");
  });

  it("yahoo: prefere ajustado e pula nulos", () => {
    const s = parseYahoo({ chart: { result: [{ timestamp: [t0, t0 + 86400, t0 + 2 * 86400], indicators: { quote: [{ close: [10, 11, 12] }], adjclose: [{ adjclose: [9.5, null, 11.5] }] } }] } });
    expect(s).toEqual([{ data: "2025-01-02", valor: 9.5 }, { data: "2025-01-04", valor: 11.5 }]);
  });
});

describe("carregarSerie (com reserva)", () => {
  const def: AtivoDef = { id: "BOVA11", nome: "Ibovespa", fonte: "brapi", ref: "BOVA11", fallback: { fonte: "yahoo", ref: "BOVA11.SA" } };
  const t0 = 1_700_000_000;
  const yahoo = { chart: { result: [{ timestamp: Array.from({ length: 80 }, (_, i) => t0 + i * 86400), indicators: { quote: [{ close: Array.from({ length: 80 }, (_, i) => 100 + i) }] } }] } };

  it("histórico longo: vai direto ao Yahoo, sem chamar a brapi (plano grátis só dá 3 meses)", async () => {
    const chamadas: string[] = [];
    const f = (async (u: string) => { chamadas.push(u); return resp(yahoo); }) as unknown as typeof fetch;
    const r = await carregarSerie(def, { anos: 5, fetch: f, brapiToken: "tok" });
    expect(r.fonteUsada).toBe("yahoo");
    expect(r.avisos).toEqual([]);
    expect(chamadas.every((u) => !u.includes("brapi.dev"))).toBe(true);
  });

  it("se a brapi falha, usa o Yahoo e conta o que aconteceu", async () => {
    const f = (async (u: string) => (u.includes("brapi.dev") ? resp({}, 401) : resp(yahoo))) as unknown as typeof fetch;
    const r = await carregarSerie(def, { anos: 0.2, fetch: f });
    expect(r.fonteUsada).toBe("yahoo");
    expect(r.serie.length).toBe(80);
    expect(r.avisos[0]).toMatch(/brapi/);
  });

  it("se tudo falha, junta as explicações num erro só", async () => {
    const f = (async () => resp({}, 500)) as unknown as typeof fetch;
    await expect(carregarSerie(def, { anos: 0.2, fetch: f })).rejects.toThrow(ErroFonte);
    await expect(carregarSerie(def, { anos: 0.2, fetch: f })).rejects.toThrow(/brapi.*yahoo/s);
  });

  it("recusa série curta demais", async () => {
    const curta = { chart: { result: [{ timestamp: [t0, t0 + 86400], indicators: { quote: [{ close: [1, 2] }] } }] } };
    const f = (async () => resp(curta)) as unknown as typeof fetch;
    await expect(carregarSerie({ ...def, fallback: undefined, fonte: "yahoo" }, { anos: 1, fetch: f })).rejects.toThrow(/poucos dados/);
  });
});
