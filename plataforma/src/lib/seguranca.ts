import { timingSafeEqual } from "node:crypto";

/** Confere `Authorization: Bearer <segredo>` em tempo constante (o tempo de resposta não revela quantos caracteres estavam certos). */
export function bearerConfere(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo) return false;
  const a = Buffer.from(cabecalho ?? "");
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
