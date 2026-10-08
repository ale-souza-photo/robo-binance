import { SinaisView } from "@/components/SinaisView";
import { negociavel } from "@/core/paper";
import { montarCartao } from "@/core/sinais-cartao";
import { clienteServidor } from "@/lib/supabase/servidor";
import { precosHistoricos } from "@/servico/sinais-db";

export const dynamic = "force-dynamic";

export default async function Sinais() {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("ativos").select("id,nome,tipo").eq("ativo", true).order("id");
  const ativos = (data ?? []).filter((a) => negociavel(a.tipo as string));
  const cartoes = await Promise.all(
    ativos.map(async (a) => {
      const { datas, valores } = await precosHistoricos(supabase, a.id as string);
      return montarCartao(a.id as string, a.nome as string, a.tipo as string, datas, valores);
    }),
  );
  return <SinaisView cartoes={cartoes} />;
}
