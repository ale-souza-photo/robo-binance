import type { SupabaseClient } from "@supabase/supabase-js";
import { type Movimento, negociavel } from "@/core/paper";

export type Conta = { id: string; nome: string; saldoInicial: number; travaPerda: number; criadoEm: string };
export type AtivoNeg = { id: string; nome: string; tipo: string };
export type PrecoUltimo = { data: string; valor: number };
export type MovimentoLinha = Movimento & { id: string; criadoEm: string; nota: string | null };

type Db = SupabaseClient<any, any, any>;

export async function listarContas(db: Db): Promise<Conta[]> {
  const { data, error } = await db.from("contas_teste").select("id,nome,saldo_inicial,trava_perda,criado_em").order("criado_em");
  if (error) throw new Error(`banco: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id as string, nome: c.nome as string, saldoInicial: Number(c.saldo_inicial),
    travaPerda: Number(c.trava_perda), criadoEm: c.criado_em as string,
  }));
}

export async function carregarMovimentos(db: Db, contaId: string): Promise<MovimentoLinha[]> {
  const saida: MovimentoLinha[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("movimentos_teste")
      .select("id,criado_em,tipo,ativo_id,quantidade,preco_exec,taxa,caixa_delta,origem,periodo,nota")
      .eq("conta_id", contaId)
      .order("criado_em")
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(`banco: ${error.message}`);
    for (const r of data ?? []) {
      saida.push({
        id: r.id as string, criadoEm: r.criado_em as string, tipo: r.tipo as Movimento["tipo"],
        ativoId: r.ativo_id as string | null,
        quantidade: r.quantidade == null ? null : Number(r.quantidade),
        precoExec: r.preco_exec == null ? null : Number(r.preco_exec),
        taxa: Number(r.taxa), caixaDelta: Number(r.caixa_delta),
        origem: r.origem as "manual" | "dca", periodo: r.periodo as string | null, nota: r.nota as string | null,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return saida;
}

export async function ativosNegociaveis(db: Db): Promise<AtivoNeg[]> {
  const { data, error } = await db.from("ativos").select("id,nome,tipo").eq("ativo", true).order("id");
  if (error) throw new Error(`banco: ${error.message}`);
  return (data ?? []).filter((a) => negociavel(a.tipo as string)).map((a) => ({ id: a.id as string, nome: a.nome as string, tipo: a.tipo as string }));
}

/** Último preço salvo de cada ativo (fechamento diário). Ativos sem preço ficam de fora. */
export async function ultimosPrecos(db: Db, ids: string[]): Promise<Record<string, PrecoUltimo>> {
  const saida: Record<string, PrecoUltimo> = {};
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const { data } = await db.from("precos_diarios").select("data,valor").eq("ativo_id", id).order("data", { ascending: false }).limit(1);
      const r = data?.[0];
      if (r) saida[id] = { data: r.data as string, valor: Number(r.valor) };
    }),
  );
  return saida;
}
