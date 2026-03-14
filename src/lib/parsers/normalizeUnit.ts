import type { UnitRecette, UnitCommande } from "./types";

// ── Unit normalization ──────────────────────────────────────────────────────

const POIDS_MAP: Record<string, UnitRecette> = {
  g: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg",
};

const VOLUME_MAP: Record<string, UnitRecette> = {
  cl: "cl", centilitre: "cl", centilitres: "cl",
  l: "L", litre: "L", litres: "L", lt: "L",
  ml: "ml",
};

const PIECE_MAP: Record<string, UnitRecette> = {
  pce: "pcs", pcs: "pcs", pc: "pcs", "pièce": "pcs",
  piece: "pcs", u: "pcs", "unité": "pcs", unite: "pcs",
};

const ALL_UNITS: Record<string, UnitRecette> = {
  ...POIDS_MAP,
  ...VOLUME_MAP,
  ...PIECE_MAP,
};

export function normalizeUnitRecette(raw: string): UnitRecette {
  const key = raw.trim().toLowerCase();
  return ALL_UNITS[key] ?? "pcs";
}

export function normalizeUnitCommande(raw: string): UnitCommande {
  const key = raw.trim().toLowerCase();
  if (key === "kg" || key === "kilo" || key === "kilos") return "kg";
  if (key === "colis" || key === "carton" || key === "lot") return "colis";
  return "pcs";
}

// ── Conditionnement parsing ─────────────────────────────────────────────────
// Ex: "sac 25kg" → { unit_recette: "kg", poids: 25, unit_commande: "pcs" }

type ConditionnementInfo = {
  unit_recette: UnitRecette;
  poids_unitaire?: number;
  volume_unitaire?: number;
  unit_commande: UnitCommande;
};

const CONDITIONNEMENT_PATTERNS: Array<{
  regex: RegExp;
  extract: (m: RegExpMatchArray) => ConditionnementInfo;
}> = [
  {
    // "sac 25kg", "seau 2.5kg", "barquette 500g"
    regex: /(?:sac|seau|barquette|sachet|poche)\s+(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i,
    extract: (m) => {
      const val = parseFloat(m[1].replace(",", "."));
      const u = m[2].toLowerCase();
      return {
        unit_recette: u === "kg" ? "kg" : "g",
        poids_unitaire: val,
        unit_commande: "pcs",
      };
    },
  },
  {
    // "bidon 5L", "bouteille 75cl"
    regex: /(?:bidon|bouteille|bib|cubi)\s+(\d+(?:[.,]\d+)?)\s*(l|cl|ml)\b/i,
    extract: (m) => {
      const val = parseFloat(m[1].replace(",", "."));
      const u = m[2].toLowerCase();
      return {
        unit_recette: u === "cl" ? "cl" : u === "ml" ? "ml" : "L",
        volume_unitaire: val,
        unit_commande: "pcs",
      };
    },
  },
];

export function parseConditionnement(text: string): ConditionnementInfo | null {
  const lower = text.toLowerCase();
  for (const { regex, extract } of CONDITIONNEMENT_PATTERNS) {
    const m = lower.match(regex);
    if (m) return extract(m);
  }
  return null;
}

// ── Inline unit extraction ──────────────────────────────────────────────────
// Ex: "x250g" or "250 g" in a product name

type InlineUnit = {
  unit_recette: UnitRecette;
  value: number;
  type: "poids" | "volume";
};

export function extractInlineUnit(name: string): InlineUnit | null {
  // kg
  const kgM = name.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgM) {
    return { unit_recette: "kg", value: parseFloat(kgM[1].replace(",", ".")), type: "poids" };
  }
  // g
  const gM = name.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gM) {
    return { unit_recette: "g", value: parseFloat(gM[1].replace(",", ".")), type: "poids" };
  }
  // cl
  const clM = name.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clM) {
    return { unit_recette: "cl", value: parseFloat(clM[1].replace(",", ".")), type: "volume" };
  }
  // ml
  const mlM = name.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlM) {
    return { unit_recette: "ml", value: parseFloat(mlM[1].replace(",", ".")), type: "volume" };
  }
  // L
  const lM = name.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lM) {
    return { unit_recette: "L", value: parseFloat(lM[1].replace(",", ".")), type: "volume" };
  }
  return null;
}

// ── French number parsing ───────────────────────────────────────────────────

export function parseFrenchNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const cleaned = t
    .replace(/\s+/g, "")
    .replace(/[€]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
