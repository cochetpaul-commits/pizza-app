/*
 * Parser dispatcher
 *
 * Detects supplier from PDF text, routes to dedicated parser,
 * falls back to generic parser if no match.
 */

import type { ParseResult } from "./types";
import { detectSupplier } from "./detectSupplier";
import { parseMetro } from "./metro";
import { parseMael } from "./mael";
import { parseCozigou } from "./cozigou";
import { parseSum } from "./sum";
import { parseArmor } from "./armor";
import { parseCarniato } from "./carniato";
import { parseBarSpirits } from "./barspirits";
import { parseVinoflo } from "./vinoflo";
import { parseMasse } from "./masse";
import { parseLmdw } from "./lmdw";
import { parseSdpf } from "./sdpf";
import { parseGeneric } from "./generic";

export type { ParseResult, ParsedIngredient, ParseLog, Categorie, Confidence } from "./types";

type ParserOptions = {
  text: string;
  fournisseur?: string | null;
  etablissement?: string | null;
};

const PARSERS: Record<string, (text: string, etab: string) => ParseResult> = {
  metro: parseMetro,
  mael: parseMael,
  cozigou: parseCozigou,
  sum: parseSum,
  armor: parseArmor,
  carniato: parseCarniato,
  bar_spirits: parseBarSpirits,
  vinoflo: parseVinoflo,
  masse: parseMasse,
  lmdw: parseLmdw,
  sdpf: parseSdpf,
};

export function parseInvoice(options: ParserOptions): ParseResult {
  const { text } = options;

  // Auto-detect if not provided
  const detected = detectSupplier(text);
  const fournisseur = options.fournisseur || detected.fournisseur || "unknown";
  const etablissement = options.etablissement || detected.etablissement || "bello_mio";

  // Route to dedicated parser
  const parser = PARSERS[fournisseur];
  if (parser) {
    return parser(text, etablissement);
  }

  // Fallback to generic
  return parseGeneric(text, fournisseur, etablissement);
}

export { detectSupplier } from "./detectSupplier";
