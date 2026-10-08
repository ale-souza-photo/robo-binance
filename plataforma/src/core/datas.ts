/** Datas como texto 'AAAA-MM-DD' (sem fuso: evita erro de horário de verão e de UTC). */
export type Dia = string;

const MS_DIA = 86_400_000;

export const paraMs = (d: Dia): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const diasEntre = (a: Dia, b: Dia): number => Math.round((paraMs(b) - paraMs(a)) / MS_DIA);
export const somaDias = (d: Dia, n: number): Dia => new Date(paraMs(d) + n * MS_DIA).toISOString().slice(0, 10);
export const anoDe = (d: Dia): number => +d.slice(0, 4);
export const mesDe = (d: Dia): number => +d.slice(5, 7);
export const diaDoMes = (d: Dia): number => +d.slice(8, 10);
export const dePosixSegundos = (s: number): Dia => new Date(s * 1000).toISOString().slice(0, 10);
export const deMilissegundos = (ms: number): Dia => new Date(ms).toISOString().slice(0, 10);
export const hojeUtc = (): Dia => new Date().toISOString().slice(0, 10);
