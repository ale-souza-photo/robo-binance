"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ErroOrdem, type Lado, type Movimento, aplicar, avaliar, cotarOrdem, dividirAporte, negociavel, periodoDca, planejarSincronia, validarOrdem,
} from "@/core/paper";
import { exigirDono } from "@/lib/dono";
import { lerNumero } from "@/lib/format";
import { ativosNegociaveis, carregarMovimentos, lerReservaRockefeller, listarContas, ultimosPrecos } from "@/servico/carteira-db";

/** Preço mais velho que isto não serve para simular ordem (rode a análise para atualizar). */
const PRECO_MAX_IDADE_DIAS = 7;
const UUID = /^[0-9a-f-]{36}$/i;

const volta = (conta: string | null, q: Record<string, string>) => {
  const p = new URLSearchParams({ ...(conta ? { conta } : {}), ...q });
  return `/carteira?${p.toString()}`;
};

function idadeDias(data: string, agora: Date): number {
  return Math.floor((agora.getTime() - Date.parse(`${data}T12:00:00Z`)) / 86_400_000);
}

export async function criarConta(formData: FormData) {
  const { supabase } = await exigirDono();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 60);
  const espelho = formData.get("espelho") === "1";
  const saldo = espelho ? 0 : lerNumero(formData.get("saldo"));
  if (!nome) redirect(volta(null, { erro: "Informe um nome para a conta." }));
  if (!espelho && (!(saldo > 0) || saldo > 1e9)) redirect(volta(null, { erro: "Informe um saldo maior que zero." }));
  const { data: conta, error } = await supabase
    .from("contas_teste").insert({ nome, saldo_inicial: saldo, espelha_reserva: espelho }).select("id").single();
  if (error || !conta) {
    redirect(volta(null, { erro: error?.code === "23505" ? "Você já tem uma conta espelhada na reserva." : "Não consegui criar a conta." }));
  }
  if (espelho) {
    // o saldo vem do Rockefeller: sincroniza já (se a reserva ainda for R$ 0, a conta nasce vazia)
    revalidatePath("/carteira");
    redirect(volta(conta.id as string, { ok: "Conta espelhada criada. Clique em Sincronizar para trazer o saldo da reserva." }));
  }
  const { error: e2 } = await supabase.from("movimentos_teste").insert({
    conta_id: conta.id, tipo: "deposito", taxa: 0, caixa_delta: saldo, nota: "Saldo inicial (fictício)",
  });
  if (e2) {
    await supabase.from("contas_teste").delete().eq("id", conta.id); // não deixa conta sem saldo
    redirect(volta(null, { erro: "Não consegui registrar o saldo inicial." }));
  }
  revalidatePath("/carteira");
  redirect(volta(conta.id as string, { ok: "Conta criada." }));
}

/** Iguala o saldo fictício à reserva de emergência do Rockefeller (só lê de lá). */
export async function sincronizarReserva(formData: FormData) {
  const { supabase } = await exigirDono();
  const contaId = String(formData.get("conta") ?? "");
  if (!UUID.test(contaId)) redirect(volta(null, { erro: "Conta inválida." }));
  let msg: string | null = null;
  let ok = "";
  try {
    const contas = await listarContas(supabase);
    const conta = contas.find((c) => c.id === contaId);
    if (!conta) throw new ErroOrdem("Conta não encontrada.");
    if (!conta.espelhaReserva) throw new ErroOrdem("Esta conta não é espelhada na reserva.");
    const reserva = await lerReservaRockefeller(supabase);
    if (!reserva) throw new ErroOrdem("Não encontrei os dados do Rockefeller para este usuário.");
    const est = aplicar(await carregarMovimentos(supabase, contaId));
    const plano = planejarSincronia(reserva.valor, est);
    if (plano.aviso) throw new ErroOrdem(plano.aviso);
    if (!plano.tipo) {
      ok = "Já está igual à reserva do Rockefeller. Nada a lançar.";
    } else {
      const { error } = await supabase.from("movimentos_teste").insert({
        conta_id: contaId, tipo: plano.tipo, taxa: 0,
        caixa_delta: plano.tipo === "deposito" ? plano.valor : -plano.valor,
        nota: `Reserva do Rockefeller: R$ ${reserva.valor.toFixed(2)}`,
      });
      if (error) throw new Error(error.message);
      ok = plano.tipo === "deposito"
        ? `Entraram R$ ${plano.valor.toFixed(2).replace(".", ",")} (reserva subiu).`
        : `Saíram R$ ${plano.valor.toFixed(2).replace(".", ",")} (reserva caiu).`;
    }
  } catch (e) {
    msg = e instanceof ErroOrdem ? e.message : "Não consegui sincronizar. Tente de novo.";
    if (!(e instanceof ErroOrdem)) console.error("sincronizarReserva falhou:", e);
  }
  revalidatePath("/carteira");
  redirect(volta(contaId, msg ? { erro: msg } : { ok }));
}

