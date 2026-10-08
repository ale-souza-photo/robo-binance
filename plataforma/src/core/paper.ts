/**
 * Motor do paper trading (dinheiro fictício). Funções puras: sem rede e sem banco.
 * O caixa e as posições são SEMPRE derivados do livro de movimentos, então nunca ficam fora de sincronia.
 *
 * Execução conservadora (igual ao laboratório em Python): taxa por lado + slippage contra você.
 * O preço usado é o último preço salvo (fechamento diário). Cotação ao vivo vem na fase 5.
 */

export type TipoAtivo = "cripto" | "bdr" | "acao" | "etf" | "cambio" | "renda_fixa";
export type Lado = "compra" | "venda";

/** Só estes tipos podem ser negociados. Dólar e CDI são índices de referência, não ativos de compra. */
const NEGOCIAVEIS: TipoAtivo[] = ["cripto", "bdr", "acao", "etf"];
export const negociavel = (t: string): boolean => (NEGOCIAVEIS as string[]).includes(t);

export type Custos = { taxa: number; slippage: number };
/** Cripto: 0,10% por lado (taxa spot da Binance). Bolsa: 0,03% (emolumentos + liquidação, corretagem zero). */
export function custosDoTipo(tipo: string): Custos {
  return tipo === "cripto" ? { taxa: 0.001, slippage: 0.0005 } : { taxa: 0.0003, slippage: 0.0005 };
}

export type Movimento = {
  tipo: "deposito" | "compra" | "venda" | "retirada";
  ativoId?: string | null;
  quantidade?: number | null;
  precoExec?: number | null;
  taxa: number;
  /** Variação do caixa em R$ (positivo entra, negativo sai). */
  caixaDelta: number;
  origem?: "manual" | "dca";
  periodo?: string | null;
};

const arred = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.round(n * f + Number.EPSILON * Math.sign(n)) / f;
};
const abaixo = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.floor(n * f + 1e-9) / f;
};

export type Cotacao = { quantidade: number; precoExec: number; taxa: number; caixaDelta: number };

export class ErroOrdem extends Error {}

/**
 * Simula a execução a mercado.
 * - Compra por VALOR (R$ totais a gastar, taxa inclusa): cripto aceita fração (8 casas); bolsa só unidades inteiras.
 * - Venda por QUANTIDADE.
 */
export function cotarOrdem(
  lado: Lado,
  tipoAtivo: string,
  precoMercado: number,
  pedido: { valor?: number; quantidade?: number },
): Cotacao {
  if (!negociavel(tipoAtivo)) throw new ErroOrdem(`Este tipo de ativo (${tipoAtivo}) não é negociável.`);
  if (!(precoMercado > 0) || !Number.isFinite(precoMercado)) throw new ErroOrdem("Sem preço válido para este ativo. Rode a análise primeiro.");
  const { taxa: t, slippage: s } = custosDoTipo(tipoAtivo);
  const cripto = tipoAtivo === "cripto";
  if (lado === "compra") {
    const valor = pedido.valor ?? 0;
    if (!(valor > 0)) throw new ErroOrdem("Informe um valor em R$ maior que zero.");
    const precoExec = precoMercado * (1 + s);
    const bruto = valor / (1 + t);
    const qtd = cripto ? abaixo(bruto / precoExec, 8) : Math.floor(bruto / precoExec + 1e-9);
    if (!(qtd > 0)) {
      throw new ErroOrdem(
        cripto
          ? "Valor pequeno demais para comprar qualquer fração."
          : `Valor insuficiente para 1 unidade (preço ≈ R$ ${precoExec.toFixed(2).replace(".", ",")}).`,
      );
    }
    const custoBruto = qtd * precoExec;
    const taxa = arred(custoBruto * t, 6);
    // O caixa cai só pelo que foi realmente executado (a sobra de arredondamento fica no caixa).
    return { quantidade: qtd, precoExec, taxa, caixaDelta: -arred(custoBruto + taxa, 6) };
  }
  const qtd = pedido.quantidade ?? 0;
  if (!(qtd > 0)) throw new ErroOrdem("Informe uma quantidade maior que zero.");
  const precoExec = precoMercado * (1 - s);
  const bruto = qtd * precoExec;
  const taxa = arred(bruto * t, 6);
  return { quantidade: qtd, precoExec, taxa, caixaDelta: arred(bruto - taxa, 6) };
}

