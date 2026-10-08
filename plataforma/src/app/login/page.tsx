import { entrar } from "@/app/acoes";

const ERROS: Record<string, string> = {
  nao_autorizado: "Este e-mail não tem acesso.",
  credenciais: "E-mail ou senha incorretos.",
  link_invalido: "Link inválido ou expirado. Entre com e-mail e senha.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const q = await searchParams;
  return (
    <div className="login">
      <div className="card">
        <h1 className="logo" style={{ fontSize: 28 }}>TRADER BIT</h1>
        <p className="sub">Acesso restrito. Entre com seu e-mail e senha.</p>
        {q.erro && <p className="aviso-topo" style={{ marginTop: 14 }}>{ERROS[q.erro] ?? "Algo deu errado."}</p>}
        <form action={entrar} className="linha" style={{ marginTop: 16 }}>
          <label className="campo">E-MAIL<input name="email" type="email" required autoComplete="email" /></label>
          <label className="campo">SENHA<input name="senha" type="password" required autoComplete="current-password" /></label>
          <button className="btn" type="submit">ENTRAR</button>
        </form>
      </div>
    </div>
  );
}
