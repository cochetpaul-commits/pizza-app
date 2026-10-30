import { describe, expect, it } from "vitest";
import { texteBrut } from "@/lib/pennylane/syncEvenementiel";

describe("textes libres Pennylane", () => {
  it("aplatit le rich text des devis", () => {
    expect(texteBrut('[{"type":"paragraph","children":[{"text":"Arrivée 18H15 "}]},{"type":"paragraph","children":[{"text":"le 17 octobre"}]}]')).toBe("Arrivée 18H15 le 17 octobre");
  });
  it("laisse le texte simple et vide le blanc", () => {
    expect(texteBrut("Mariage le 19/09")).toBe("Mariage le 19/09");
    expect(texteBrut("   ")).toBeNull();
  });
});
