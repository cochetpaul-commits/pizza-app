/**
 * Script batch d'import des factures Bar Spirits pour Bello Mio.
 * Usage: source .env.local && npx tsx scripts/import-barspirits-batch.ts
 */
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "../src/lib/pdfToText";
import { parseBarSpiritsInvoiceText } from "../src/lib/invoices/barspirits";
import { runImport } from "../src/lib/invoices/importEngine";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const USER_ID = "bd335e2e-6a50-4311-89b4-8f735cf6bc0b"; // cochetpierre@bellomio.fr
const ETAB_ID = "93dddd48-21f5-44e9-83aa-024af53bce83"; // Bello Mio

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env vars. Run: source .env.local && npx tsx scripts/import-barspirits-batch.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const FILES = [
  path.join(process.env.HOME!, "Downloads/A01-F-2025-00818.pdf"),
  path.join(process.env.HOME!, "Downloads/A01-F-2025-00924.pdf"),
  path.join(process.env.HOME!, "Downloads/A01-F-2025-00967.pdf"),
  path.join(process.env.HOME!, "Downloads/Bar Spirits_08042026.pdf"),
  path.join(process.env.HOME!, "Downloads/Bar Spirits_08042026-2.pdf"),
  path.join(process.env.HOME!, "Downloads/FA2500000157_SASHA(BELLOMIO).pdf"),
  path.join(process.env.HOME!, "Downloads/FA2500000212_SASHA(BELLOMIO).pdf"),
  path.join(process.env.HOME!, "Downloads/FA2500000270_SASHA(BELLOMIO).pdf"),
  path.join(process.env.HOME!, "Downloads/FA2500000307_SASHA(BELLOMIO).pdf"),
  path.join(process.env.HOME!, "Downloads/FA2500000320_SASHA(BELLOMIO).pdf"),
];

async function importFile(filePath: string) {
  const fileName = path.basename(filePath);
  console.log(`\n--- ${fileName} ---`);

  if (!fs.existsSync(filePath)) {
    console.log("  SKIP: fichier introuvable");
    return;
  }

  const bytes = new Uint8Array(fs.readFileSync(filePath));
  let text = await pdfToText(bytes);

  // Check if text is readable (SASHA PDFs have garbled encoding)
  const hasReadableText = /[a-zA-Z]{3,}/.test(text);
  if (!hasReadableText) {
    console.log("  SKIP: encoding illisible (facture SASHA) - importer via l'UI avec OCR");
    return;
  }

  const payload = parseBarSpiritsInvoiceText(text);

  if (payload.lines.length === 0) {
    console.log("  SKIP: aucune ligne produit parsee");
    return;
  }

  console.log(`  Facture: ${payload.invoice_number ?? "?"} du ${payload.invoice_date ?? "?"}`);
  console.log(`  Total HT: ${payload.total_ht ?? "?"}€ | ${payload.lines.length} lignes`);
  for (const l of payload.lines) {
    console.log(`    - ${l.name} | qty=${l.quantity} | ${l.unit_price}€ HT`);
  }

  try {
    const result = await runImport({
      supabase,
      userId: USER_ID,
      supplierName: "BAR SPIRITS",
      payload,
      sourceFileName: fileName,
      rawText: text,
      mode: "import",
      defaultUnit: "pc",
      establishment: "bellomio",
      etabId: ETAB_ID,
    });

    if (result.invoiceAlreadyImported) {
      console.log(`  => DEJA IMPORTEE`);
    } else {
      console.log(`  => OK | ingredients crees: ${result.ingredientsCreated} | offres: ${result.offersInserted}`);
    }
  } catch (err) {
    console.log(`  => ERREUR: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  console.log("=== Import batch Bar Spirits pour Bello Mio ===\n");

  for (const f of FILES) {
    await importFile(f);
  }

  console.log("\n=== Termine ===");
}

main();
