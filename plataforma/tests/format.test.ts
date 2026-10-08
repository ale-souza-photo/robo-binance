import { describe, expect, it } from "vitest";
import { lerNumero } from "@/lib/format";

describe("lerNumero (pt-BR)", () => {
  it("aceita vírgula decimal e ponto de milhar", () => {
    expect(lerNumero("100")).toBe(100);
    expect(lerNumero("100,5")).toBe(100.5);
    expect(lerNumero("1.000,50")).toBe(1000.5);
    expect(lerNumero("R$ 2.500,00")).toBe(2500);
    expect(lerNumero("0,001")).toBe(0.001);
  });
  it("aceita ponto decimal simples (formato do navegador)", () => {
    expect(lerNumero("100.5")).toBe(100.5);
  });
  it("lixo vira NaN, nunca um número", () => {
    for (const t of ["", "abc", "1,2,3", "1e5", "--5", null, undefined, "10 reais"]) expect(Number.isNaN(lerNumero(t))).toBe(true);
  });
});
