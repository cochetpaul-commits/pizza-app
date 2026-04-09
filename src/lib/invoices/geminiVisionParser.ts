import type { ParsedInvoice, ParsedLine } from "@/lib/invoices/importEngine";

export type SupplierInfo = {
  name: string;
  siret: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const SYSTEM_PROMPT = `Tu es un expert en extraction de données de factures fournisseur françaises.
Tu reçois une image ou un PDF d'une facture fournisseur et tu dois retourner un JSON structuré.

IMPORTANT :
- Les montants peuvent être au format français (1.000,50 = mille virgule cinquante) ou standard (1000.50).
  Détecte le format et convertis TOUS les nombres en format standard (point décimal) dans ta réponse.
- Les dates doivent être au format DD/MM/YYYY.
- Pour l'unité, utilise UNIQUEMENT : "pc" (pièces/unités/bouteilles/cartons), "kg" (kilogrammes), "l" (litres).
  Si l'unité n'est pas claire, utilise "pc".
- Le tax_rate est le taux de TVA en pourcentage (ex: 5.5, 10, 20). null si non trouvé.
- Extrais TOUTES les lignes de produits visibles, même si l'image est légèrement floue ou inclinée.
- Si un champ est introuvable, utilise null.
- Les noms de produits doivent être en MAJUSCULES.

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
        "tax_rate": "number | null (taux TVA en %)",
        "piece_weight_g": "number | null (poids unitaire en grammes si visible)",
        "piece_volume_ml": "number | null (volume unitaire en ml si visible)"
      }
    ]
  },
  "supplier_info": {
    "name": "string (nom commercial du fournisseur, en Title Case)",
    "siret": "string | null (numéro SIRET/SIREN si trouvé)",
    "address": "string | null (adresse complète)",
    "phone": "string | null (téléphone)",
    "email": "string | null (email)"
  }
}`;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(u: unknown): "pc" | "kg" | "l" | null {
  if (!u) return null;
  const s = String(u).toLowerCase().trim();
  if (s === "kg") return "kg";
  if (s === "l" || s === "litre" || s === "litres") return "l";
  if (s === "pc" || s === "pcs" || s === "piece" || s === "pièce" || s === "u" || s === "un" || s === "unit" || s === "unité") return "pc";
  return null;
}

function normalizeLine(raw: Record<string, unknown>): ParsedLine {
  return {
    sku: raw.sku ? String(raw.sku) : null,
    name: raw.name ? String(raw.name).toUpperCase().trim() : null,
    quantity: toNum(raw.quantity),
    unit: normalizeUnit(raw.unit),
    unit_price: toNum(raw.unit_price),
    total_price: toNum(raw.total_price),
    tax_rate: toNum(raw.tax_rate),
    notes: raw.notes ? String(raw.notes) : null,
    piece_weight_g: toNum(raw.piece_weight_g),
    piece_volume_ml: toNum(raw.piece_volume_ml),
  };
}

function parseJsonResponse(text: string): Record<string, unknown> {
  // Try direct parse
  try { return JSON.parse(text); } catch { /* continue */ }
  // Extract JSON from markdown code block
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* continue */ }
  }
  // Find first { ... } block
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* continue */ }
  }
  throw new Error("Impossible de parser la réponse Gemini en JSON");
}

// Try models in order until one works (quota/availability varies by project)
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

async function callGeminiRest(
  apiKey: string,
  model: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.1 },
  };

  // Retry up to 3 times for 503 (model overloaded) with increasing delay
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 503 && attempt < MAX_RETRIES) {
      // Wait 2s, 4s, 8s before retry
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini ${model} (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini ${model}: réponse vide`);
    return text;
  }

  throw new Error(`Gemini ${model}: 503 après ${MAX_RETRIES} tentatives`);
}

export async function geminiVisionParse(
  fileBytes: Uint8Array,
  mimeType: string,
  supplierNameHint?: string | null,
): Promise<{ invoice: ParsedInvoice; supplierName: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY manquante dans .env.local");

  const base64Data = Buffer.from(fileBytes).toString("base64");
  const userPrompt = supplierNameHint
    ? `Voici une facture du fournisseur "${supplierNameHint}". Extrais les données.`
    : "Voici une facture fournisseur. Identifie le fournisseur et extrais les données.";

  // Try each model until one succeeds
  let responseText = "";
  const errors: string[] = [];
  for (const model of MODELS) {
    try {
      responseText = await callGeminiRest(apiKey, model, base64Data, mimeType, userPrompt);
      break;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!responseText) {
    throw new Error(`Aucun modèle Gemini disponible.\n${errors.join("\n")}`);
  }

  const parsed = parseJsonResponse(responseText);

  const inv = (parsed.invoice ?? parsed) as Record<string, unknown>;
  const linesRaw = (inv.lines ?? []) as Record<string, unknown>[];
  const supplierInfo = (parsed.supplier_info ?? null) as Record<string, unknown> | null;

  const invoice: ParsedInvoice = {
    invoice_number: inv.invoice_number ? String(inv.invoice_number) : null,
    invoice_date: inv.invoice_date ? String(inv.invoice_date) : null,
    total_ht: toNum(inv.total_ht),
    total_ttc: toNum(inv.total_ttc),
    lines: linesRaw.map(normalizeLine),
  };

  const supplierName = supplierInfo?.name
    ? String(supplierInfo.name)
    : (supplierNameHint ?? "Fournisseur inconnu");

  return { invoice, supplierName };
}
