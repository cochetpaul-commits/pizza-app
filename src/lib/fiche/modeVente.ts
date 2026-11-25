/**
 * Mode de vente d'une fiche (25/11/2026, avec Paul).
 * - restaurant : prix par assiette (coût portion × coefficient), food cost et marge par assiette ;
 * - traiteur : prix TTC au kilo (coût au kilo, cru tant que le cuit n'est pas saisi), TVA 5,5 % par défaut ;
 * - les_deux : une même recette en salle et en vitrine ;
 * - preparation : ne se vend pas telle quelle, sert dans d'autres fiches (seul le coût au kilo compte).
 * Par défaut : Piccola Mia en traiteur, Bello Mio en restaurant, catégories préparation et sauce en préparation.
 * Même objectif de food cost en traiteur qu'au restaurant (celui de la famille), pour rester cohérent.
 */
export type ModeVente = "restaurant" | "traiteur" | "les_deux" | "preparation";

export const MODES_VENTE: { id: ModeVente; libelle: string }[] = [
  { id: "restaurant", libelle: "Restaurant" },
  { id: "traiteur", libelle: "Traiteur" },
  { id: "les_deux", libelle: "Les deux" },
  { id: "preparation", libelle: "Préparation" },
];

const CATEGORIES_PREPARATION = new Set(["preparation", "sauce"]);

export function estModeVente(v: unknown): v is ModeVente {
  return v === "restaurant" || v === "traiteur" || v === "les_deux" || v === "preparation";
}

export function modeVenteParDefaut(categorie: string | null | undefined, etablissements: string[] | null | undefined): ModeVente {
  if (CATEGORIES_PREPARATION.has(categorie ?? "")) return "preparation";
  const e = etablissements ?? [];
  const piccola = e.some((x) => x.includes("piccola"));
  const bello = e.some((x) => x === "bello_mio" || x === "bellomio");
  return piccola && !bello ? "traiteur" : "restaurant";
}

export const avecRestaurant = (m: ModeVente) => m === "restaurant" || m === "les_deux";
export const avecTraiteur = (m: ModeVente) => m === "traiteur" || m === "les_deux";

export type EtatFoodCost = "ok" | "attention" | "trop_haut";

/** La jauge déjà en place : vert jusqu'à l'objectif, orange jusqu'à objectif + 20 %, rouge au-delà */
export function etatFoodCost(fcPct: number, objectifPct: number): EtatFoodCost {
  if (fcPct <= objectifPct) return "ok";
  if (fcPct <= objectifPct * 1.2) return "attention";
  return "trop_haut";
}

/** Prix TTC qui met le food cost pile à l'objectif, arrondi au demi-euro supérieur (même règle que la portion) */
export function prixPourObjectif(cout: number, objectifPct: number, tvaPct: number): number {
  if (!(cout > 0) || !(objectifPct > 0)) return 0;
  return Math.ceil((cout / (objectifPct / 100)) * (1 + tvaPct / 100) * 2) / 2;
}

export type CalculKilo = { htKg: number | null; foodCost: number | null; margeKg: number | null; coefficient: number | null; conseille: number };

/** Vente au kilo : food cost réel sur le prix HT au kilo */
export function calculKilo(coutKg: number | null, ttcKg: number | null, tvaPct: number, objectifPct: number): CalculKilo {
  const conseille = coutKg != null ? prixPourObjectif(coutKg, objectifPct, tvaPct) : 0;
  if (coutKg == null || ttcKg == null || !(ttcKg > 0)) return { htKg: null, foodCost: null, margeKg: null, coefficient: null, conseille };
  const htKg = ttcKg / (1 + tvaPct / 100);
  return { htKg, foodCost: (coutKg / htKg) * 100, margeKg: htKg - coutKg, coefficient: ttcKg / coutKg, conseille };
}