export type Posicao = { ativoId: string; quantidade: number; custoTotal: number; precoMedio: number };
export type Estado = {
  caixa: number;
  aportado: number;
  taxasPagas: number;
  posicoes: Record<string, Posicao>;
};

/** Reconstrói o estado da conta a partir do livro. Custo médio ponderado (venda reduz o custo na proporção). */
export function aplicar(movs: Movimento[]): Estado {
  const est: Estado = { caixa: 0, aportado: 0, taxasPagas: 0, posicoes: {} };
  for (const m of movs) {
    est.caixa += m.caixaDelta;
    est.taxasPagas += m.taxa;
    if (m.tipo === "deposito" || m.tipo === "retirada") {
      // retirada tem caixaDelta negativo: reduz o aportado, então o resultado continua honesto
      est.aportado += m.caixaDelta;
      continue;
    }
    const id = m.ativoId as string;
    const qtd = m.quantidade ?? 0;
    const p = est.posicoes[id] ?? { ativoId: id, quantidade: 0, custoTotal: 0, precoMedio: 0 };
    if (m.tipo === "compra") {
      p.quantidade += qtd;
      p.custoTotal += -m.caixaDelta; // inclui a taxa: o custo real da posição
    } else {
      const frac = p.quantidade > 0 ? Math.min(1, qtd / p.quantidade) : 1;
      p.custoTotal -= p.custoTotal * frac;
      p.quantidade -= qtd;
    }
    if (p.quantidade < 1e-9) {
      p.quantidade = 0;
      p.custoTotal = 0;
    }
    p.precoMedio = p.quantidade > 0 ? p.custoTotal / p.quantidade : 0;
    est.posicoes[id] = p;
  }
  est.caixa = arred(est.caixa, 6);
  est.taxasPagas = arred(est.taxasPagas, 6);
  return est;
}

export type LinhaPosicao = Posicao & { preco: number | null; valor: number | null; resultado: number | null; retorno: number | null };
export type Avaliacao = {
  caixa: number;
  valorPosicoes: number;
  patrimonio: number;
  aportado: number;
  resultado: number;
  retorno: number | null;
  taxasPagas: number;
  posicoes: LinhaPosicao[];
  semPreco: string[];
};

/** Marca as posições a mercado. Sem preço para algum ativo, ele entra pelo custo e é listado em `semPreco`. */
export function avaliar(est: Estado, precos: Record<string, number | null | undefined>): Avaliacao {
  const linhas: LinhaPosicao[] = [];
  const semPreco: string[] = [];
  let valorPosicoes = 0;
  for (const p of Object.values(est.posicoes)) {
    if (p.quantidade <= 0) continue;
    const preco = precos[p.ativoId] ?? null;
    if (preco == null) {
      semPreco.push(p.ativoId);
      valorPosicoes += p.custoTotal;
      linhas.push({ ...p, preco: null, valor: null, resultado: null, retorno: null });
      continue;
    }
    const valor = p.quantidade * preco;
    valorPosicoes += valor;
    linhas.push({ ...p, preco, valor, resultado: valor - p.custoTotal, retorno: p.custoTotal > 0 ? valor / p.custoTotal - 1 : null });
  }
  const patrimonio = est.caixa + valorPosicoes;
  return {
    caixa: est.caixa,
    valorPosicoes,
    patrimonio,
    aportado: est.aportado,
    resultado: patrimonio - est.aportado,
    retorno: est.aportado > 0 ? patrimonio / est.aportado - 1 : null,
    taxasPagas: est.taxasPagas,
    posicoes: linhas.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)),
    semPreco,
  };
}

