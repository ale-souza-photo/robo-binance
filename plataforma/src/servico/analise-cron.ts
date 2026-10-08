import { executarAnalise, type ResultadoAnalise } from "@/core/analise";
import type { Serie } from "@/core/series";
import type { AtivoDef, Fonte } from "@/dados/tipos";

export type Gatilho = "cron_manha" | "cron_tarde" | "manual";

export type RegistroAnalise = {
  executadoEm: string;
  gatilho: Gatilho;
  status: "ok" | "parcial" | "erro";
  periodoIni: string | null;
  periodoFim: string | null;
  ativos: string[];
  avisos: string[];
  resultado: ResultadoAnalise | null;
};

/** Tudo que mexe com rede e banco entra aqui, para o serviço poder ser testado sem nenhum dos dois. */
export type Dependencias = {
  listarAtivos(): Promise<AtivoDef[]>;
  carregarSerie(def: AtivoDef): Promise<{ serie: Serie; fonteUsada: Fonte; avisos: string[] }>;
  salvarPrecos(ativoId: string, serie: Serie): Promise<void>;
  lerPrecosSalvos(ativoId: string): Promise<Serie>;
  carteiras(): Promise<Record<string, Record<string, number>>>;
  salvarAnalise(r: RegistroAnalise): Promise<string>;
  agora(): Date;
};

export type ConfigAnalise = { gatilho: Gatilho; inicial: number; mensal: number; dia: number };

export type SaidaCron = { status: RegistroAnalise["status"]; id?: string; ativosUsados: string[]; ativosFalharam: string[]; avisos: string[] };

/** A tarefa que roda de manhã e à tarde: baixa os preços, analisa, guarda o resultado. Nunca derruba por um ativo só. */
export async function rodarAnalise(d: Dependencias, cfg: ConfigAnalise): Promise<SaidaCron> {
  const avisos: string[] = [];
  const series: Record<string, Serie> = {};
  const nomes: Record<string, string> = {};
  const falharam: string[] = [];

  const ativos = await d.listarAtivos();
  for (const def of ativos) {
    nomes[def.id] = def.nome;
    try {
      const { serie, avisos: a } = await d.carregarSerie(def);
      avisos.push(...a);
      series[def.id] = serie;
      try {
        await d.salvarPrecos(def.id, serie);
      } catch (e) {
        avisos.push(`${def.id}: não consegui guardar os preços (${e instanceof Error ? e.message : String(e)})`);
      }
    } catch (e) {
      avisos.push(e instanceof Error ? e.message : String(e));
      const guardada = await d.lerPrecosSalvos(def.id).catch(() => [] as Serie);
      if (guardada.length >= 60) {
        series[def.id] = guardada;
        avisos.push(`${def.id}: usando os últimos preços salvos (até ${guardada[guardada.length - 1].data}).`);
      } else {
        falharam.push(def.id);
      }
    }
  }

  const usados = Object.keys(series);
  const base = { executadoEm: d.agora().toISOString(), gatilho: cfg.gatilho, ativos: usados };
  if (usados.length < 2) {
    avisos.push("Preciso de pelo menos 2 ativos com dados para analisar.");
    const id = await d.salvarAnalise({ ...base, status: "erro", periodoIni: null, periodoFim: null, avisos, resultado: null });
    return { status: "erro", id, ativosUsados: usados, ativosFalharam: falharam, avisos };
  }

  let resultado;
  try {
    resultado = executarAnalise({
      series, inicial: cfg.inicial, mensal: cfg.mensal, dia: cfg.dia, carteiras: await d.carteiras(), nomes,
    });
  } catch (e) {
    avisos.push(`Não consegui calcular a análise: ${e instanceof Error ? e.message : String(e)}`);
    const id = await d.salvarAnalise({ ...base, status: "erro", periodoIni: null, periodoFim: null, avisos, resultado: null });
    return { status: "erro", id, ativosUsados: usados, ativosFalharam: falharam, avisos };
  }
  for (const c of resultado.carteirasIgnoradas) avisos.push(`Carteira '${c.nome}' ignorada: faltam ${c.faltam.join(", ")}.`);
  const status = falharam.length ? "parcial" : "ok";
  const id = await d.salvarAnalise({
    ...base, status, periodoIni: resultado.periodo.inicio, periodoFim: resultado.periodo.fim, avisos, resultado,
  });
  return { status, id, ativosUsados: usados, ativosFalharam: falharam, avisos };
}

/** Carteiras de exemplo (as mesmas do laboratório em Python). Não são recomendação. */
export const CARTEIRAS_PADRAO: Record<string, Record<string, number>> = {
  "100% CDI (renda fixa)": { CDI: 1 },
  "100% Bitcoin": { BTC: 1 },
  "Cripto: 70% BTC + 30% ETH": { BTC: 0.7, ETH: 0.3 },
  "Conservadora: 60% CDI, 20% S&P, 10% US$, 10% BTC": { CDI: 0.6, IVVB11: 0.2, DOLAR: 0.1, BTC: 0.1 },
  "Equilibrada: 30% CDI, 20% S&P, 20% Ibov, 10% US$, 20% cripto": { CDI: 0.3, IVVB11: 0.2, BOVA11: 0.2, DOLAR: 0.1, BTC: 0.15, ETH: 0.05 },
};

export const gatilhoDoCron = (schedule: string | null): Gatilho => {
  if (!schedule) return "manual";
  const hora = Number(schedule.trim().split(/\s+/)[1]);
  return Number.isFinite(hora) && hora < 16 ? "cron_manha" : "cron_tarde";
};

/**
 * Qual horário disparou a análise: o cabeçalho da Vercel (se vier) manda; senão vale o parâmetro `?gatilho=` (usado pelo
 * agendador do Supabase), mas só os dois valores conhecidos; qualquer outra coisa vira "manual".
 */
export const gatilhoDaChamada = (schedule: string | null, parametro: string | null): Gatilho => {
  if (schedule) return gatilhoDoCron(schedule);
  return parametro === "cron_manha" || parametro === "cron_tarde" ? parametro : "manual";
};
