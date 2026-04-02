/**
 * Parser for Vinoflo bordereau de commande / facture PDF.
 *
 * Format: "Appellation / Designation  Millé. Couleur Format Qté PU HT PHT"
 * Example line: "Vénétie / ITALO CESCON - ALLEGRETTO 2020 ROUGE 0,750 36 8,20 € 295,20 €"
 *
 * Footer: "Montant net total HT : 1 012,50 €"
 * Header: "BORDEREAU DE COMMANDE BELLO MIO N° 1640 du 28/01/2025"
 */

import type { ParsedInvoice, ParsedLine } from "@/lib/invoices/importEngine";

function parseFr(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(",", ".").replace("€", "")) || 0;
}

export function parseVinofloCommande(rawText: string): ParsedInvoice {
  const lines: ParsedLine[] = [];

  // Extract invoice number + date
  // "BORDEREAU DE COMMANDE BELLO MIO N° 1640 du 28/01/2025"
  // or "FACTURE ... N° xxx du DD/MM/YYYY"
  let invoiceNumber: string | null = null;
  let invoiceDate: string | null = null;

  const headerMatch = rawText.match(/N[°o]\s*(\d+)\s+du\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (headerMatch) {
    invoiceNumber = headerMatch[1];
    const [dd, mm, yyyy] = headerMatch[2].split("/");
    invoiceDate = `${dd}/${mm}/${yyyy}`;
  }

  // Extract total HT
  let totalHt: number | null = null;
  const totalMatch = rawText.match(/(?:Montant\s+net\s+total|Total)\s*(?:HT)?\s*[:=]?\s*([\d\s.,]+)\s*€/i);
  if (totalMatch) {
    totalHt = parseFr(totalMatch[1]);
  }

  // Parse product lines
  // Pattern: text before qty+price, then Qté (integer), PU HT (decimal €), PHT (decimal €)
  // "Vénétie / ITALO CESCON - ALLEGRETTO 2020 ROUGE 0,750 36 8,20  € 295,20  €"
  //
  // Strategy: find lines ending with "number €  number €" pattern
  const lineRegex = /^(.+?)\s+(\d+)\s+([\d,]+)\s*€\s+([\d\s,]+)\s*€\s*(.*)$/gm;

  let match;
  while ((match = lineRegex.exec(rawText)) !== null) {
    const rawName = match[1].trim();
    const qty = parseInt(match[2], 10);
    const unitPrice = parseFr(match[3]);
    const totalPrice = parseFr(match[4]);
    const remark = match[5]?.trim() || null;

    // Skip header/total lines
    if (rawName.toLowerCase().includes("appellation") || rawName.toLowerCase().includes("désignation")) continue;
    if (rawName.toLowerCase().includes("qté totale") || rawName.toLowerCase().includes("total")) continue;
    if (qty === 0 && totalPrice === 0) continue;

    // Clean up the name: extract just the wine name
    // Format: "Region / PRODUCER - WINE_NAME YEAR COLOR FORMAT"
    // We want: "PRODUCER - WINE_NAME" or the full thing
    let name = rawName;
    // Remove trailing format (0,750 / 1,500 etc.)
    name = name.replace(/\s+\d,\d{3}\s*$/, "").trim();
    // Remove trailing color (ROUGE, BLANC, ROSÉ)
    name = name.replace(/\s+(ROUGE|BLANC|ROSÉ|ROSE)\s*$/i, "").trim();

    lines.push({
      sku: null,
      name: name.toUpperCase(),
      quantity: qty,
      unit: "pc",
      unit_price: unitPrice,
      total_price: totalPrice,
      tax_rate: null,
      notes: remark,
      piece_weight_g: null,
      piece_volume_ml: 750, // Default wine bottle
    });
  }

  return {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    total_ht: totalHt,
    total_ttc: null,
    lines,
  };
}
