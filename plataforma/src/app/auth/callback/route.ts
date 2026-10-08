import { NextResponse, type NextRequest } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

/** O link do e-mail volta para cá com um código, que vira sessão. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const codigo = url.searchParams.get("code");
  const destino = url.clone();
  destino.search = "";
  if (codigo) {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    destino.pathname = error ? "/login" : "/";
    if (error) destino.search = "?erro=link_invalido";
  } else {
    destino.pathname = "/login";
    destino.search = "?erro=link_invalido";
  }
  return NextResponse.redirect(destino);
}
