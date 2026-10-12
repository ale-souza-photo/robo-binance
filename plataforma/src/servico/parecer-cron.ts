import { fraseResumo, type ResumoCaixinhas } from "@/core/caixinhas";
import { aporteMensalDe, gastoMensalDe, gerarParecer, type AtivoInfo, type Parecer, type StatsAtivo } from "@/core/parecer";

export const META_MESES = 3;

export type DadosRockefeller = { userId: string; data: unknown };
export type UltimaAnalise = { stats: Record<string, StatsAtivo>; periodoFim: string | null } | null;

export type DependenciasParecer = {
  lerRockefeller(): Promise<DadosRockefeller | null>;
  lerAtivos(): Promise<AtivoInfo[]>;
  lerUltimaAnalise(): Promise<UltimaAnalise>;
  /** Opcional: resumo das caixinhas de renda fixa. Se falhar ou faltar, o parecer sai sem elas. */
  lerCaixinhas?(): Promise<ResumoCaixinhas>;
  salvarParecer(userId: string, p: Parecer): Promise<void>;
  agora(): Date;
};

export type SaidaParecer = { status: "ok" | "sem_dados" | "erro"; estado?: Parecer["estado"]; aviso?: string };

/** Data de hoje em Brasília (AAAA-MM-DD). */
export function hojeBrasilia(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

type Dados = { reservaAtual?: unknown; tx?: unknown; plan?: { reserva?: unknown } };

/** Lê o Rockefeller (somente leitura), cruza com a última análise do Trader Bit e grava o parecer do dia. Sem IA, sem custo. */
export async function rodarParecer(d: DependenciasParecer): Promise<SaidaParecer> {
  const rk = await d.lerRockefeller();
  if (!rk) return { status: "sem_dados", aviso: "Nenhum dado do Rockefeller encontrado." };
  const dados = (rk.data ?? {}) as Dados;
  const reserva = typeof dados.reservaAtual === "number" && Number.isFinite(dados.reservaAtual) ? dados.reservaAtual : 0;
  const tx = Array.isArray(dados.tx) ? (dados.tx as { type?: string; amount?: number; date?: string }[]) : [];
  const agora = d.agora();
  const hoje = hojeBrasilia(agora);
  const pctRes = typeof dados.plan?.reserva === "number" ? dados.plan.reserva : 0;

  const [ativos, analise] = await Promise.all([d.lerAtivos(), d.lerUltimaAnalise()]);
  const parecer = gerarParecer({
    reserva,
    gastoMensal: gastoMensalDe(tx, hoje),
    aporteMensal: aporteMensalDe(tx, hoje, pctRes),
    metaMeses: META_MESES,
    ativos,
    stats: analise?.stats ?? {},
    agora,
    dadosAte: analise?.periodoFim ?? null,
  });
  let final: Parecer = parecer;
  if (d.lerCaixinhas) {
    try {
      const resumo = await d.lerCaixinhas();
      const frase = fraseResumo(resumo);
      if (frase) final = { ...parecer, texto: [...parecer.texto, frase], caixinhas: resumo };
    } catch {
      // caixinhas são um extra: se der erro, o parecer do dia sai igual ao de sempre
    }
  }
  await d.salvarParecer(rk.userId, final);
  return { status: "ok", estado: parecer.estado };
}
