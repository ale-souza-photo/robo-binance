import { type Tick, simboloBinance } from "@/core/ao-vivo";
import type { Movimento } from "@/core/paper";
import { type EntradaItem, type PayloadWidget, montarWidget } from "@/core/widget";

export type AtivoLinha = { id: string; nome: string; tipo: string; referencia: string; user_id: string };

/** Tudo que mexe com rede e banco entra aqui, para o serviço poder ser testado sem nenhum dos dois. */
export type DepsWidget = {
  ativos(): Promise<AtivoLinha[]>;
  fechamentos(ids: string[]): Promise<Record<string, { data: string; valor: number }>>;
  contaEspelho(donoId: string): Promise<{ id: string; nome: string } | null>;
  movimentos(contaId: string): Promise<Movimento[]>;
  ticks24h(simbolos: string[]): Promise<Tick[]>;
  cotacaoBolsa(ticker: string): Promise<{ preco: number }>;
  agora(): Date;
};

/** Cada fonte que falha vira "sem dado vivo" (cai no último fechamento); uma falha nunca derruba o widget. */
async function tentar<T>(f: () => Promise<T>, padrao: T): Promise<T> {
  try {
    return await f();
  } catch {
    return padrao;
  }
}

export async function gerarWidget(d: DepsWidget): Promise<PayloadWidget> {
  const todos = (await d.ativos()).filter((a) => a.tipo !== "renda_fixa"); // o CDI é um índice acumulado: não tem cotação
  const fech = await tentar(() => d.fechamentos(todos.map((a) => a.id)), {} as Record<string, { data: string; valor: number }>);

  const simPorId = new Map<string, string>();
  for (const a of todos) {
    const s = a.tipo === "cripto" ? simboloBinance(a.referencia) : null;
    if (s) simPorId.set(a.id, s);
  }
  const ticks = simPorId.size ? await tentar(() => d.ticks24h([...simPorId.values()]), [] as Tick[]) : [];
  const tickPorSimbolo = new Map(ticks.map((t) => [t.simbolo, t]));

  const itens: EntradaItem[] = [];
  for (const a of todos) {
    let vivo: EntradaItem["vivo"] = null;
    const t = tickPorSimbolo.get(simPorId.get(a.id) ?? "");
    if (t) vivo = { preco: t.preco, abertura: t.abertura, fonte: "ao vivo" };
    else if (a.tipo !== "cripto" && a.tipo !== "cambio") {
      // bolsa: um ticker por vez (o plano grátis da brapi recusa pedidos simultâneos)
      const c = await tentar(() => d.cotacaoBolsa(a.referencia), null);
      if (c) vivo = { preco: c.preco, abertura: null, fonte: "atraso" };
    }
    itens.push({ id: a.id, nome: a.nome, tipo: a.tipo, fechamento: fech[a.id]?.valor ?? null, fechamentoData: fech[a.id]?.data ?? null, vivo });
  }

  let conta: { nome: string; movimentos: Movimento[] } | null = null;
  const dono = todos[0]?.user_id;
  if (dono) {
    const c = await tentar(() => d.contaEspelho(dono), null);
    // Se não conseguir ler os movimentos, NÃO mostra a linha do saldo: um patrimônio zerado por falha seria um número falso.
    const mov = c ? await tentar<Movimento[] | null>(() => d.movimentos(c.id), null) : null;
    if (c && mov) conta = { nome: c.nome, movimentos: mov };
  }
  return montarWidget({ agora: d.agora(), itens, conta });
}
