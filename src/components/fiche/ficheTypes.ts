// ── Types & constantes pour le wizard fiche technique ──

export type FicheStatut = "brouillon" | "validee" | "publiee";
export type FamilleId = "pizza" | "cuisine" | "cocktail" | "soft" | "vin" | "autre";
export type Zone = "avant_four" | "apres_four";

export type Famille = {
  id: FamilleId;
  label: string;
  objectif_fc: number;
  tva_defaut: number;
  portions_label: string;
  portions_label_pluriel: string;
};

export type Categorie = {
  id: string;
  nom: string;
  slug: string;
  couleur: string;
  famille_id: FamilleId;
  sous_categories: string[];
};

export type IngredientRef = {
  id: string;
  nom_court: string;
  nom_produit: string;
  prix_base: number;
  unite_base: "g" | "cl" | "pc";
  allergenes: string[];
};

export type LigneIngredient = {
  key: string; // temp ID for React keys
  ingredient_id: string | null;
  ingredient?: IngredientRef | null;
  quantite: number;
  unite: string;
  zone: Zone;
};

export type FicheState = {
  id: string | null;
  nom: string;
  categorie_slug: string;
  sous_categorie: string;
  statut: FicheStatut;
  // Pizza
  paton_poids: number;
  empatement: string;
  // Ingrédients
  lignes: LigneIngredient[];
  // Étapes
  etapes: string[];
  notes: string;
  // Prix
  portions: number;
  coeff: number;
  tva: number;
  prix_ttc_manuel: number | null;
  // Traiteur
  sell_price_per_kg: number | null;
  sell_price_per_portion: number | null;
  // Salle
  description: string;
  accord: string;
  resume_salle: string;
  resume_manuel: boolean;
  // Photo
  photo_url: string | null;
  // Etablissement
  establishments: string[];
};

// ── Unités ──
export const UNITS: Record<string, { label: string; base: "g" | "cl" | "pc"; factor: number }> = {
  g:  { label: "g",  base: "g",  factor: 1 },
  kg: { label: "kg", base: "g",  factor: 1000 },
  cl: { label: "cl", base: "cl", factor: 1 },
  ml: { label: "ml", base: "cl", factor: 0.1 },
  L:  { label: "L",  base: "cl", factor: 100 },
  pc: { label: "pc", base: "pc", factor: 1 },
};

export function unitsFor(base: "g" | "cl" | "pc"): string[] {
  return Object.keys(UNITS).filter(u => UNITS[u].base === base);
}

// ── Les 14 allergènes réglementaires ──
export const ALLERGENES_14 = [
  "Gluten", "Crustaces", "Oeufs", "Poisson", "Arachides", "Soja",
  "Lait", "Fruits a coque", "Celeri", "Moutarde", "Sesame",
  "Sulfites", "Lupin", "Mollusques",
];

// ── Calculs ──
export function coutLigne(ligne: LigneIngredient): number {
  if (!ligne.ingredient) return 0;
  const u = UNITS[ligne.unite];
  if (!u) return 0;
  return ligne.ingredient.prix_base * ligne.quantite * u.factor;
}

export function coutRecetteTotal(lignes: LigneIngredient[], coutPaton: number): number {
  let total = 0;
  for (const l of lignes) total += coutLigne(l);
  return total + coutPaton;
}

export function coutPaton(poidsG: number, coutBase: number, poidsBase: number): number {
  if (poidsBase <= 0) return 0;
  return coutBase * poidsG / poidsBase;
}

export function coutPortion(coutRecette: number, portions: number): number {
  return coutRecette / Math.max(1, portions);
}

export function prixTTC(coutPort: number, coeff: number, ttcManuel: number | null): number {
  return ttcManuel ?? coutPort * coeff;
}

export function prixHT(ttc: number, tva: number): number {
  return ttc / (1 + tva / 100);
}

export function foodCostPct(coutPort: number, ht: number): number {
  return ht > 0 ? (coutPort / ht) * 100 : 0;
}

export function margeBrute(ht: number, coutPort: number): number {
  return ht - coutPort;
}

export function prixConseille(coutPort: number, objectifFC: number, tva: number): number {
  const ht = coutPort / (objectifFC / 100);
  return Math.ceil(ht * (1 + tva / 100) * 2) / 2;
}

export function fcColor(fc: number, objectif: number): "ok" | "warn" | "bad" {
  if (fc <= objectif) return "ok";
  if (fc <= objectif * 1.2) return "warn";
  return "bad";
}

export function allergenesActifs(lignes: LigneIngredient[]): Set<string> {
  const s = new Set<string>();
  for (const l of lignes) {
    if (l.ingredient) {
      for (const a of l.ingredient.allergenes) s.add(a);
    }
  }
  return s;
}

export function resumeAuto(etapes: string[]): string {
  const steps = etapes.map(e => e.trim().replace(/\.$/, "")).filter(Boolean);
  if (!steps.length) return "";
  return steps.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(". ") + ".";
}

export function tmpKey(): string {
  return `tmp-${Math.random().toString(36).slice(2)}`;
}

export function eur(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";
}

export const PATON_BASE = { poids: 264, cout: 0.30 };

export function defaultFiche(etabSlug: string): FicheState {
  return {
    id: null,
    nom: "",
    categorie_slug: "pizza",
    sous_categorie: "",
    statut: "brouillon",
    paton_poids: 264,
    empatement: "FOCACCIA",
    lignes: [],
    etapes: [],
    notes: "",
    portions: 1,
    coeff: 3,
    tva: 10,
    prix_ttc_manuel: null,
    sell_price_per_kg: null,
    sell_price_per_portion: null,
    description: "",
    accord: "",
    resume_salle: "",
    resume_manuel: false,
    photo_url: null,
    establishments: [etabSlug],
  };
}
