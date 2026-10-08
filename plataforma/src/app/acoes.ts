"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ATIVOS_PADRAO } from "@/dados/fontes";
import { ehDono } from "@/lib/config";
import { exigirDono } from "@/lib/dono";
import { clienteServidor } from "@/lib/supabase/servidor";
import { PADROES_ANALISE } from "@/lib/config";
import { criarDependencias } from "@/servico/real";
import { rodarAnalise } from "@/servico/analise-cron";

export async function entrar(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  // Mesma resposta para e-mail errado ou senha errada: ninguém descobre qual é o do dono.
  if (!ehDono(email) || !senha) redirect("/login?erro=credenciais");
  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  redirect(error ? "/login?erro=credenciais" : "/");
}

export async function sair() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}

const TIPOS = ["cripto", "bdr", "acao", "etf"] as const;

export async function adicionarAtivo(formData: FormData) {
  const { supabase } = await exigirDono();
  const tipo = String(formData.get("tipo") ?? "") as (typeof TIPOS)[number];
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase().replace(/\.SA$/, "");
  const nome = String(formData.get("nome") ?? "").trim() || codigo;
  if (!TIPOS.includes(tipo) || !/^[A-Z0-9]{2,15}$/.test(codigo)) redirect("/ativos?erro=dados_invalidos");
  const cripto = tipo === "cripto";
  const { error } = await supabase.from("ativos").insert({
    id: codigo, nome, tipo,
    fonte: cripto ? "binance" : "brapi",
    referencia: cripto ? `${codigo}/BRL` : codigo,
    fallback_fonte: cripto ? null : "yahoo",
    fallback_referencia: cripto ? null : `${codigo}.SA`,
  });
  revalidatePath("/ativos");
  redirect(error ? `/ativos?erro=${error.code === "23505" ? "ja_existe" : "falha_banco"}` : "/ativos?ok=adicionado");
}

export async function carregarPadrao() {
  const { supabase } = await exigirDono();
  const tipos: Record<string, string> = { BTC: "cripto", ETH: "cripto", DOLAR: "cambio", CDI: "renda_fixa", BOVA11: "etf", IVVB11: "etf" };
  const linhas = ATIVOS_PADRAO.map((a) => ({
    id: a.id, nome: a.nome, tipo: tipos[a.id] ?? "acao", fonte: a.fonte, referencia: a.ref,
    fallback_fonte: a.fallback?.fonte ?? null, fallback_referencia: a.fallback?.ref ?? null,
  }));
  const { error } = await supabase.from("ativos").upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
  revalidatePath("/ativos");
  redirect(error ? "/ativos?erro=falha_banco" : "/ativos?ok=padrao");
}

export async function alternarAtivo(formData: FormData) {
  const { supabase } = await exigirDono();
  const id = String(formData.get("id"));
  const ativar = formData.get("ativar") === "1";
  await supabase.from("ativos").update({ ativo: ativar }).eq("id", id);
  revalidatePath("/ativos");
}

export async function removerAtivo(formData: FormData) {
  const { supabase } = await exigirDono();
  await supabase.from("ativos").delete().eq("id", String(formData.get("id")));
  revalidatePath("/ativos");
}

/** Roda a análise na hora (a mesma que o cron roda de manhã e à tarde).
 *  Usa a sessão do próprio dono (respeita o RLS), então funciona sem depender da chave de serviço. */
export async function rodarAgora() {
  const { supabase } = await exigirDono();
  const deps = criarDependencias(supabase, process.env.BRAPI_TOKEN);
  let destino = "/";
  try {
    const r = await rodarAnalise(deps, { gatilho: "manual", ...PADROES_ANALISE });
    destino = r.status === "erro" ? "/?erro=analise" : "/";
  } catch (e) {
    console.error("rodarAgora falhou:", e);
    destino = "/?erro=analise";
  }
  revalidatePath("/");
  revalidatePath("/analises");
  redirect(destino);
}
