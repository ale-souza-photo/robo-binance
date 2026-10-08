export const nf = (n: number | null | undefined, d = 2): string =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (n: number | null | undefined, d = 1): string =>
  n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.abs(100 * n), d)}%`;

export const reais = (n: number | null | undefined, d = 0): string => (n == null ? "—" : `R$ ${nf(n, d)}`);

export const dataBr = (iso: string | null | undefined): string =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR") : "—";

export const horaBr = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const queda = (q: number): string => (q < 0.005 ? "0%" : `−${nf(100 * q, 0)}%`);
