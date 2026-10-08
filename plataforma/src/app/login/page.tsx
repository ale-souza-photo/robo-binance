import { entrar } from "@/app/acoes";

const ERROS: Record<string, string> = {
  nao_autorizado: "Este e-mail não tem acesso.",
  falha_envio: "Não consegui enviar o link. Tente de novo em um minuto.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ enviado?: string; erro?: string }> }) {
  const q = await searchParams;
  return (
    <div className="login">
      <div className="card">
        <h1 className="logo" style={{ fontSize: 28 }}>TRADER BIT</h1>
        <p className="sub">Acesso restrito. Informe seu e-mail e enviaremos um link de entrada.</p>
        {q.enviado && <p className="aviso-topo" style={{ marginTop: 14 }}>Se o e-mail tiver acesso, o link chegou na caixa de entrada.</p>}
        {q.erro && <p className="aviso-topo" style={{ marginTop: 14 }}>{ERROS[q.erro] ?? "Algo deu errado."}</p>}
        <form action={entrar} className="linha" style={{ marginTop: 16 }}>
          <label className="campo">E-MAIL<input name="email" type="email" required autoComplete="email" /></label>
          <button className="btn" type="submit">ENVIAR LINK</button>
        </form>
      </div>
    </div>
  );
}
