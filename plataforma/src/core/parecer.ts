import type { ResumoCaixinhas } from "@/core/caixinhas";

/**
 * O "Analista" do Rockefeller: transforma reserva + gastos + estatísticas históricas em um parecer em português simples.
 * Função pura (sem rede, sem banco, sem IA): mesma entrada, mesma saída. Roda de graça todo dia.
 * Educativo. Não é recomendação de investimento: cenários são simulações com base no passado.
 */

export type StatsAtivo = {
  cagr: number;
  piorQueda: number;
  pior12m: number | null;
  mediana12m: number | null;
  melhor12m: number | null;
};

export type AtivoInfo = { id: string; nome: string; tipo: string };

export type EntradaParecer = {
  reserva: number;
  gastoMensal: number;
  /** Quanto sobra por mês para a reserva (plano do Rockefeller). 0 se não sobra. */
  aporteMensal: number;
  metaMeses: number;
  ativos: AtivoInfo[];
  stats: Record<string, StatsAtivo>;
  agora: Date;
  /** Fim do período analisado (para mostrar de onde vêm os dados). */
  dadosAte?: string | null;
};

export type Estado = "sem_reserva" | "abaixo_meta" | "no_limite" | "pode_investir";
export type Categoria = "renda_fixa" | "exterior" | "brasil" | "cambio" | "cripto";

export type Cenario = { pct: number; valor: number };
export type Cenarios = { adverso: Cenario; base: Cenario; favoravel: Cenario };

export type LinhaAtivo = { id: string; nome: string; investir: number; cenarios: Cenarios | null };
export type Bloco = { categoria: Categoria; rotulo: string; pct: number; investir: number; onde: string; ativos: LinhaAtivo[] };

export type Citacao = { texto: string; autor: string; fonte: string; tipo: "documentada" | "atribuída" | "ficção" };
export type Link = { rotulo: string; url: string };

export type Parecer = {
  versao: 1 | 2;
  geradoEm: string;
  dadosAte: string | null;
  estado: Estado;
  perfil: "moderado";
  reserva: number;
  gastoMensal: number;
  metaMeses: number;
  meta: number;
  falta: number;
  investivel: number;
  titulo: string;
  texto: string[];
  mesesParaMeta: number | null;
  blocos: Bloco[];
  carteira: Cenarios | null;
  citacao: Citacao | null;
  links: Link[];
  aviso: string;
  /** Resumo das caixinhas de renda fixa (digitadas no Trader Bit). Ausente se não houver. */
  caixinhas?: ResumoCaixinhas;
};

const PESOS: Record<Categoria, number> = { renda_fixa: 0.5, exterior: 0.2, brasil: 0.2, cambio: 0.05, cripto: 0.05 };
const ROTULOS: Record<Categoria, string> = {
  renda_fixa: "Renda fixa (base segura)",
  exterior: "Exterior (S&P 500 e BDRs)",
  brasil: "Brasil (Ibovespa e ações)",
  cambio: "Dólar (proteção)",
  cripto: "Cripto (risco alto)",
};
const ONDE: Record<Categoria, string> = {
  renda_fixa:
    "Tesouro Selic (Tesouro Direto) ou CDB com liquidez diária pagando 100% do CDI ou mais. Confira no Nubank o que está disponível para você.",
  exterior: "ETF IVVB11 (S&P 500) ou BDRs de empresas americanas, comprados como ação na B3 — pelo Nubank, onde você já negocia.",
  brasil: "ETF BOVA11 (Ibovespa) ou ações de empresas que você entende, comprados na B3 — pelo Nubank.",
  cambio: "Exposição ao dólar por ETF, BDR ou conta global. Peça pequena: serve de proteção, não de aposta.",
  cripto: "Corretora de cripto regulada no Brasil. Parte pequena e que você aceita ver cair pela metade.",
};
const EXTERIOR_IDS = new Set(["IVVB11", "SPXI11", "NASD11", "XINA11"]);

export function categoriaDe(a: AtivoInfo): Categoria | null {
  switch (a.tipo) {
    case "renda_fixa": return "renda_fixa";
    case "cripto": return "cripto";
    case "cambio": return "cambio";
    case "bdr": return "exterior";
    case "etf":
    case "acao": return EXTERIOR_IDS.has(a.id) ? "exterior" : "brasil";
    default: return null;
  }
}

