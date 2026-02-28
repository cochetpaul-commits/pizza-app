import type { Category } from "@/types/ingredients";

type Rule = { keywords: string[]; category: Category };

// Ordre important : la première règle qui matche gagne.
// Stratégie :
//  - Marée AVANT viande_core : "filet de sole" → maree, pas viande.
//  - viande_core (mots sans ambiguïté) AVANT légume : évite "CHAIR PORC/VEAU TOMATE" → légume.
//  - Légume/herbe/fruit AVANT viande_generic ("filet", "tartare"…) :
//      évite "COURG FILET" → viande, "LIME FILET4" → viande, "TARTARE LEGUMES" → viande.
//  - Herbe AVANT fruit : évite "thym citron" → fruit.
//  - Matching : lower.includes(" " + kw) — préfixe espace pour éviter les faux positifs
//      ("moule" dans "semoule", "gin" dans "origin", "eau" dans "anneaux").
const RULES: Rule[] = [
// Fromages
{ keywords: ["mozzarella", "burrata", "burrat", "parmesan", "reggiano", "ricotta", "mascarpone", "fontina", "taleggio", "provolone", "pecorino", "gorgonzola", "gorgon", "cheddar", "brie", "camembert", "comté", "emmental", "gruyere", "reblochon", "roquefort", "fromage", "chevre", "chèvre", "babybel", "feta"], category: "fromage" },
// Charcuterie
{ keywords: ["jambon", "pancetta", "speck", "nduja", "guanciale", "spianata", "coppa", "bresaola", "salami", "saucisson", "mortadelle", "prosciutto", "lardo", "chorizo", "involtini"], category: "charcuterie" },
// Marée (avant viande pour éviter "filet de sole" → viande)
{ keywords: ["saumon", "anchois", "thon", "cabillaud", "dorade", "bar", "sole", "crevette", "crevet", "homard", "langoustine", "moule", "huitre", "coquille", "poulpe", "seiche", "encornet", "poisson", "maree", "merlu", "truite", "calamar", "calmar"], category: "maree" },
// Viande — mots sans ambiguïté (avant légume pour "CHAIR PORC/VEAU TOMATE" → viande, pas légume)
{ keywords: ["boeuf", "veau", "porc", "poulet", "volaille", "agneau", "dinde", "canard", "lapin", "gigot", "chair", "plt", "egrene", "égrené"], category: "viande" },
// Légumes (avant viande_generic "filet"/"tartare" : "COURG FILET", "TARTARE LEGUMES" → légume)
// "champig" et non "champ" pour éviter "champagne" → légume
{ keywords: ["aubergine", "auberg", "courgette", "courg", "poivron", "champignon", "champig", "oignon", "tomate", "roquette", "épinard", "epinard", "salade", "laitue", "carotte", "brocoli", "chou", "fenouil", "céleri", "celeri", "asperge", "artichaut", "poireau", "pois", "haricot", "frite", "patate", "pomme de terre", "pdt", "echalote", "échalote", "echalion", "échalion", "concombre", "butternut", "endive", "chataigne", "châtaigne", "soja", "edamame", "legume", "légume"], category: "legume" },
// Herbes (avant fruit pour éviter "thym citron" → fruit)
{ keywords: ["basilic", "romarin", "persil", "thym", "origan", "ciboulette", "coriandre", "menthe", "sauge", "estragon", "laurier", "herbe"], category: "herbe" },
// Fruits (avant viande_generic "filet" : "LIME FILET4" → fruit, pas viande)
// "citr" = préfixe citron/citrus (abréviations Metro)
{ keywords: ["framboise", "fraise", "myrtille", "cerise", "abricot", "peche", "pêche", "mangue", "ananas", "citron", "citr", "orange", "pomme", "poire", "raisin", "figue", "lime", "fruit"], category: "fruit" },
// Viande — mots génériques (après légume/fruit pour éviter les faux positifs)
// "flt" = abréviation Metro pour "filet de poulet"
{ keywords: ["steak", "entrecote", "filet", "flt", "lomo", "tartare", "haché", "hache", "boucherie", "chipolata", "saucisse", "osso bucco"], category: "viande" },
// Crémerie
// "cream" = cream cheese (abréviations Metro)
{ keywords: ["lait", "beurre", "creme", "crème", "cream", "yaourt", "yogurt", "oeuf", "levure", "kefir"], category: "cremerie" },
// Boisson
{ keywords: ["jus", "nectar", "sirop", "cafe", "café", "the", "thé", "lait de coco", "boisson", "eau minérale", "eau plate", "eau gazeuse", "eau"], category: "boisson" },
// Alcool
{ keywords: ["vin", "biere", "bière", "champagne", "prosecco", "amaretto", "whisky", "vodka", "rhum", "liqueur", "alcool", "spiritueux", "cognac", "calvados", "gin", "grappa"], category: "alcool" },
// Sauce
{ keywords: ["sauce", "ketchup", "mayonnaise", "moutarde", "vinaigre", "tabasco", "pesto", "tapenade", "coulis", "pulpe", "concentré", "concentre", "truffe"], category: "sauce" },
// Surgelé
{ keywords: ["surgelé", "surgele", "congelé", "congele", "surgeles"], category: "surgele" },
// Emballage
{ keywords: ["sachet", "barquette", "emballage", "couvercle", "film", "gant", "conteneur"], category: "emballage" },
// Épicerie (sucré/salé — en dernier car mots génériques)
{ keywords: ["aragostine", "farine", "sucre", "sel", "poivre", "huile", "pates", "pâtes", "riz", "quinoa", "lentille", "pois chiche", "chapelure", "panure", "levure chimique", "bicarbonate", "miel", "confiture", "nutella", "chocolat", "cacao", "vanille", "cannelle", "curry", "paprika", "cumin", "noix", "amande", "noisette", "pignon", "raisin sec", "olive", "câpre", "capre", "cornichon", "sardine", "thon en boite", "conserve", "bouillon", "demi glace", "nescafe", "cafe soluble", "cereale", "muesli", "granola", "biscuit", "cookie", "crackers", "pain", "brioche", "foccacia", "mafaldine", "orecchiette", "tagliatelle", "lasagne", "gnocchi", "coquillette", "couscous", "semoule", "polenta"], category: "epicerie" },
];

