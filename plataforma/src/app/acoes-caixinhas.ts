"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerNumero } from "@/lib/format";
import { validarCaixinha } from "@/core/caixinhas";
import { exigirDono } from "@/lib/dono";

function lerCampos(formData: FormData) {
  return validarCaixinha(
    String(formData.get("nome") ?? ""),
    lerNumero(String(formData.get("pct") ?? "")),
    String(formData.get("saldo") ?? "").trim() === "" ? 0 : lerNumero(String(formData.get("saldo"))),
  );
}

export async function salvarCaixinha(formData: FormData) {
  const { supabase } = await exigirDono();
  const v = lerCampos(formData);
  if (!v.ok) redirect(`/caixinhas?erro=${v.erro}`);
  const id = String(formData.get("id") ?? "");
  const campos = { nome: v.valor.nome, pct_cdi: v.valor.pctCdi, saldo: v.valor.saldo, atualizado_em: new Date().toISOString() };
  const { error } = id ? await supabase.from("caixinhas").update(campos).eq("id", id) : await supabase.from("caixinhas").insert(campos);
  if (error) redirect("/caixinhas?erro=falha_banco");
  revalidatePath("/caixinhas");
  redirect("/caixinhas?ok=salvo");
}

export async function excluirCaixinha(formData: FormData) {
  const { supabase } = await exigirDono();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/caixinhas?erro=dados_invalidos");
  const { error } = await supabase.from("caixinhas").delete().eq("id", id);
  if (error) redirect("/caixinhas?erro=falha_banco");
  revalidatePath("/caixinhas");
  redirect("/caixinhas?ok=excluida");
}
