import { describe, expect, it } from "vitest";
import { rodarAnalise, gatilhoDoCron, gatilhoDaChamada, CARTEIRAS_PADRAO, type Dependencias, type RegistroAnalise } from "@/servico/analise-cron";
import type { AtivoDef, Serie } from "@/dados/tipos";
import { somaDias } from "@/core/datas";

function serieSintetica(n: number, passo: number, ruido: number): Serie {
  let v = 100;
  let x = 12345;
  return Array.from({ length: n }, (_, i) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    v *= 1 + passo + ((x / 2147483648) - 0.5) * ruido;
    return { data: somaDias("2023-01-01", i), valor: v };
  });
}

function dependencias(opcoes: { falha?: string[]; salvos?: Record<string, Serie> } = {}) {
  const ativos: AtivoDef[] = [
    { id: "BTC", nome: "Bitcoin", fonte: "binance", ref: "BTC/BRL" },
    { id: "CDI", nome: "CDI", fonte: "bcb_cdi", ref: "12" },
    { id: "ETH", nome: "Ethereum", fonte: "binance", ref: "ETH/BRL" },
  ];
  const guardados: Record<string, Serie> = {};
  const analises: RegistroAnalise[] = [];
  const d: Dependencias = {
    listarAtivos: async () => ativos,
    carregarSerie: async (def) => {
      if (opcoes.falha?.includes(def.id)) throw new Error(`${def.id}: fonte fora do ar`);
      return { serie: def.id === "CDI" ? serieSintetica(900, 0.0004, 0) : serieSintetica(900, 0.001, 0.05), fonteUsada: def.fonte, avisos: [] };
    },
    salvarPrecos: async (id, s) => {
      guardados[id] = s;
    },
    lerPrecosSalvos: async (id) => opcoes.salvos?.[id] ?? [],
    carteiras: async () => CARTEIRAS_PADRAO,
    salvarAnalise: async (r) => {
      analises.push(r);
      return `analise-${analises.length}`;
    },
    agora: () => new Date("2026-10-09T11:00:00Z"),
  };
  return { d, guardados, analises };
}

const cfg = { gatilho: "cron_manha" as const, inicial: 100, mensal: 50, dia: 5 };

describe("tarefa de análise (cron)", () => {
  it("caminho feliz: baixa, guarda os preços, analisa e registra", async () => {
    const { d, guardados, analises } = dependencias();
    const r = await rodarAnalise(d, cfg);
    expect(r.status).toBe("ok");
    expect(r.ativosUsados.sort()).toEqual(["BTC", "CDI", "ETH"]);
    expect(Object.keys(guardados).sort()).toEqual(["BTC", "CDI", "ETH"]);
    expect(analises).toHaveLength(1);
    expect(analises[0].resultado?.frases.length).toBeGreaterThan(2);
    expect(analises[0].periodoIni).toBe("2023-01-01");
    // carteiras que dependem de ativos que não existem são avisadas, e não derrubam nada
    expect(r.avisos.some((a) => a.includes("ignorada"))).toBe(true);
    expect(Object.keys(analises[0].resultado!.carteiras)).toContain("Cripto: 70% BTC + 30% ETH");
  });

  it("um ativo cai: usa os preços salvos e marca como válido, avisando", async () => {
    const { d, analises } = dependencias({ falha: ["ETH"], salvos: { ETH: serieSintetica(900, 0.001, 0.05) } });
    const r = await rodarAnalise(d, cfg);
    expect(r.status).toBe("ok");
    expect(r.avisos.join(" ")).toMatch(/ETH.*fora do ar/);
    expect(r.avisos.join(" ")).toMatch(/usando os últimos preços salvos/);
    expect(analises[0].ativos).toContain("ETH");
  });

  it("um ativo cai e não há preço salvo: análise PARCIAL, sem esse ativo", async () => {
    const { d, analises } = dependencias({ falha: ["ETH"] });
    const r = await rodarAnalise(d, cfg);
    expect(r.status).toBe("parcial");
    expect(r.ativosFalharam).toEqual(["ETH"]);
    expect(analises[0].ativos).not.toContain("ETH");
  });

  it("quase tudo cai: registra ERRO em vez de inventar uma análise", async () => {
    const { d, analises } = dependencias({ falha: ["ETH", "CDI"] });
    const r = await rodarAnalise(d, cfg);
    expect(r.status).toBe("erro");
    expect(analises[0].status).toBe("erro");
    expect(analises[0].resultado).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/pelo menos 2 ativos/);
  });

  it("falha ao guardar preços não derruba a análise", async () => {
    const { d } = dependencias();
    d.salvarPrecos = async () => {
      throw new Error("banco indisponível");
    };
    const r = await rodarAnalise(d, cfg);
    expect(r.status).toBe("ok");
    expect(r.avisos.join(" ")).toMatch(/não consegui guardar/);
  });

  it("identifica manhã, tarde ou manual pelo horário do cron", () => {
    expect(gatilhoDoCron("0 11 * * *")).toBe("cron_manha");
    expect(gatilhoDoCron("0 21 * * *")).toBe("cron_tarde");
    expect(gatilhoDoCron(null)).toBe("manual");
  });
});

describe("gatilho da chamada (Supabase ou Vercel)", () => {
  it("o parâmetro vale só para os dois horários conhecidos; o resto é manual", () => {
    expect(gatilhoDaChamada(null, "cron_manha")).toBe("cron_manha");
    expect(gatilhoDaChamada(null, "cron_tarde")).toBe("cron_tarde");
    for (const x of [null, "", "manual", "cron_noite", "CRON_MANHA", "cron_manha; drop table x", "../../x"]) {
      expect(gatilhoDaChamada(null, x)).toBe("manual");
    }
  });
  it("o cabeçalho da Vercel, quando vem, manda sobre o parâmetro", () => {
    expect(gatilhoDaChamada("0 21 * * *", "cron_manha")).toBe("cron_tarde");
    expect(gatilhoDaChamada("0 11 * * *", null)).toBe("cron_manha");
  });
});
