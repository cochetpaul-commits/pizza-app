/**
 * AI-powered invoice parser with template learning.
 *
 * On first parse of an unknown supplier, Claude extracts structured data
 * AND parsing hints. Those hints are saved as a reusable template so that
 * subsequent invoices from the same supplier can be parsed without AI.
 *
 * SQL to create the backing table:
 *
 * CREATE TABLE IF NOT EXISTS invoice_templates (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
 *   supplier_name TEXT NOT NULL,
 *   parsing_rules JSONB NOT NULL,
 *   sample_text TEXT,
 *   success_count INTEGER DEFAULT 0,
 *   created_at TIMESTAMPTZ DEFAULT now(),
 *   last_used_at TIMESTAMPTZ DEFAULT now(),
 *   UNIQUE(supplier_name)
 * );
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoice, ParsedLine } from "@/lib/invoices/importEngine";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SupplierInfo {
  name: string;
  siret: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface ParsingHints {
  invoice_number_pattern: string;
  date_pattern: string;
  line_format: string;
  supplier_keywords: string[];
  decimal_format: "french" | "standard";
  sample_lines: string[];
}

export interface InvoiceTemplate {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  parsing_rules: ParsingHints;
  sample_text: string;
  created_at: string;
  last_used_at: string;
  success_count: number;
}

// ── AI Parse ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en extraction de données de factures fournisseur françaises.
Tu reçois le texte brut extrait d'un PDF de facture et tu dois retourner un JSON structuré.

IMPORTANT :
- Les montants peuvent être au format français (1.000,50 = mille virgule cinquante) ou standard (1000.50).
  Détecte le format et convertis TOUS les nombres en format standard (point décimal) dans ta réponse.
- Les dates doivent être au format DD/MM/YYYY.
- Pour l'unité, utilise UNIQUEMENT : "pc" (pièces/unités/bouteilles/cartons), "kg" (kilogrammes), "l" (litres).
  Si l'unité n'est pas claire, utilise "pc".
- Le tax_rate est le taux de TVA en pourcentage (ex: 5.5, 10, 20). null si non trouvé.
- Extrais TOUTES les lignes de produits, même sur plusieurs pages.
- Si un champ est introuvable, utilise null.

Tu dois répondre UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de commentaire, pas de texte avant ou après).

Le JSON doit suivre EXACTEMENT ce schéma :
{
  "invoice": {
    "invoice_number": "string | null",
    "invoice_date": "DD/MM/YYYY | null",
    "total_ht": "number | null",
    "total_ttc": "number | null",
    "lines": [
      {
        "sku": "string | null",
        "name": "string (nom du produit, en MAJUSCULES)",
        "quantity": "number | null",
        "unit": "pc | kg | l | null",
        "unit_price": "number | null (prix unitaire HT)",
        "total_price": "number | null (total HT de la ligne)",
        "tax_rate": "number | null (taux TVA en %)"
      }
    ]
  },
  "supplier_info": {
    "name": "string (nom commercial du fournisseur, en Title Case)",
    "siret": "string | null (numéro SIRET/SIREN si trouvé)",
    "address": "string | null (adresse complète)",
    "phone": "string | null (téléphone)",
    "email": "string | null (email)"
  },
  "parsing_hints": {
    "invoice_number_pattern": "description ou regex du pattern du numéro de facture",
    "date_pattern": "description ou regex du pattern de la date",
    "line_format": "description détaillée de la structure d'une ligne produit (colonnes, séparateurs, ordre)",
    "supplier_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3 (nom société, SIRET, etc.)"],
    "decimal_format": "french | standard",
    "sample_lines": ["ligne brute exemple 1", "ligne brute exemple 2"]
  }
}`;

/**
 * Parse an invoice using Claude AI. Returns structured data + parsing hints.
 */
