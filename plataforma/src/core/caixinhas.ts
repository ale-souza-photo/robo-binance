/**
 * Caixinhas de renda fixa (CDI): nome, % do CDI e saldo. A rentabilidade é fixa em % do CDI, então o rendimento é uma estimativa
 * com o CDI de hoje, ANTES do imposto de renda (a tabela regressiva do IR se aplica a muitos produtos). Não é promessa.
 */
import type { Serie } from "@/core/series";

export type Caixinha = { id: string; nome: string; pctCdi: number; saldo: number };

export const PCT_CDI_MAX = 300;
export const DIAS_UTEIS_ANO = 252;
export const DIAS_UTEIS_MES = 21;

export type EntradaCaixinha = { nome: string; pctCdi: number; saldo: number };

/** Valida o que o dono digitou. Devolve a caixinha limpa ou a mensagem do problema. */
export function validarCaixinha(nome: unknown, pctCdi: unknown, saldo: unknown): { ok: true; valor: EntradaCaixinha } | { ok: false; erro: string } {
  const n = typeof nome === "string" ? nome.trim() : "";
  if (n.length < 1 || n.length > 60) return { ok: false, erro: "nome_invalido" };
  const p = typeof pctCdi === "number" ? pctCdi : Number.NaN;
  if (!Number.isFinite(p) || p <= 0 || p > PCT_CDI_MAX) return { ok: false, erro: "pct_invalido" };
  const s = typeof saldo === "number" ? saldo : Number.NaN;
  if (!Number.isFinite(s) || s < 0 || s > 1e12) return { ok: false, erro: "saldo_invalido" };
  return { ok: true, valor: { nome: n, pctCdi: Math.round(p * 100) / 100, saldo: Math.round(s * 100) / 100 } };
}

/**
 * CDI anual estimado a partir do índice acumulado do CDI (a série salva): usa os últimos `janela` pregões e anualiza em 252 dias.
 * Sem pontos suficientes, null (a tela avisa em vez de inventar um número).
 */
export function cdiAnualDe(indice: Serie, janela = 63): number | null {
  if (indice.length < 11) return null;
  const k = Math.min(janela, indice.length - 1);
  const a = indice[indice.length - 1 - k].valor;
  const b = indice[indice.length - 1].valor;
  if (!(a > 0) || !(b > 0)) return null;
  const anual = Math.pow(b / a, DIAS_UTEIS_ANO / k) - 1;
  return Number.isFinite(anual) ? anual : null;
}

/** Taxa ao ano de uma caixinha: o CDI diário vezes o %, composto em 252 dias. */
export function taxaAnualCaixinha(cdiAnual: number, pctCdi: number): number {
  const diario = Math.pow(1 + cdiAnual, 1 / DIAS_UTEIS_ANO) - 1;
  return Math.pow(1 + diario * (pctCdi / 100), DIAS_UTEIS_ANO) - 1;
}

export type Rendimento = { dia: number; mes: number; ano: number };

/** Quanto o saldo rende (estimativa, antes do IR): por pregão, por 21 pregões e por 252. */
export function rendimento(c: Pick<Caixinha, "saldo" | "pctCdi">, cdiAnual: number): Rendimento {
  const diario = (Math.pow(1 + cdiAnual, 1 / DIAS_UTEIS_ANO) - 1) * (c.pctCdi / 100);
  const f = (n: number) => c.saldo * (Math.pow(1 + diario, n) - 1);
  return { dia: f(1), mes: f(DIAS_UTEIS_MES), ano: f(DIAS_UTEIS_ANO) };
}

export type ResumoCaixinhas = {
  quantidade: number;
  total: number;
  /** % do CDI médio ponderado pelo saldo. */
  pctCdiMedio: number | null;
  rendMes: number | null;
  rendAno: number | null;
  cdiAnual: number | null;
  /** Cada caixinha com o rendimento estimado por mês (null sem CDI). Usado no gráfico do Rockefeller. */
  itens: { nome: string; pctCdi: number; saldo: number; rendMes: number | null }[];
};

export function resumir(lista: Caixinha[], cdiAnual: number | null): ResumoCaixinhas {
  const total = lista.reduce((s, c) => s + c.saldo, 0);
  const pctCdiMedio = total > 0 ? lista.reduce((s, c) => s + c.saldo * c.pctCdi, 0) / total : null;
  const itens = lista.map((c) => ({ nome: c.nome, pctCdi: c.pctCdi, saldo: c.saldo, rendMes: cdiAnual == null ? null : rendimento(c, cdiAnual).mes }));
  if (cdiAnual == null) return { quantidade: lista.length, total, pctCdiMedio, rendMes: null, rendAno: null, cdiAnual: null, itens };
  const r = lista.map((c) => rendimento(c, cdiAnual));
  return {
    quantidade: lista.length, total, pctCdiMedio,
    rendMes: r.reduce((s, x) => s + x.mes, 0), rendAno: r.reduce((s, x) => s + x.ano, 0), cdiAnual, itens,
  };
}

const brl = (n: number) => "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Frase para o parecer do Analista (Rockefeller). Sem caixinhas, null. */
export function fraseResumo(r: ResumoCaixinhas): string | null {
  if (r.quantidade === 0 || r.total <= 0) return null;
  const base = `Suas ${r.quantidade === 1 ? "caixinha soma" : `${r.quantidade} caixinhas somam`} ${brl(r.total)}` +
    (r.pctCdiMedio != null ? `, rendendo em média ${r.pctCdiMedio.toFixed(0)}% do CDI` : "");
  return r.rendMes != null
    ? `${base} (cerca de ${brl(r.rendMes)} por mês, estimativa antes do imposto de renda, com o CDI de hoje).`
    : `${base}.`;
}
