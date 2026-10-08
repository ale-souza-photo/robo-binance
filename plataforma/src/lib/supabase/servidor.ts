import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { exigir } from "../config";

/** Schema do Trader Bit no Supabase (compartilhado com outros apps). */
export const SCHEMA = "traderbit";

/** Cliente com a sessão do usuário logado (respeita o RLS). Só em código de servidor. */
export async function clienteServidor() {
  const c = await cookies();
  return createServerClient(exigir("NEXT_PUBLIC_SUPABASE_URL"), exigir("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    db: { schema: SCHEMA },
    cookies: {
      getAll: () => c.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) c.set(name, value, options);
        } catch {
          // chamado de um Server Component (não pode gravar cookie): o proxy renova a sessão
        }
      },
    },
  });
}

/** Cliente de serviço: IGNORA o RLS. Use só no servidor, para o cron e tarefas internas. */
export function clienteAdmin() {
  return createClient(exigir("NEXT_PUBLIC_SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY"), {
    db: { schema: SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
