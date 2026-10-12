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

import type { DependenciasParecer } from "@/servico/parecer-cron";
import type { StatsAtivo } from "@/core/parecer";

/** Dependências reais do parecer: lê `rockefeller_data` (só leitura) e grava em `rockefeller_parecer` (tabela própria). */
export function criarDependenciasParecer(db: SupabaseClient<any, any, any>): DependenciasParecer {
  return {
    async lerRockefeller() {
      const { data, error } = await db.schema("public").from("rockefeller_data").select("user_id,data").limit(1).maybeSingle();
      if (error) throw new Error(`rockefeller: ${error.message}`);
      return data ? { userId: data.user_id as string, data: data.data } : null;
    },
    async lerAtivos() {
      const { data, error } = await db.from("ativos").select("id,nome,tipo").eq("ativo", true).order("id");
      if (error) throw new Error(`banco: ${error.message}`);
      return (data ?? []).map((a) => ({ id: a.id as string, nome: a.nome as string, tipo: a.tipo as string }));
    },
    async lerUltimaAnalise() {
      const { data, error } = await db.from("analises").select("resultado,periodo_fim").in("status", ["ok", "parcial"])
        .order("executado_em", { ascending: false }).limit(1);
      if (error) throw new Error(`banco: ${error.message}`);
      const r = data?.[0];
      const stats = (r?.resultado as { stats?: Record<string, StatsAtivo> } | null)?.stats;
      return r && stats ? { stats, periodoFim: (r.periodo_fim as string | null) ?? null } : null;
    },
    lerCaixinhas: () => lerResumoCaixinhas(db),
    async salvarParecer(userId, p) {
      const { error } = await db.schema("public").from("rockefeller_parecer")
        .upsert({ user_id: userId, data: p, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw new Error(`parecer: ${error.message}`);
    },
    agora: () => new Date(),
  };
}

import { baixarBrapi, baixarYahoo } from "@/dados/bolsa";
import { lerListaBdr, urlListaBdr } from "@/core/destaques";
import type { DependenciasDestaques } from "@/servico/destaques-cron";
import { cdiAnualDe, resumir, type Caixinha } from "@/core/caixinhas";

/** Dependências reais dos destaques: lista e histórico pela brapi (reserva: Yahoo), gravação com a chave de serviço. */
export function criarDependenciasDestaques(db: SupabaseClient<any, any, any>, brapiToken?: string): DependenciasDestaques {
  return {
    async listarBdrs() {
      const r = await fetch(urlListaBdr(), { headers: brapiToken ? { Authorization: `Bearer ${brapiToken}` } : {} });
      if (!r.ok) throw new Error(`brapi: HTTP ${r.status}`);
      return lerListaBdr(await r.json());
    },
    async historico(ticker) {
      try {
        return await baixarBrapi(ticker, 0.25, fetch, brapiToken);
      } catch {
        return baixarYahoo(`${ticker}.SA`, 0.25, fetch);
      }
    },
    async salvar(dia, itens) {
      const { data: dono, error: e0 } = await db.from("ativos").select("user_id").limit(1).maybeSingle();
      if (e0 || !dono) throw new Error("sem dono: cadastre ao menos um ativo antes");
      const linhas = itens.map((i) => ({
        user_id: dono.user_id, data: dia, ticker: i.ticker, posicao: i.posicao, nome: i.nome, preco: i.preco,
        var_dia: i.varDia, volume: i.volume, ret_30d: i.ret30d, atualizado_em: new Date().toISOString(),
      }));
      const { error } = await db.from("destaques_bdr").upsert(linhas, { onConflict: "user_id,data,ticker" });
      if (error) throw new Error(`banco: ${error.message}`);
      // o dia de hoje fica só com os 10 de agora (se rodar de novo e a lista mudar, sobras do mesmo dia saem)
      const { error: e2 } = await db.from("destaques_bdr").delete().eq("user_id", dono.user_id).eq("data", dia).not("ticker", "in", `(${itens.map((i) => i.ticker).join(",")})`);
      if (e2) throw new Error(`banco: ${e2.message}`);
    },
    agora: () => new Date(),
  };
}

/** Lê as caixinhas e o CDI salvo e devolve o resumo (usado pelo parecer do Rockefeller). Quem chama decide o que fazer se falhar. */
export async function lerResumoCaixinhas(db: SupabaseClient<any, any, any>) {
  const { data, error } = await db.from("caixinhas").select("id,nome,pct_cdi,saldo").order("criado_em");
  if (error) throw new Error(`caixinhas: ${error.message}`);
  const lista: Caixinha[] = (data ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, pctCdi: Number(c.pct_cdi), saldo: Number(c.saldo) }));
  if (lista.length === 0) return resumir([], null);
  const { data: cdi } = await db.from("precos_diarios").select("data,valor").eq("ativo_id", "CDI").order("data", { ascending: false }).limit(64);
  const serie = (cdi ?? []).map((r) => ({ data: r.data as string, valor: Number(r.valor) })).reverse();
  return resumir(lista, cdiAnualDe(serie));
}
