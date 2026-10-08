import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarSerie } from "@/dados/fontes";
import type { AtivoDef, Fonte, Serie } from "@/dados/tipos";
import { CARTEIRAS_PADRAO, type Dependencias } from "./analise-cron";
import { PADROES_ANALISE } from "@/lib/config";

type LinhaAtivo = {
  id: string; user_id: string; nome: string; fonte: Fonte; referencia: string;
  fallback_fonte: Fonte | null; fallback_referencia: string | null;
};

/** Reserva automática: se a bolsa vier da brapi e não houver outra reserva, tenta o Yahoo (.SA). */
export function defDeLinha(l: LinhaAtivo): AtivoDef {
  const fallback = l.fallback_fonte && l.fallback_referencia
    ? { fonte: l.fallback_fonte, ref: l.fallback_referencia }
    : l.fonte === "brapi" ? { fonte: "yahoo" as Fonte, ref: `${l.referencia}.SA` } : undefined;
  return { id: l.id, nome: l.nome, fonte: l.fonte, ref: l.referencia, fallback };
}

/** Liga o serviço ao banco de verdade. Recebe o cliente de serviço (servidor). */
export function criarDependencias(db: SupabaseClient<any, any, any>, brapiToken?: string): Dependencias & { donoId: () => string | null } {
  let dono: string | null = null;
  return {
    donoId: () => dono,
    async listarAtivos() {
      const { data, error } = await db.from("ativos").select("*").eq("ativo", true).order("id");
      if (error) throw new Error(`banco: ${error.message}`);
      const linhas = (data ?? []) as LinhaAtivo[];
      dono = linhas[0]?.user_id ?? null;
      return linhas.map(defDeLinha);
    },
    carregarSerie: (def) => carregarSerie(def, { anos: PADROES_ANALISE.anos, fetch, brapiToken }),
    async salvarPrecos(ativoId, serie) {
      for (let i = 0; i < serie.length; i += 500) {
        const lote = serie.slice(i, i + 500).map((p) => ({ ativo_id: ativoId, data: p.data, valor: p.valor, atualizado_em: new Date().toISOString() }));
        const { error } = await db.from("precos_diarios").upsert(lote, { onConflict: "ativo_id,data" });
        if (error) throw new Error(error.message);
      }
    },
    async lerPrecosSalvos(ativoId) {
      const saida: Serie = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await db.from("precos_diarios").select("data,valor").eq("ativo_id", ativoId).order("data").range(desde, desde + 999);
        if (error) throw new Error(error.message);
        saida.push(...(data ?? []).map((r) => ({ data: r.data as string, valor: Number(r.valor) })));
        if (!data || data.length < 1000) break;
      }
      return saida;
    },
    async carteiras() {
      const { data } = await db.from("carteiras_modelo").select("nome,pesos").eq("ativa", true);
      if (!data?.length) return CARTEIRAS_PADRAO;
      return Object.fromEntries(data.map((c) => [c.nome as string, c.pesos as Record<string, number>]));
    },
    async salvarAnalise(r) {
      if (!dono) throw new Error("sem dono: cadastre ao menos um ativo antes de analisar");
      const { data, error } = await db.from("analises").insert({
        user_id: dono, executado_em: r.executadoEm, gatilho: r.gatilho, status: r.status, periodo_ini: r.periodoIni,
        periodo_fim: r.periodoFim, ativos: r.ativos, avisos: r.avisos, resultado: r.resultado,
      }).select("id").single();
      if (error) throw new Error(`banco: ${error.message}`);
      return data.id as string;
    },
    agora: () => new Date(),
  };
}
