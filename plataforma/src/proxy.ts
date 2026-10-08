import { NextResponse, type NextRequest } from "next/server";
import { ehDono, supabaseConfigurado } from "@/lib/config";
import { atualizarSessao } from "@/lib/supabase/proxy";

/** Rotas abertas: login, retorno do login, saúde e cron (o cron se protege com CRON_SECRET). */
const PUBLICAS = ["/login", "/auth", "/api/health", "/api/cron"];

export async function proxy(request: NextRequest) {
  // Sem Supabase configurado a plataforma só mostra o passo a passo de configuração.
  if (!supabaseConfigurado()) return NextResponse.next();

  const { resposta, user } = await atualizarSessao(request);
  const caminho = request.nextUrl.pathname;
  const publica = PUBLICAS.some((p) => caminho === p || caminho.startsWith(p + "/"));

  if (!user && !publica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "";
    return NextResponse.redirect(destino);
  }
  // Mesmo logado, só o e-mail do dono entra (defesa extra além de desligar o cadastro no Supabase).
  if (user && !publica && !ehDono(user.email)) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    destino.search = "?erro=nao_autorizado";
    return NextResponse.redirect(destino);
  }
  return resposta;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
