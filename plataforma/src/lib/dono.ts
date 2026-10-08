import { redirect } from "next/navigation";
import { ehDono } from "@/lib/config";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Garante que quem chama é o dono logado. Caso contrário, manda para o login. */
export async function exigirDono() {
  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !ehDono(data.user.email)) redirect("/login?erro=nao_autorizado");
  return { supabase, user: data.user };
}