/**
 * Travas de segurança. Devolvem a mensagem de erro ou `null` se a ordem pode seguir.
 * - saldo: não gasta mais que o caixa; não vende mais do que tem (sem venda a descoberto);
 * - trava de perda: se o patrimônio já caiu `travaPerda` (ex.: 20%) abaixo do que foi aportado, bloqueia NOVAS COMPRAS.
 */
export function validarOrdem(
  lado: Lado,
  ativoId: string,
  cot: Cotacao,
  est: Estado,
  aval: Avaliacao,
  travaPerda: number,
): string | null {
  if (lado === "compra") {
    if (-cot.caixaDelta > est.caixa + 1e-9) return `Saldo insuficiente: caixa de R$ ${est.caixa.toFixed(2).replace(".", ",")}.`;
    if (est.aportado > 0 && aval.patrimonio <= est.aportado * (1 - travaPerda)) {
      return `Trava de perda ativa: o patrimônio caiu ${(travaPerda * 100).toFixed(0)}% ou mais abaixo do aportado. Novas compras bloqueadas.`;
    }
    return null;
  }
  const tem = est.posicoes[ativoId]?.quantidade ?? 0;
  if (cot.quantidade > tem + 1e-9) return `Você só tem ${tem} de ${ativoId}.`;
  return null;
}

/** Divide um valor por pesos (somam 1). O resto de centavos vai para o maior peso, para o total fechar. */
export function dividirAporte(valor: number, pesos: Record<string, number>): Record<string, number> {
  const ids = Object.keys(pesos);
  if (!ids.length) throw new ErroOrdem("Escolha ao menos um ativo.");
  const soma = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (!(soma > 0)) throw new ErroOrdem("Pesos inválidos.");
  const partes: Record<string, number> = {};
  let usado = 0;
  for (const id of ids) {
    partes[id] = abaixo((valor * pesos[id]) / soma, 2);
    usado += partes[id];
  }
  const maior = ids.reduce((a, b) => (pesos[b] > pesos[a] ? b : a));
  partes[maior] = arred(partes[maior] + (valor - usado), 2);
  return partes;
}

/** Período do DCA (um por mês), no fuso de Brasília: '2026-10'. */
export const periodoDca = (agora: Date): string => {
  const br = new Date(agora.getTime() - 3 * 3_600_000);
  return br.toISOString().slice(0, 7);
};

export type PlanoSincronia = { tipo: "deposito" | "retirada" | null; valor: number; aviso?: string };

/**
 * Compara a reserva de emergência (saldo real no Rockefeller) com o que a conta de teste já recebeu
 * (`aportado`) e decide o que lançar para igualar. Retirada só sai do caixa livre: se a reserva caiu mais do
 * que o caixa, o excedente é recusado (seria preciso vender posições antes) e a conta fica sem mexer.
 */
export function planejarSincronia(reserva: number, est: Estado): PlanoSincronia {
  if (!Number.isFinite(reserva) || reserva < 0) throw new ErroOrdem("Reserva inválida no Rockefeller.");
  const alvo = arred(reserva, 2);
  const dif = arred(alvo - est.aportado, 2);
  if (dif === 0) return { tipo: null, valor: 0 };
  if (dif > 0) return { tipo: "deposito", valor: dif };
  const saque = -dif;
  if (saque > est.caixa + 1e-9) {
    return {
      tipo: null,
      valor: 0,
      aviso: `A reserva caiu R$ ${saque.toFixed(2).replace(".", ",")}, mas só há R$ ${Math.max(0, est.caixa).toFixed(2).replace(".", ",")} em caixa. Venda posições antes de sincronizar.`,
    };
  }
  return { tipo: "retirada", valor: saque };
}