/** Apaga a conta e todos os movimentos dela (cascata). Exige a confirmação marcada no formulário. */
export async function excluirConta(formData: FormData) {
  const { supabase } = await exigirDono();
  const contaId = String(formData.get("conta") ?? "");
  if (!UUID.test(contaId)) redirect(volta(null, { erro: "Conta inválida." }));
  if (formData.get("confirmo") !== "1") redirect(volta(contaId, { erro: "Marque a caixa de confirmação para excluir." }));
  const { data, error } = await supabase.from("contas_teste").delete().eq("id", contaId).select("id");
  revalidatePath("/carteira");
  if (error || !data?.length) redirect(volta(contaId, { erro: "Não consegui excluir a conta." }));
  redirect(volta(null, { ok: "Conta excluída." }));
}

export async function depositar(formData: FormData) {
  const { supabase } = await exigirDono();
  const contaId = String(formData.get("conta") ?? "");
  const valor = lerNumero(formData.get("valor"));
  if (!UUID.test(contaId)) redirect(volta(null, { erro: "Conta inválida." }));
  if (!(valor > 0) || valor > 1e9) redirect(volta(contaId, { erro: "Informe um valor maior que zero." }));
  const { error } = await supabase.from("movimentos_teste").insert({
    conta_id: contaId, tipo: "deposito", taxa: 0, caixa_delta: valor, nota: "Aporte (fictício)",
  });
  revalidatePath("/carteira");
  redirect(volta(contaId, error ? { erro: "Não consegui registrar o aporte." } : { ok: "Aporte registrado." }));
}

/** Compra (por valor em R$) ou venda (por quantidade) a mercado, com taxa e slippage. */
export async function negociar(formData: FormData) {
  const { supabase } = await exigirDono();
  const contaId = String(formData.get("conta") ?? "");
  const ativoId = String(formData.get("ativo") ?? "");
  const lado = String(formData.get("lado") ?? "") as Lado;
  if (!UUID.test(contaId)) redirect(volta(null, { erro: "Conta inválida." }));
  if (lado !== "compra" && lado !== "venda") redirect(volta(contaId, { erro: "Escolha comprar ou vender." }));

  let msg: string | null = null;
  try {
    const [contas, ativos, movs] = await Promise.all([listarContas(supabase), ativosNegociaveis(supabase), carregarMovimentos(supabase, contaId)]);
    const conta = contas.find((c) => c.id === contaId);
    if (!conta) throw new ErroOrdem("Conta não encontrada.");
    const ativo = ativos.find((a) => a.id === ativoId);
    if (!ativo || !negociavel(ativo.tipo)) throw new ErroOrdem("Ativo inválido ou desligado.");

    const est = aplicar(movs);
    const precos = await ultimosPrecos(supabase, [ativoId, ...Object.keys(est.posicoes)]);
    const p = precos[ativoId];
    if (!p) throw new ErroOrdem("Este ativo ainda não tem preço salvo. Rode a análise no Painel.");
    const agora = new Date();
    if (idadeDias(p.data, agora) > PRECO_MAX_IDADE_DIAS) {
      throw new ErroOrdem(`O último preço de ${ativoId} é de ${p.data} (desatualizado). Rode a análise no Painel antes.`);
    }
    const pedido = lado === "compra" ? { valor: lerNumero(formData.get("valor")) } : { quantidade: lerNumero(formData.get("quantidade")) };
    const cot = cotarOrdem(lado, ativo.tipo, p.valor, pedido);
    const aval = avaliar(est, Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, v.valor])));
    const erro = validarOrdem(lado, ativoId, cot, est, aval, conta.travaPerda);
    if (erro) throw new ErroOrdem(erro);

    const { error } = await supabase.from("movimentos_teste").insert({
      conta_id: contaId, tipo: lado, ativo_id: ativoId, quantidade: cot.quantidade, preco_exec: cot.precoExec,
      taxa: cot.taxa, caixa_delta: cot.caixaDelta, origem: "manual",
      nota: `Preço de referência ${p.valor} em ${p.data}`,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    msg = e instanceof ErroOrdem ? e.message : "Não consegui registrar a ordem. Tente de novo.";
    if (!(e instanceof ErroOrdem)) console.error("negociar falhou:", e);
  }
  revalidatePath("/carteira");
  redirect(volta(contaId, msg ? { erro: msg } : { ok: lado === "compra" ? "Compra simulada registrada." : "Venda simulada registrada." }));
}

