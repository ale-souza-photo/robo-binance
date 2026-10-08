import Link from "next/link";
import { sair } from "@/app/acoes";
import { Faixa } from "@/components/Faixa";

const ITENS = [
  { href: "/", rotulo: "PAINEL", chave: "painel" },
  { href: "/ativos", rotulo: "ATIVOS", chave: "ativos" },
  { href: "/analises", rotulo: "ANÁLISES", chave: "analises" },
  { href: "/mercado", rotulo: "MERCADO", chave: "mercado" },
  { href: "/sinais", rotulo: "SINAIS", chave: "sinais" },
  { href: "/carteira", rotulo: "CARTEIRA", chave: "carteira" },
] as const;

export function Cabecalho({ ativa }: { ativa: (typeof ITENS)[number]["chave"] }) {
  return (
    <>
    <header className="topo">
      <span className="logo"><span className="sig">T</span>TRADER BIT</span>
      <nav className="menu">
        {ITENS.map((i) => (
          <Link key={i.chave} href={i.href} className={i.chave === ativa ? "on" : ""}>
            {i.rotulo}
          </Link>
        ))}
      </nav>
      <span className="aovivo">AO VIVO</span>
      <span className="chip">SIMULAÇÃO · DINHEIRO FICTÍCIO</span>
      <form action={sair}>
        <button className="sair" type="submit">SAIR</button>
      </form>
    </header>
    <Faixa />
    </>
  );
}
