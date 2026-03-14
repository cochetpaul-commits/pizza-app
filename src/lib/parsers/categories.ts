import type { Categorie } from "./types";

// ── Category detection by keyword matching ──────────────────────────────────

const CATEGORIE_KEYWORDS: Record<Categorie, string[]> = {
  cremerie_fromage: [
    "mozzarella", "burrata", "parmesan", "ricotta",
    "pecorino", "fromage", "grana", "provolone",
    "mascarpone", "lait", "crème", "creme", "beurre", "oeuf", "oeufs",
  ],
  charcuterie_viande: [
    "jambon", "bresaola", "pancetta", "coppa",
    "mortadelle", "salami", "viande", "boeuf",
    "veau", "porc", "poulet", "filet", "tartare",
    "merguez", "saucisse",
  ],
  maree: [
    "thon", "saumon", "crevette", "seiche", "poulpe",
    "dorade", "bar", "loup", "cabillaud", "daurade",
  ],
  legumes_herbes: [
    "tomate", "basilic", "poivron", "ail", "oignon",
    "aubergine", "courgette", "artichaut", "épinard", "epinard",
    "roquette", "persil", "thym", "romarin", "légume", "legume",
  ],
  epicerie: [
    "farine", "huile", "vinaigre", "sel", "sucre",
    "pâtes", "pates", "riz", "conserve", "sauce", "miel",
    "nocciolata", "nutella", "café", "nescafe",
  ],
  boissons: [
    "vin", "bière", "biere", "eau", "jus", "sirop",
    "prosecco", "limoncello", "marsala", "rioba",
    "cranberry", "ananas", "pomme", "spiritueux",
  ],
  surgele: [
    "surgelé", "surgele", "congelé", "congele", "ivp",
  ],
  emballage_entretien: [
    "sanytol", "nettoyant", "désinfect", "desinfect", "droguerie",
    "emballage", "film", "sac", "boite", "barquette",
    "persil liquid",
  ],
  autre: [],
};

// Metro section headers → category mapping
const METRO_SECTION_MAP: Record<string, Categorie> = {
  "SPIRITUEUX": "boissons",
  "BRASSERIE": "boissons",
  "EPICERIE SECHE": "epicerie",
  "EPICERIE SUCREE": "epicerie",
  "BEURRE": "cremerie_fromage",
  "FROMAGE": "cremerie_fromage",
  "TRAITEUR": "epicerie",
  "BOUCHERIE": "charcuterie_viande",
  "FRUITS ET LEGUMES": "legumes_herbes",
  "DROGUERIE": "emballage_entretien",
  "SURGELES": "surgele",
  "MAREE": "maree",
};

export function detectCategorieFromName(name: string): Categorie {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIE_KEYWORDS)) {
    if (cat === "autre") continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat as Categorie;
    }
  }
  return "autre";
}

export function categorieFromMetroSection(sectionName: string): Categorie {
  const upper = sectionName.toUpperCase().trim();
  for (const [key, cat] of Object.entries(METRO_SECTION_MAP)) {
    if (upper.includes(key)) return cat;
  }
  return "autre";
}
