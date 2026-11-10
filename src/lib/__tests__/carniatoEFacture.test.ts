import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseCarniatoInvoiceText } from "@/lib/invoices/carniato";

/** Facture électronique Carniato du 09/11/2026 (XML mis en PDF par la plateforme) */
const texte = readFileSync(join(__dirname, "fixtures/carniato-efacture.txt"), "utf8");

describe("Carniato, facture électronique", () => {
  const f = parseCarniatoInvoiceText(texte);
  it("lit l'en-tête et les totaux", () => {
    expect(f.invoice_number).toBe("201033004");
    expect(f.invoice_date).toBe("09/11/2026");
    expect(f.total_ht).toBe(696.02);
    expect(f.total_ttc).toBe(760.1);
  });
  it("lit les 8 produits et la ligne de frais, la somme recolle au total HT", () => {
    expect(f.lines).toHaveLength(9);
    expect(Math.round(f.lines.reduce((t, l) => t + (l.total_price ?? 0), 0) * 100) / 100).toBe(696.02);
    expect(f.lines[0]).toMatchObject({ sku: "25604", name: "ACQUA FILETTE ABSOL FRIZZ 0,75", quantity: 168, unit: "pc", unit_price: 1.5, total_price: 252, tax_rate: 5.5 });
    expect(f.lines.at(-1)).toMatchObject({ sku: "FRAIS", total_price: 59.77 });
  });
  it("le coût des vins comprend les droits d'accises", () => {
    const monte = f.lines.find((l) => l.sku === "20410")!;
    expect(monte).toMatchObject({ quantity: 12, total_price: 90.38, unit_price: 7.5317, tax_rate: 20 });
    expect(monte.notes).toContain("7.5");
    expect(f.lines.find((l) => l.sku === "5988")).toMatchObject({ name: "LAMBRUSCO GRASP CAST DOC* 0,75", quantity: 6, unit_price: 4.6283 });
  });
});