/** DCA simulado: divide o aporte do mês por igual entre os ativos escolhidos. Um por mês e por ativo. */
export async function aportarDca(formData: FormData) {
  const { supabase } = await exigirDono();
  const contaId = String(formData.get("conta") ?? "");
  if (!UUID.test(contaId)) redirect(volta(null, { erro: "Conta inválida." }));
  const escolhidos = [...new Set(formData.getAll("ativo").map(String))];
  const valor = lerNumero(formData.get("valor"));

  let msg: string | null = null;
  let ok = "";
  try {
    if (!(valor > 0)) throw new ErroOrdem("Informe o valor do aporte do mês.");
    if (!escolhidos.length) throw new ErroOrdem("Marque ao menos um ativo.");
    const [contas, ativos, movs] = await Promise.all([listarContas(supabase), ativosNegociaveis(supabase), carregarMovimentos(supabase, contaId)]);
    const conta = contas.find((c) => c.id === contaId);
    if (!conta) throw new ErroOrdem("Conta não encontrada.");
    const porId = new Map(ativos.map((a) => [a.id, a]));
    for (const id of escolhidos) if (!porId.has(id)) throw new ErroOrdem(`Ativo inválido: ${id}.`);

    const periodo = periodoDca(new Date());
    const ja = movs.filter((m) => m.origem === "dca" && m.tipo === "compra" && m.periodo === periodo && escolhidos.includes(m.ativoId as string));
    if (ja.length) throw new ErroOrdem(`O DCA de ${periodo} já foi feito para: ${[...new Set(ja.map((m) => m.ativoId))].join(", ")}.`);

    const partes = dividirAporte(valor, Object.fromEntries(escolhidos.map((id) => [id, 1])));
    let est = aplicar(movs);
    const precos = await ultimosPrecos(supabase, [...escolhidos, ...Object.keys(est.posicoes)]);
    const mapa = () => Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, v.valor]));
    const agora = new Date();
    const novos: Movimento[] = [];
    const linhas: Record<string, unknown>[] = [];
    for (const id of escolhidos) {
      const p = precos[id];
      if (!p) throw new ErroOrdem(`${id} ainda não tem preço salvo. Rode a análise no Painel.`);
      if (idadeDias(p.data, agora) > PRECO_MAX_IDADE_DIAS) throw new ErroOrdem(`O último preço de ${id} é de ${p.data} (desatualizado). Rode a análise antes.`);
      let cot;
      try {
        cot = cotarOrdem("compra", porId.get(id)!.tipo, p.valor, { valor: partes[id] });
      } catch (e) {
        if (e instanceof ErroOrdem) throw new ErroOrdem(`${id}: ${e.message} (parte do aporte: R$ ${partes[id].toFixed(2).replace(".", ",")}). Escolha menos ativos ou aumente o valor.`);
        throw e;
      }
      const erro = validarOrdem("compra", id, cot, est, avaliar(est, mapa()), conta.travaPerda);
      if (erro) throw new ErroOrdem(`${id}: ${erro}`);
      const mov: Movimento = { tipo: "compra", ativoId: id, quantidade: cot.quantidade, precoExec: cot.precoExec, taxa: cot.taxa, caixaDelta: cot.caixaDelta, origem: "dca", periodo };
      est = aplicar([...movs, ...novos, mov]);
      novos.push(mov);
      linhas.push({
        conta_id: contaId, tipo: "compra", ativo_id: id, quantidade: cot.quantidade, preco_exec: cot.precoExec, taxa: cot.taxa,
        caixa_delta: cot.caixaDelta, origem: "dca", periodo, nota: `DCA ${periodo} · preço de ${p.data}`,
      });
    }
    // Um único insert: ou entram todas as compras do mês ou nenhuma.
    const { error } = await supabase.from("movimentos_teste").insert(linhas);
    if (error) {
      if (error.code === "23505") throw new ErroOrdem(`O DCA de ${periodo} já foi feito para algum destes ativos.`);
      throw new Error(error.message);
    }
    ok = `DCA de ${periodo} registrado em ${escolhidos.length} ativo(s).`;
  } catch (e) {
    msg = e instanceof ErroOrdem ? e.message : "Não consegui registrar o DCA. Tente de novo.";
    if (!(e instanceof ErroOrdem)) console.error("aportarDca falhou:", e);
  }
  revalidatePath("/carteira");
  redirect(volta(contaId, msg ? { erro: msg } : { ok }));
}
