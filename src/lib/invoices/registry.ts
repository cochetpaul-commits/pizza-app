import type { ParsedInvoice } from "@/lib/invoices/importEngine";
import { parseMaelInvoiceText } from "@/lib/invoices/mael";
import { parseMetroInvoiceText } from "@/lib/invoices/metro";
import { parseMasseInvoiceText } from "@/lib/invoices/masse";
import { parseCozigouInvoiceText } from "@/lib/invoices/cozigou";
import { parseVinofloInvoiceText } from "@/lib/invoices/vinoflo";
import { parseCarniatoInvoiceText } from "@/lib/invoices/carniato";
import { parseBarSpiritsInvoiceText } from "@/lib/invoices/barspirits";
import { parseSumInvoiceText } from "@/lib/invoices/sum";
import { parseArmorInvoiceText } from "@/lib/invoices/armor";
import { parseLmdwInvoiceText } from "@/lib/invoices/lmdw";
import { parseSdpfInvoiceText } from "@/lib/invoices/sdpf";
import { parseElienInvoiceText } from "@/lib/invoices/elien";
import { parseHardyInvoiceText } from "@/lib/invoices/hardy";
import { parseSnakInvoiceText } from "@/lib/invoices/snak";
import { parsePomonaInvoiceText } from "@/lib/invoices/pomona";
import { parseBillardInvoiceText } from "@/lib/invoices/billard";

/**
 * Registre des parsers dédiés : slug de détection (invoiceDetector) →
 * fonction de parse + nom fournisseur canonique + unité par défaut.
 * Mêmes valeurs que les routes /api/invoices/<slug>.
 */
export type ParserEntry = {
  parse: (text: string) => ParsedInvoice;
  supplierName: string;
  defaultUnit: "g" | "pc" | "kg" | "l";
};

export const PARSERS: Record<string, ParserEntry> = {
  mael:       { parse: parseMaelInvoiceText,       supplierName: "MAEL",             defaultUnit: "g" },
  metro:      { parse: parseMetroInvoiceText,      supplierName: "METRO",            defaultUnit: "g" },
  masse:      { parse: parseMasseInvoiceText,      supplierName: "MASSE",            defaultUnit: "kg" },
  cozigou:    { parse: parseCozigouInvoiceText,    supplierName: "COZIGOU",          defaultUnit: "g" },
  vinoflo:    { parse: parseVinofloInvoiceText,    supplierName: "VINOFLO",          defaultUnit: "pc" },
  carniato:   { parse: parseCarniatoInvoiceText,   supplierName: "CARNIATO",         defaultUnit: "g" },
  barspirits: { parse: parseBarSpiritsInvoiceText, supplierName: "BAR SPIRITS",      defaultUnit: "pc" },
  sum:        { parse: parseSumInvoiceText,        supplierName: "SUM",              defaultUnit: "g" },
  armor:      { parse: parseArmorInvoiceText,      supplierName: "ARMOR EMBALLAGES", defaultUnit: "g" },
  lmdw:       { parse: parseLmdwInvoiceText,       supplierName: "LMDW",             defaultUnit: "pc" },
  sdpf:       { parse: parseSdpfInvoiceText,       supplierName: "SDPF",             defaultUnit: "kg" },
  elien:      { parse: parseElienInvoiceText,      supplierName: "ELIEN",            defaultUnit: "l" },
  hardy:      { parse: parseHardyInvoiceText,      supplierName: "MAISON HARDY",     defaultUnit: "kg" },
  snak:       { parse: parseSnakInvoiceText,       supplierName: "SNAK",             defaultUnit: "pc" },
  pomona:     { parse: parsePomonaInvoiceText,     supplierName: "POMONA TERREAZUR", defaultUnit: "g" },
  billard:    { parse: parseBillardInvoiceText,    supplierName: "LE PERE BILLARD",  defaultUnit: "kg" },
};
