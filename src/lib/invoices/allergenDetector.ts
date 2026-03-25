/**
 * Détection automatique des 14 allergènes réglementaires européens
 * à partir du nom d'un ingrédient.
 *
 * Stratégie :
 *  - Normalisation : minuscules + apostrophes/étoiles → espace + préfixe espace
 *    (même technique que categoryDetector.ts pour éviter les faux positifs
 *     ex: "vin" dans "avoine", "moule" dans "semoule")
 *  - Tous les allergènes détectés sont retournés (pas de premier match unique)
 *  - Variantes accentuées/non-accentuées listées explicitement (pas de NFD strip)
 */

type AllergenRule = { allergen: string; keywords: string[] };

const ALLERGEN_RULES: AllergenRule[] = [
  {
    allergen: "Gluten",
    keywords: [
      "farine", "blé", "ble", "seigle", "orge", "avoine",
      "pain", "pâtes", "pates", "brioche", "chapelure",
    ],
  },
  {
    allergen: "Crustacés",
    keywords: ["crevette", "crevet", "homard", "crabe", "langoustine"],
  },
  {
    allergen: "Œufs",
    keywords: ["oeuf", "jaune d oeuf", "blanc oeuf", "mayonnaise"],
  },
  {
    allergen: "Poisson",
    keywords: [
      "saumon", "thon", "anchois", "cabillaud", "dorade",
      "merlu", "truite",
    ],
  },
  {
    allergen: "Arachides",
    keywords: ["cacahuète", "cacahuete", "arachide"],
  },
  {
    allergen: "Soja",
    keywords: ["soja", "tofu"],
  },
  {
    allergen: "Lait",
    keywords: [
      "lait", "beurre", "crème", "creme", "fromage",
      "mozzarella", "parmesan", "ricotta", "mascarpone",
      "yaourt", "lactose",
    ],
  },
  {
    allergen: "Fruits à coque",
    keywords: [
      "amande", "noisette", "noix", "cajou", "pistache",
      "pignon", "pécan", "pecan",
    ],
  },
  {
    allergen: "Céleri",
    keywords: ["céleri", "celeri"],
  },
  {
    allergen: "Moutarde",
    keywords: ["moutarde"],
  },
  {
    allergen: "Sésame",
    keywords: ["sésame", "sesame", "tahini"],
  },
  {
    allergen: "Sulfites",
    // "vin" : safe car " vin" ∉ " avoine" (gluten) ni " involtini"
    keywords: ["vin", "vinaigre", "fruits secs", "conserve"],
  },
  {
    allergen: "Lupin",
    keywords: ["lupin"],
  },
  {
    allergen: "Mollusques",
    keywords: [
      "moule", "huître", "huitre", "coquille",
      "poulpe", "seiche", "escargot",
    ],
  },
];

/**
 * Retourne la liste des allergènes détectés dans le nom d'un ingrédient.
 * Retourne un tableau vide si aucun allergène n'est détecté.
 */
export function detectAllergensFromName(name: string): string[] {
  // Apostrophes / étoiles Metro → espace ; préfixe espace pour éviter les
  // faux positifs de sous-chaîne (même technique que detectCategoryFromName)
  const lower = " " + name.toLowerCase().replace(/['’‘*]/g, " ");
  const result: string[] = [];
  for (const rule of ALLERGEN_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(" " + kw)) {
        result.push(rule.allergen);
        break; // chaque allergène n'est ajouté qu'une seule fois
      }
    }
  }
  return result;
}
