/**
 * O que o widget do iPhone mostra: os ativos do mercado e uma linha com o patrimônio da conta de teste.
 * Funções puras (sem rede nem banco); a coleta dos dados fica em src/servico/widget-dados.ts.
 */
import { variacao } from "./ao-vivo";
import { type Movimento, aplicar, avaliar } from "./paper";

export type FonteItem = "ao vivo" | "atraso" | "fechamento" | "sem preço";

export type EntradaItem = {
  id: string;
  nome: string;
  tipo: string;
  fechamento: number | null;
  fechamentoData: string | null;
  /** Preço mais recente que o fechamento (cripto ao vivo ou bolsa com atraso), se houver. */
  vivo: { preco: number; abertura: number | null; fonte: "ao vivo" | "atraso" } | null;
};

export type ItemWidget = { id: string; nome: string; preco: number | null; var24h: number | null; fonte: FonteItem; data: string | null };
export type ContaWidget = { nome: string; patrimonio: number; caixa: number; aportado: number; resultado: number; retorno: number | null; semPreco: string[] };
export type PayloadWidget = { geradoEm: string; itens: ItemWidget[]; conta: ContaWidget | null };

const ordem = (tipo: string) => (tipo === "cripto" ? 0 : tipo === "cambio" ? 2 : 1);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function montarWidget(e: { agora: Date; itens: EntradaItem[]; conta: { nome: string; movimentos: Movimento[] } | null }): PayloadWidget {
  const ordenados = [...e.itens].sort((a, b) => ordem(a.tipo) - ordem(b.tipo) || a.id.localeCompare(b.id));
  const itens: ItemWidget[] = ordenados.map((i) => {
    if (i.vivo) {
      return { id: i.id, nome: i.nome, preco: i.vivo.preco, var24h: variacao(i.vivo.preco, i.vivo.abertura), fonte: i.vivo.fonte, data: null };
    }
    return { id: i.id, nome: i.nome, preco: i.fechamento, var24h: null, fonte: i.fechamento == null ? "sem preço" : "fechamento", data: i.fechamentoData };
  });

  let conta: ContaWidget | null = null;
  if (e.conta) {
    const precos: Record<string, number | null> = {};
    for (const i of itens) precos[i.id] = i.preco;
    const a = avaliar(aplicar(e.conta.movimentos), precos);
    conta = {
      nome: e.conta.nome, patrimonio: r2(a.patrimonio), caixa: r2(a.caixa), aportado: r2(a.aportado),
      resultado: r2(a.resultado), retorno: a.retorno == null ? null : Math.round(a.retorno * 10_000) / 10_000, semPreco: a.semPreco,
    };
  }
  return { geradoEm: e.agora.toISOString(), itens, conta };
}
