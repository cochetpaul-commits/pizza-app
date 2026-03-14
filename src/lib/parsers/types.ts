export type UnitRecette = "g" | "kg" | "cl" | "L" | "ml" | "pcs";
export type UnitCommande = "pcs" | "colis" | "kg";
export type Confidence = "high" | "medium" | "low";

export type Categorie =
  | "cremerie_fromage"
  | "charcuterie_viande"
  | "maree"
  | "legumes_herbes"
  | "epicerie"
  | "boissons"
  | "surgele"
  | "emballage_entretien"
  | "autre";

export type ParsedIngredient = {
  name: string;
  reference?: string;
  ean?: string;

  unit_recette: UnitRecette;
  unit_commande: UnitCommande;
  colisage?: number;
  poids_unitaire?: number;
  volume_unitaire?: number;

  prix_unitaire: number;
  prix_commande: number;

  categorie: Categorie;
  sous_categorie?: string;
  fournisseur_slug: string;
  etablissement_id: string;

  raw_line: string;
  confidence: Confidence;
};

export type ParseResult = {
  fournisseur: string;
  etablissement: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  ingredients: ParsedIngredient[];
  logs: ParseLog[];
};

export type ParseLog = {
  line_number: number;
  raw: string;
  rule: string;
  result: "ok" | "skipped" | "error";
  detail?: string;
};
