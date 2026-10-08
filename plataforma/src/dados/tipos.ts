import type { Serie } from "@/core/series";

export type Fonte = "binance" | "bcb_usd" | "bcb_cdi" | "brapi" | "yahoo";

/** Um ativo acompanhado. `ref` depende da fonte: par da Binance (BTC/BRL), série do BCB ou ticker da bolsa. */
export type AtivoDef = { id: string; nome: string; fonte: Fonte; ref: string; fallback?: { fonte: Fonte; ref: string } };

/** A rede é injetada (global `fetch` em produção, falso nos testes). */
export type FetchLike = typeof fetch;

export type OpcoesCarga = { anos: number; fetch: FetchLike; brapiToken?: string; agora?: Date };

export class ErroFonte extends Error {
  constructor(
    public fonte: string,
    mensagem: string,
  ) {
    super(`${fonte}: ${mensagem}`);
    this.name = "ErroFonte";
  }
}

export type { Serie };