export const LINKS: Link[] = [
  { rotulo: "Tesouro Direto — Tesouro Selic", url: "https://www.tesourodireto.com.br/produtos/tesouro-selic" },
  { rotulo: "Banco Central — taxa Selic e CDI", url: "https://www.bcb.gov.br/controleinflacao/taxaselic" },
  { rotulo: "B3 — bolsa, ETFs e BDRs", url: "https://www.b3.com.br/" },
  { rotulo: "CVM — Portal do Investidor", url: "https://www.gov.br/investidor/pt-br" },
  { rotulo: "FGC — garantia de até R$ 250 mil por CPF e instituição", url: "https://www.fgc.org.br/" },
  { rotulo: "Nubank", url: "https://nubank.com.br/" },
  { rotulo: "Trader Bit — dados e análises", url: "https://robo-binance-ten.vercel.app/" },
];

export const AVISO =
  "Conteúdo educativo, gerado por regras fixas a partir de dados históricos (Banco Central, B3 via brapi, Binance). " +
  "Rentabilidade passada não garante resultado futuro. Cenários são simulações, não promessas, e não são recomendação personalizada. " +
  "Confira custos e impostos de cada produto antes de investir.";

/** Frases reais. "documentada" = vem de livro/texto datado; "atribuída" = amplamente citada, origem não confirmada; "ficção" = personagem/narrador. */
export const CITACOES: Citacao[] = [
  { texto: "Eu acredito na dignidade do trabalho, seja com a cabeça ou com as mãos; que o mundo não deve a ninguém o sustento, mas deve a todos a oportunidade de ganhá-lo.", autor: "John D. Rockefeller Jr.", fonte: "Credo “I Believe”, 1941 (tradução livre)", tipo: "documentada" },
  { texto: "Não tenha medo de abrir mão do bom para ir atrás do ótimo.", autor: "John D. Rockefeller", fonte: "Frase amplamente atribuída a Rockefeller; origem exata não confirmada", tipo: "atribuída" },
  { texto: "O segredo do sucesso é fazer a coisa comum de forma incomum.", autor: "John D. Rockefeller", fonte: "Frase amplamente atribuída (Sr. ou Jr.); origem exata não confirmada", tipo: "atribuída" },
  { texto: "O fracasso é apenas a oportunidade de começar de novo, desta vez com mais inteligência.", autor: "Henry Ford", fonte: "My Life and Work, 1922 (tradução livre)", tipo: "documentada" },
  { texto: "Quer você ache que consegue, quer ache que não consegue, você está certo.", autor: "Henry Ford", fonte: "Frase amplamente atribuída a Ford; origem exata contestada", tipo: "atribuída" },
  { texto: "Eu gosto de pensar grande. Sempre gostei. Para mim é muito simples: se você vai pensar de qualquer jeito, é melhor pensar grande.", autor: "Donald Trump", fonte: "The Art of the Deal, 1987 (tradução livre)", tipo: "documentada" },
  { texto: "Quando algo é importante o bastante, você faz, mesmo que as chances não estejam a seu favor.", autor: "Elon Musk", fonte: "Frase dita em entrevistas e amplamente citada (tradução livre)", tipo: "atribuída" },
  { texto: "Repetir o passado? Ora, claro que se pode!", autor: "Jay Gatsby", fonte: "O Grande Gatsby, F. Scott Fitzgerald, 1925, cap. 6 — personagem de ficção (tradução livre)", tipo: "ficção" },
  { texto: "Gatsby acreditava na luz verde, no futuro que ano após ano se afasta de nós. Ele nos escapou então, mas não importa: amanhã correremos mais rápido, esticaremos mais os braços.", autor: "Nick Carraway, sobre Jay Gatsby", fonte: "O Grande Gatsby, 1925, cap. 9 — ficção (tradução livre)", tipo: "ficção" },
];

const r2 = (x: number) => Math.round(x * 100) / 100;
export const brl = (x: number) => "R$ " + r2(x).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct1 = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1).replace(".", ",") + "%";

function diaDoAno(d: Date): number {
  const ini = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ini) / 86400000);
}

export function escolherCitacao(agora: Date, pool: Citacao[] = CITACOES): Citacao {
  return pool[diaDoAno(agora) % pool.length];
}

