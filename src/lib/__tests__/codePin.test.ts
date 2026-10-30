import { describe, expect, it } from "vitest";
import { CODE_VALIDE, hacherCode, verifierCode } from "@/lib/tablette/codePin";

describe("code tablette", () => {
  it("accepte seulement 4 chiffres", () => {
    expect(CODE_VALIDE.test("1234")).toBe(true);
    expect(CODE_VALIDE.test("123")).toBe(false);
    expect(CODE_VALIDE.test("12a4")).toBe(false);
  });
  it("reconnaît le bon code et refuse les autres", () => {
    const h = hacherCode("4321");
    expect(verifierCode("4321", h)).toBe(true);
    expect(verifierCode("1234", h)).toBe(false);
    expect(verifierCode("4321", null)).toBe(false);
    expect(verifierCode("4321", "nimporte")).toBe(false);
  });
  it("sale chaque hachage", () => {
    expect(hacherCode("0000")).not.toBe(hacherCode("0000"));
  });
});