// Sections Metro → catégorie
const METRO_SECTIONS: { pattern: RegExp; category: Category }[] = [
{ pattern: /BOUCHERIE/i, category: "viande" },
{ pattern: /CHARCUTERIE/i, category: "charcuterie" },
{ pattern: /FROMAGE/i, category: "fromage" },
{ pattern: /BEURRE|OEUF|CREMERIE/i, category: "cremerie" },
{ pattern: /FRUITS?\s+ET\s+LEGUMES?/i, category: "legume" },
{ pattern: /SURGELES?/i, category: "surgele" },
{ pattern: /EPICERIE\s+SECHE|EPICERIE\s+SUCREE/i, category: "epicerie" },
{ pattern: /POISSONNERIE|MAREE/i, category: "maree" },
{ pattern: /BOISSONS?/i, category: "boisson" },
{ pattern: /SPIRITUEUX|ALCOOL/i, category: "alcool" },
{ pattern: /DROGUERIE|HYGIENE/i, category: "autre" },
{ pattern: /TRAITEUR/i, category: "charcuterie" },
];

export function detectCategoryFromName(name: string): Category {
  // Normalise :
  //  - apostrophes → espace : "d'oeuf" → " oeuf" matche
  //  - * → espace : Metro préfixe les produits sous froid de "*" (*SAUMON → saumon)
  // Préfixe espace : évite les faux positifs de sous-chaîne
  // ex: "moule" dans "semoule", "gin" dans "origin"
  const lower = " " + name.toLowerCase().replace(/['\u2019\u2018*]/g, " ");
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(" " + kw)) return rule.category;
    }
  }
  return "autre";
}

export function detectCategoryFromMetroSection(sectionText: string): Category | null {
  for (const s of METRO_SECTIONS) {
    if (s.pattern.test(sectionText)) return s.category;
  }
  return null;
}