/** Retornos de 12 meses do passado, em ordem adverso <= base <= favorável. */
export function cenariosDe(s: StatsAtivo): { adverso: number; base: number; favoravel: number } {
  const adverso = s.pior12m ?? -Math.abs(s.piorQueda);
  const base = s.mediana12m ?? s.cagr;
  const favoravel = s.melhor12m ?? s.cagr;
  const a = Math.min(adverso, base, favoravel);
  const f = Math.max(adverso, base, favoravel);
  const m = Math.min(Math.max(base, a), f);
  return { adverso: a, base: m, favoravel: f };
}

function aplicar(valor: number, c: { adverso: number; base: number; favoravel: number }): Cenarios {
  const mk = (p: number): Cenario => ({ pct: p, valor: r2(valor * p) });
  return { adverso: mk(c.adverso), base: mk(c.base), favoravel: mk(c.favoravel) };
}

export function montarBlocos(valor: number, ativos: AtivoInfo[], stats: Record<string, StatsAtivo>): Bloco[] {
  const porCat = new Map<Categoria, AtivoInfo[]>();
  for (const a of ativos) {
    const c = categoriaDe(a);
    if (!c) continue;
    if (c !== "renda_fixa" && !stats[a.id]) continue; // sem dados, sem sugestão
    porCat.set(c, [...(porCat.get(c) ?? []), a]);
  }
  // categorias sem nenhum ativo seu: o peso vai para renda fixa
  let pesoRF = PESOS.renda_fixa;
  const pesos: Partial<Record<Categoria, number>> = {};
  for (const c of Object.keys(PESOS) as Categoria[]) {
    if (c === "renda_fixa") continue;
    if (porCat.has(c)) pesos[c] = PESOS[c];
    else pesoRF += PESOS[c];
  }
  pesos.renda_fixa = pesoRF;

  const ordem: Categoria[] = ["renda_fixa", "exterior", "brasil", "cambio", "cripto"];
  const blocos: Bloco[] = [];
  for (const c of ordem) {
    const p = pesos[c];
    if (!p) continue;
    const cat = r2(valor * p);
    const lista = porCat.get(c) ?? [];
    const linhas: LinhaAtivo[] = lista.length
      ? lista.map((a) => ({
          id: a.id, nome: a.nome, investir: r2(cat / lista.length),
          cenarios: stats[a.id] ? aplicar(r2(cat / lista.length), cenariosDe(stats[a.id])) : null,
        }))
      : [{ id: "RF", nome: "Tesouro Selic / CDB liquidez diária", investir: cat, cenarios: null }];
    blocos.push({ categoria: c, rotulo: ROTULOS[c], pct: p, investir: cat, onde: ONDE[c], ativos: linhas });
  }
  return blocos;
}

function somarCarteira(blocos: Bloco[]): Cenarios | null {
  let total = 0, temDados = false;
  const s = { adverso: 0, base: 0, favoravel: 0 };
  for (const b of blocos) for (const a of b.ativos) {
    total += a.investir;
    if (a.cenarios) { temDados = true; s.adverso += a.cenarios.adverso.valor; s.base += a.cenarios.base.valor; s.favoravel += a.cenarios.favoravel.valor; }
  }
  if (!temDados || total <= 0) return null;
  const mk = (v: number): Cenario => ({ valor: r2(v), pct: v / total });
  return { adverso: mk(s.adverso), base: mk(s.base), favoravel: mk(s.favoravel) };
}

