import { Cabecalho } from "@/components/Cabecalho";
import MercadoAoVivo, { type ContaMercado, type ItemMercado } from "@/components/MercadoAoVivo";
import { simboloBinance } from "@/core/ao-vivo";
import { aplicar } from "@/core/paper";
import { clienteServidor } from "@/lib/supabase/servidor";
import { carregarMovimentos, historicoRecente, listarContas, ultimosPrecos } from "@/servico/carteira-db";

export const dynamic = "force-dynamic";

export default async function Mercado() {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("ativos").select("id,nome,tipo,referencia").eq("ativo", true).order("id");
  const ativos = (data ?? []).filter((a) => a.tipo !== "renda_fixa"); // o CDI é um índice acumulado, não tem cotação
  const precos = await ultimosPrecos(supabase, ativos.map((a) => a.id as string));
  const itens: ItemMercado[] = await Promise.all(
    ativos.map(async (a) => {
      const id = a.id as string;
      const cripto = a.tipo === "cripto";
      const simbolo = cripto ? simboloBinance(String(a.referencia)) : null;
      return {
        id, nome: a.nome as string,
        modo: cripto && simbolo ? "ws" : a.tipo === "cambio" ? "estatico" : cripto ? "estatico" : "brapi",
        simbolo, fechamento: precos[id]?.valor ?? null, fechamentoData: precos[id]?.data ?? null,
        historico: await historicoRecente(supabase, id, 90),
      } satisfies ItemMercado;
    }),
  );

  const contas = await listarContas(supabase);
  const c = contas.find((x) => x.espelhaReserva) ?? contas[0] ?? null;
  let conta: ContaMercado = null;
  if (c) {
    const est = aplicar(await carregarMovimentos(supabase, c.id));
    conta = {
      nome: c.nome, caixa: est.caixa, aportado: est.aportado,
      posicoes: Object.values(est.posicoes).filter((p) => p.quantidade > 0).map((p) => ({ ativoId: p.ativoId, quantidade: p.quantidade, custoTotal: p.custoTotal })),
    };
  }

  return (
    <>
      <Cabecalho ativa="mercado" />
      <main className="pagina">
        <div className="titulo">
          <div>
            <h1>Mercado ao vivo</h1>
            <p className="sub">Os ativos que você acompanha, com preço em tempo real para cripto e o seu patrimônio de teste recalculado a cada movimento.</p>
          </div>
        </div>
        {itens.length === 0 ? <div className="card"><p className="vazio">Nenhum ativo cadastrado. Vá em ATIVOS e carregue o conjunto padrão.</p></div> : <MercadoAoVivo itens={itens} conta={conta} />}
      </main>
    </>
  );
}
