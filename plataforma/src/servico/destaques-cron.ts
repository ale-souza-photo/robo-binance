import { escolherDestaques, MIN_COM_RETORNO, retorno30d, TAMANHO_POOL, type CandidatoBdr, type Destaque } from "@/core/destaques";
import type { Serie } from "@/core/series";
import { hojeBrasilia } from "@/servico/parecer-cron";

export type DependenciasDestaques = {
  listarBdrs(): Promise<CandidatoBdr[]>;
  /** Histórico de ~3 meses de um ticker (brapi, com reserva no Yahoo). Lança erro se nenhuma fonte responder. */
  historico(ticker: string): Promise<Serie>;
  salvar(dia: string, itens: Destaque[]): Promise<void>;
  agora(): Date;
};

export type SaidaDestaques = { status: "ok" | "parcial" | "erro"; dia?: string; quantos?: number; avisos: string[] };

const LOTE = 5;

/** Todo dia útil à noite: pega os BDRs mais negociados, calcula o retorno de 30 dias de cada um e guarda os 10 melhores. */
export async function rodarDestaques(d: DependenciasDestaques): Promise<SaidaDestaques> {
  const avisos: string[] = [];
  let lista: CandidatoBdr[];
  try {
    lista = await d.listarBdrs();
  } catch (e) {
    return { status: "erro", avisos: [`lista de BDRs: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (lista.length === 0) return { status: "erro", avisos: ["A lista de BDRs veio vazia (token inválido, plano sem esta lista ou formato diferente)."] };

  const pool = lista.slice(0, TAMANHO_POOL);
  const calculados: { cand: CandidatoBdr; ret30d: number | null }[] = [];
  for (let i = 0; i < pool.length; i += LOTE) {
    const lote = pool.slice(i, i + LOTE);
    const res = await Promise.all(
      lote.map(async (cand) => {
        try {
          return { cand, ret30d: retorno30d(await d.historico(cand.ticker)) };
        } catch (e) {
          avisos.push(`${cand.ticker}: ${e instanceof Error ? e.message : String(e)}`);
          return { cand, ret30d: null };
        }
      }),
    );
    calculados.push(...res);
  }

  const itens = escolherDestaques(calculados);
  if (itens.length < MIN_COM_RETORNO) {
    avisos.push(`Só ${itens.length} BDR(s) com histórico suficiente: não atualizei os destaques.`);
    return { status: "erro", avisos };
  }
  const dia = hojeBrasilia(d.agora());
  await d.salvar(dia, itens);
  return { status: avisos.length ? "parcial" : "ok", dia, quantos: itens.length, avisos: avisos.slice(0, 10) };
}
