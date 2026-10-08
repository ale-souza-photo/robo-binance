import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dia } from "@/core/datas";

type Db = SupabaseClient<any, any, any>;

/** Até `max` fechamentos diários mais recentes (mais antigo primeiro). 1.900 cobre ~5 anos de cripto. */
export async function precosHistoricos(db: Db, ativoId: string, max = 1900): Promise<{ datas: Dia[]; valores: number[] }> {
  const linhas: { data: string; valor: number }[] = [];
  for (let desde = 0; desde < max; desde += 1000) {
    const fim = Math.min(desde + 999, max - 1);
    const { data, error } = await db.from("precos_diarios").select("data,valor").eq("ativo_id", ativoId).order("data", { ascending: false }).range(desde, fim);
    if (error) throw new Error(`banco: ${error.message}`);
    for (const r of data ?? []) linhas.push({ data: r.data as string, valor: Number(r.valor) });
    if (!data || data.length < fim - desde + 1) break;
  }
  linhas.reverse();
  return { datas: linhas.map((l) => l.data), valores: linhas.map((l) => l.valor) };
}