export function gerarParecer(e: EntradaParecer): Parecer {
  const reserva = Math.max(0, e.reserva);
  const meta = r2(Math.max(0, e.gastoMensal) * e.metaMeses);
  const lacuna = r2(Math.max(0, meta - reserva));
  // Regra do dono: investe-se o saldo da reserva de hoje, inteiro. A meta de meses vira só aviso de risco.
  const investivel = r2(reserva);
  const estado: Estado = reserva <= 0 ? "sem_reserva" : investivel < 50 ? "no_limite" : "pode_investir";
  const mesesParaMeta = lacuna > 0 && e.aporteMensal > 0 ? Math.ceil(lacuna / e.aporteMensal) : null;

  // `falta` sai sempre 0: a interface trata falta>0 como "bloqueado". A lacuna da meta vai no texto.
  const base: Parecer = {
    versao: 2, geradoEm: e.agora.toISOString(), dadosAte: e.dadosAte ?? null, estado, perfil: "moderado",
    reserva: r2(reserva), gastoMensal: r2(e.gastoMensal), metaMeses: e.metaMeses, meta, falta: 0, investivel,
    titulo: "", texto: [], mesesParaMeta, blocos: [], carteira: null, citacao: null, links: LINKS, aviso: AVISO,
  };

  if (estado === "sem_reserva" || estado === "no_limite") {
    base.citacao = escolherCitacao(e.agora);
    if (estado === "sem_reserva") {
      base.titulo = "Primeiro a muralha, depois o ouro.";
      base.texto = [
        "Você ainda não tem saldo na reserva. Sem capital, não há o que investir hoje.",
        "Guarde o primeiro valor, mesmo pequeno, em Tesouro Selic ou CDB de liquidez diária. Volto amanhã às 10h.",
      ];
    } else {
      base.titulo = "Saldo pequeno demais para dividir.";
      base.texto = [
        `Sua reserva de hoje é ${brl(reserva)}. Abaixo de R$ 50 não compensa dividir em ativos (taxas e mínimos comem o resultado).`,
        "Deixe crescer em Tesouro Selic ou CDB de liquidez diária e volte aqui.",
      ];
    }
    base.links = LINKS.filter((l) => /Tesouro|Banco Central|FGC|CVM/.test(l.rotulo));
    return base;
  }

  const blocos = montarBlocos(investivel, e.ativos, e.stats);
  const carteira = somarCarteira(blocos);
  base.blocos = blocos;
  base.carteira = carteira;
  base.titulo = "Saldo da reserva de hoje: capital pronto para trabalhar.";
  base.texto = [
    `Seu saldo na reserva hoje é ${brl(reserva)}. Pelo seu critério, esse é o valor que o Analista distribui, para o perfil moderado.`,
    lacuna > 0
      ? `Atenção: investir tudo deixa a reserva abaixo da meta de ${e.metaMeses} meses de gastos (${brl(meta)}). Se surgir uma emergência, renda variável e cripto podem estar em queda na hora do resgate. Por isso a base de renda fixa pesa 50% e o resto fica em parcelas.`
      : `Sua reserva já cobre a meta de ${e.metaMeses} meses (${brl(meta)}), então a folga para assumir risco é maior.`,
    carteira
      ? `Olhando 12 meses a partir de janelas do passado: no cenário adverso a carteira ${carteira.adverso.valor < 0 ? "perderia" : "ganharia"} ${brl(Math.abs(carteira.adverso.valor))} (${pct1(carteira.adverso.pct)}); no base, ${brl(carteira.base.valor)} (${pct1(carteira.base.pct)}); no favorável, ${brl(carteira.favoravel.valor)} (${pct1(carteira.favoravel.pct)}).`
      : "Ainda não há histórico suficiente nos ativos para projetar 12 meses.",
    "Entre aos poucos, em parcelas mensais, e só com o que você não vai precisar nos próximos meses.",
  ];
  return base;
}

/** Gasto mensal médio (saídas) dos meses até o mês atual — mesma regra do Rockefeller (`mediaGastos`). */
export function gastoMensalDe(tx: { type?: string; amount?: number; date?: string }[], hoje: string): number {
  const meses: Record<string, number> = {};
  for (const t of tx) {
    if (t.type !== "out" || typeof t.amount !== "number" || typeof t.date !== "string") continue;
    const ym = t.date.slice(0, 7);
    meses[ym] = (meses[ym] ?? 0) + t.amount;
  }
  const ate = Object.keys(meses).filter((k) => k <= hoje.slice(0, 7));
  const ks = ate.length ? ate : Object.keys(meses);
  return ks.length ? ks.reduce((a, k) => a + meses[k], 0) / ks.length : 0;
}

/** Quanto do mês corrente (entradas − saídas) o plano manda para a reserva. */
export function aporteMensalDe(tx: { type?: string; amount?: number; date?: string }[], hoje: string, pctReserva: number): number {
  const ym = hoje.slice(0, 7);
  let ent = 0, sai = 0;
  for (const t of tx) {
    if (typeof t.amount !== "number" || typeof t.date !== "string" || t.date.slice(0, 7) !== ym) continue;
    if (t.type === "in") ent += t.amount; else if (t.type === "out") sai += t.amount;
  }
  return r2(Math.max(0, ent - sai) * (Math.max(0, pctReserva) / 100));
}