export async function aiParseInvoice(
  rawText: string,
  supplierName: string | null,
): Promise<{ invoice: ParsedInvoice; hints: ParsingHints; supplierInfo: SupplierInfo | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquante");

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = supplierName
    ? `Voici le texte brut d'une facture du fournisseur "${supplierName}". Extrais les données :\n\n${rawText}`
    : `Voici le texte brut d'une facture fournisseur. Extrais les données :\n\n${rawText}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text content from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Réponse AI vide");
  }

  const parsed = parseJsonResponse(textBlock.text);

  // Normalise lines
  const lines: ParsedLine[] = (parsed.invoice?.lines ?? []).map(
    (l: Record<string, unknown>) => ({
      sku: l.sku != null ? String(l.sku) : null,
      name: l.name != null ? String(l.name).toUpperCase() : null,
      quantity: toNum(l.quantity),
      unit: normalizeUnit(l.unit),
      unit_price: toNum(l.unit_price),
      total_price: toNum(l.total_price),
      tax_rate: toNum(l.tax_rate),
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: null,
    }),
  );

  const invoice: ParsedInvoice = {
    invoice_number: parsed.invoice?.invoice_number ?? null,
    invoice_date: parsed.invoice?.invoice_date ?? null,
    total_ht: toNum(parsed.invoice?.total_ht),
    total_ttc: toNum(parsed.invoice?.total_ttc),
    lines,
  };

  const hints: ParsingHints = {
    invoice_number_pattern: parsed.parsing_hints?.invoice_number_pattern ?? "",
    date_pattern: parsed.parsing_hints?.date_pattern ?? "",
    line_format: parsed.parsing_hints?.line_format ?? "",
    supplier_keywords: Array.isArray(parsed.parsing_hints?.supplier_keywords)
      ? parsed.parsing_hints.supplier_keywords.map(String)
      : [],
    decimal_format:
      parsed.parsing_hints?.decimal_format === "french" ? "french" : "standard",
    sample_lines: Array.isArray(parsed.parsing_hints?.sample_lines)
      ? parsed.parsing_hints.sample_lines.map(String).slice(0, 3)
      : [],
  };

  const supplierInfo: SupplierInfo | null = parsed.supplier_info?.name
    ? {
        name: String(parsed.supplier_info.name).trim(),
        siret: parsed.supplier_info.siret ? String(parsed.supplier_info.siret) : null,
        address: parsed.supplier_info.address ? String(parsed.supplier_info.address) : null,
        phone: parsed.supplier_info.phone ? String(parsed.supplier_info.phone) : null,
        email: parsed.supplier_info.email ? String(parsed.supplier_info.email) : null,
      }
    : null;

  return { invoice, hints, supplierInfo };
}

// ── Template Parse ───────────────────────────────────────────────────────────

/**
 * Try to parse an invoice using a saved template (regex-based).
 * Returns null if parsing fails — caller should fall back to AI.
 */
export function templateParseInvoice(
  rawText: string,
  template: InvoiceTemplate,
): ParsedInvoice | null {
  try {
    const rules = template.parsing_rules;

    // Extract invoice number
    let invoiceNumber: string | null = null;
    if (rules.invoice_number_pattern) {
      try {
        const re = new RegExp(rules.invoice_number_pattern, "i");
        const m = rawText.match(re);
        invoiceNumber = m?.[1] ?? m?.[0] ?? null;
      } catch {
        // Pattern may be a description, not a regex — skip
      }
    }

    // Extract date
    let invoiceDate: string | null = null;
    if (rules.date_pattern) {
      try {
        const re = new RegExp(rules.date_pattern, "i");
        const m = rawText.match(re);
        invoiceDate = m?.[1] ?? m?.[0] ?? null;
      } catch {
        // Fallback: find any DD/MM/YYYY date
      }
    }
    // Fallback: generic date pattern
    if (!invoiceDate) {
      const dateMatch = rawText.match(/(\d{2}[/.-]\d{2}[/.-]\d{4})/);
      invoiceDate = dateMatch?.[1] ?? null;
    }

    // Extract totals — look for common patterns
    const totalHt = extractTotal(rawText, [
      /total\s*h\.?t\.?\s*[:=]?\s*([\d\s.,]+)/i,
      /montant\s*h\.?t\.?\s*[:=]?\s*([\d\s.,]+)/i,
      /net\s*h\.?t\.?\s*[:=]?\s*([\d\s.,]+)/i,
    ], rules.decimal_format);

    const totalTtc = extractTotal(rawText, [
      /total\s*t\.?t\.?c\.?\s*[:=]?\s*([\d\s.,]+)/i,
      /montant\s*t\.?t\.?c\.?\s*[:=]?\s*([\d\s.,]+)/i,
      /net\s*[àa]\s*payer\s*[:=]?\s*([\d\s.,]+)/i,
      /solde\s*d[uû]\s*[:=]?\s*([\d\s.,]+)/i,
    ], rules.decimal_format);

    // Extract product lines — this is the hard part with templates
    // We use a generic multi-column line detection approach
    const lines = extractProductLines(rawText, rules);

    // If we got fewer than 1 line, consider template failed
    if (lines.length === 0) return null;

    return {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      total_ht: totalHt,
      total_ttc: totalTtc,
      lines,
    };
  } catch {
    return null;
  }
}

// ── Template CRUD ────────────────────────────────────────────────────────────

/**
 * Save or update an invoice template for a supplier.
 */
export async function saveTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  supplierId: string | null,
  supplierName: string,
  hints: ParsingHints,
  sampleText: string,
): Promise<void> {
  const normalizedName = supplierName.trim().toUpperCase();

  const { error } = await supabase.from("invoice_templates").upsert(
    {
      supplier_id: supplierId,
      supplier_name: normalizedName,
      parsing_rules: hints,
      sample_text: sampleText.slice(0, 10000), // cap storage
      success_count: 0,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "supplier_name" },
  );

  if (error) {
    console.error("[aiParser] saveTemplate error:", error.message);
  }
}

/**
 * Look up a saved template by supplier name (case-insensitive).
 */
export async function getTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  supplierName: string,
): Promise<InvoiceTemplate | null> {
  const normalizedName = supplierName.trim().toUpperCase();

  const { data, error } = await supabase
    .from("invoice_templates")
    .select("*")
    .eq("supplier_name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[aiParser] getTemplate error:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    supplier_id: data.supplier_id,
    supplier_name: data.supplier_name,
    parsing_rules: data.parsing_rules as ParsingHints,
    sample_text: data.sample_text ?? "",
    created_at: data.created_at,
    last_used_at: data.last_used_at,
    success_count: data.success_count ?? 0,
  };
}

/**
 * Increment success_count and update last_used_at after a successful template parse.
 */
export async function bumpTemplateSuccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  templateId: string,
): Promise<void> {
  // Fetch current count, increment, and update
  const { data } = await supabase
    .from("invoice_templates")
    .select("success_count")
    .eq("id", templateId)
    .maybeSingle();

  const currentCount = (data?.success_count as number | null) ?? 0;

  await supabase
    .from("invoice_templates")
    .update({
      success_count: currentCount + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", templateId);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(v: unknown): "pc" | "kg" | "l" | null {
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  if (s === "kg" || s === "kilo" || s === "kilos" || s === "kilogramme" || s === "kilogrammes") return "kg";
  if (s === "l" || s === "litre" || s === "litres" || s === "lt") return "l";
  if (s === "pc" || s === "piece" || s === "pièce" || s === "pieces" || s === "pièces" || s === "u" || s === "unite" || s === "unité" || s === "bt" || s === "bte" || s === "bouteille") return "pc";
  return "pc";
}

/**
 * Parse JSON from Claude's response, handling potential markdown wrapping.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonResponse(text: string): any {
  // Try direct parse first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Claude sometimes wraps in ```json ... ```
  }

  // Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Try to find first { ... } block
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // give up
    }
  }

  throw new Error("Impossible de parser la réponse JSON de l'IA");
}

/**
 * Extract a total amount from text using multiple regex patterns.
 */
function extractTotal(
  text: string,
  patterns: RegExp[],
  decimalFormat: "french" | "standard",
): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const raw = m[1].trim();
      return parseFrenchOrStandardNumber(raw, decimalFormat);
    }
  }
  return null;
}

function parseFrenchOrStandardNumber(
  raw: string,
  format: "french" | "standard",
): number | null {
  let cleaned = raw.replace(/\s/g, "");
  if (format === "french") {
    // French: 1.000,50 → 1000.50
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard: 1,000.50 → 1000.50 or just 1000.50
    cleaned = cleaned.replace(/,/g, "");
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract product lines from raw text using template hints.
 * Falls back to a generic line-detection heuristic.
 */
function extractProductLines(
  rawText: string,
  rules: ParsingHints,
): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const textLines = rawText.split("\n");

  // Heuristic: a product line typically contains a price-like number (X.XX or X,XX)
  // and at least some alphabetic product name
  const pricePattern = /\d+[.,]\d{2}/;
  const namePattern = /[A-Za-zÀ-ÿ]{3,}/;

  for (const line of textLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!pricePattern.test(trimmed)) continue;
    if (!namePattern.test(trimmed)) continue;

    // Skip header/footer lines
    const upper = trimmed.toUpperCase();
    if (upper.includes("TOTAL") && !upper.includes("TOTAL LIGNE")) continue;
    if (upper.includes("SOUS-TOTAL") || upper.includes("SOUS TOTAL")) continue;
    if (upper.includes("TVA") && !namePattern.test(upper.replace(/TVA/g, ""))) continue;
    if (upper.startsWith("PAGE ") || upper.startsWith("FACTURE")) continue;

    // Try to extract numbers from the line
    const numbers = extractNumbers(trimmed, rules.decimal_format);
    if (numbers.length < 1) continue;

    // Extract the name part (text before the first number cluster)
    const nameMatch = trimmed.match(/^(.*?)\s+\d/);
    const name = nameMatch?.[1]?.trim() || trimmed.replace(/[\d.,\s]+/g, " ").trim();
    if (!name || name.length < 2) continue;

    // Assign numbers based on count
    let quantity: number | null = null;
    let unitPrice: number | null = null;
    let totalPrice: number | null = null;

    if (numbers.length >= 3) {
      quantity = numbers[0];
      unitPrice = numbers[numbers.length - 2];
      totalPrice = numbers[numbers.length - 1];
    } else if (numbers.length === 2) {
      unitPrice = numbers[0];
      totalPrice = numbers[1];
    } else {
      totalPrice = numbers[0];
    }

    lines.push({
      sku: null,
      name: name.toUpperCase(),
      quantity,
      unit: "pc",
      unit_price: unitPrice,
      total_price: totalPrice,
      tax_rate: null,
      notes: null,
      piece_weight_g: null,
      piece_volume_ml: null,
    });
  }

  return lines;
}

/**
 * Extract all decimal numbers from a text string.
 */
function extractNumbers(text: string, format: "french" | "standard"): number[] {
  const results: number[] = [];
  let pattern: RegExp;

  if (format === "french") {
    // French: 1.000,50 or 100,50 or 5
    pattern = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)/g;
  } else {
    // Standard: 1,000.50 or 100.50 or 5
    pattern = /(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}|\d+)/g;
  }

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const n = parseFrenchOrStandardNumber(m[1], format);
    if (n != null) results.push(n);
  }

  return results;
}
