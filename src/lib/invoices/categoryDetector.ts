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
// Crémerie / Fromage
{ keywords: ["mozzarella", "burrata", "burrat", "parmesan", "reggiano", "ricotta", "mascarpone", "fontina", "taleggio", "provolone", "pecorino", "gorgonzola", "gorgon", "cheddar", "brie", "camembert", "comté", "emmental", "gruyere", "reblochon", "roquefort", "fromage", "chevre", "chèvre", "babybel", "feta", "lait", "beurre", "creme", "crème", "cream", "yaourt", "yogurt", "oeuf", "levure", "kefir", "asiago", "leerdammer", "scamorza", "stracciatella"], category: "cremerie_fromage" },
// Charcuterie / Viande
{ keywords: ["jambon", "pancetta", "speck", "nduja", "guanciale", "spianata", "coppa", "bresaola", "salami", "saucisson", "mortadelle", "prosciutto", "lardo", "chorizo", "involtini", "merguez", "roti", "rôti"], category: "charcuterie_viande" },
// Marée (avant viande pour éviter "filet de sole" → viande)
{ keywords: ["saumon", "anchois", "thon", "cabillaud", "dorade", "bar", "sole", "crevette", "crevet", "homard", "langoustine", "moule", "huitre", "coquille", "poulpe", "seiche", "encornet", "poisson", "maree", "merlu", "truite", "calamar", "calmar"], category: "maree" },
// Viande — mots sans ambiguïté (avant légume pour "CHAIR PORC/VEAU TOMATE" → viande, pas légume)
{ keywords: ["boeuf", "veau", "porc", "poulet", "volaille", "agneau", "dinde", "canard", "lapin", "gigot", "chair", "plt", "egrene", "égrené"], category: "charcuterie_viande" },
// Antipasti
{ keywords: ["antipasti", "antipasto", "artichaut grillé", "poivron grillé", "olive farci", "tomate séchée", "tomate sechee", "tomate confite"], category: "antipasti" },
// Légumes / Herbes
{ keywords: ["aubergine", "auberg", "courgette", "courg", "poivron", "champignon", "champig", "oignon", "tomate", "roquette", "épinard", "epinard", "salade", "laitue", "carotte", "brocoli", "chou", "fenouil", "céleri", "celeri", "asperge", "artichaut", "poireau", "pois", "haricot", "frite", "patate", "pomme de terre", "pdt", "echalote", "échalote", "echalion", "échalion", "concombre", "butternut", "endive", "chataigne", "châtaigne", "soja", "edamame", "legume", "légume", "basilic", "romarin", "persil", "thym", "origan", "ciboulette", "coriandre", "menthe", "sauge", "estragon", "laurier", "herbe", "ail ", "cresson", "cèpe", "cepe", "friarielli", "piment", "radis", "navet", "betterave", "mesclun", "mache", "mâche", "aneth", "avocat"], category: "legumes_herbes" },
// Fruits
{ keywords: ["framboise", "fraise", "myrtille", "cerise", "abricot", "peche", "pêche", "mangue", "ananas", "citron", "citr", "orange", "pomme", "poire", "raisin", "figue", "lime", "fruit", "banane", "kiwi", "melon", "cassis", "litchi", "capron"], category: "fruit" },
// Viande — mots génériques (après légume/fruit pour éviter les faux positifs)
{ keywords: ["steak", "entrecote", "filet", "flt", "lomo", "tartare", "haché", "hache", "boucherie", "chipolata", "saucisse", "osso bucco"], category: "charcuterie_viande" },
// Boisson
{ keywords: ["jus", "nectar", "sirop", "cafe", "café", "the", "thé", "lait de coco", "boisson", "eau minérale", "eau plate", "eau gazeuse", "eau", "limonade", "molecola", "tonic water", "soda", "coca", "orangina", "perrier", "san pellegrino"], category: "boisson" },
// Alcool / Spiritueux (vins italiens, liqueurs, bières)
{ keywords: ["vin", "biere", "bière", "champagne", "prosecco", "amaretto", "whisky", "vodka", "rhum", "liqueur", "alcool", "spiritueux", "cognac", "calvados", "gin", "grappa", "aperol", "campari", "vermouth", "limoncello", "sambuca", "tequila", "marsala", "chianti", "pinot grigio", "falanghina", "negroamaro", "nero d avola", "grillo", "etna", "rosso di montalcino", "moretti", "italicus", "noces royales", "sarti rosa", "fiasco"], category: "alcool_spiritueux" },
// Sauce
{ keywords: ["sauce", "ketchup", "mayonnaise", "moutarde", "vinaigre", "tabasco", "pesto", "tapenade", "coulis", "pulpe", "concentré", "concentre", "truffe", "passata", "sugo", "huile basilic"], category: "sauce" },
// Emballage / Matériel
{ keywords: ["sachet", "barquette", "emballage", "couvercle", "film", "gant", "conteneur", "boîte à pizza", "papier cuisson", "feuille ingraissable", "sac poubelle", "eponge", "éponge", "spatule", "fouet"], category: "emballage" },
// Épicerie Sucrée (biscuits, confiserie, pâtisserie)
{ keywords: ["miel", "confiture", "nutella", "chocolat", "cacao", "vanille", "sucre", "cereale", "muesli", "granola", "biscuit", "cookie", "crackers", "brioche", "amarena", "amaretti", "cantucci", "nocciolata", "panettone", "panforte", "praliné", "praline", "savoiardi", "fagottini", "caramel", "speculoos", "meringue"], category: "epicerie_sucree" },
// Épicerie Salée (pâtes, farines, grains — en dernier car mots génériques)
{ keywords: ["aragostine", "farine", "farina", "sel", "poivre", "huile", "pates", "pâtes", "riz", "quinoa", "lentille", "pois chiche", "chapelure", "panure", "levure chimique", "bicarbonate", "cannelle", "curry", "paprika", "cumin", "noix", "amande", "noisette", "pignon", "raisin sec", "olive", "câpre", "capre", "cornichon", "sardine", "thon en boite", "conserve", "bouillon", "demi glace", "nescafe", "cafe soluble", "pain", "foccacia", "focaccia", "focaccina", "mafaldine", "orecchiette", "tagliatelle", "lasagne", "gnocchi", "coquillette", "couscous", "semoule", "polenta", "surgelé", "surgele", "congelé", "congele", "surgeles", "cannelloni", "casareccia", "fettuccine", "fettucine", "linguine", "pappardelle", "pennette", "spaghetti", "rigatoni", "mezzi rigatoni", "pane carasau", "sésame", "sesame", "pistache", "filotea", "pâte de toscane", "orge perlé", "riso carnaroli", "chips"], category: "epicerie_salee" },
];

// Sections Metro → catégorie
const METRO_SECTIONS: { pattern: RegExp; category: Category }[] = [
{ pattern: /BOUCHERIE/i, category: "charcuterie_viande" },
{ pattern: /CHARCUTERIE/i, category: "charcuterie_viande" },
{ pattern: /FROMAGE/i, category: "cremerie_fromage" },
{ pattern: /BEURRE|OEUF|CREMERIE/i, category: "cremerie_fromage" },
{ pattern: /FRUITS?\s+ET\s+LEGUMES?/i, category: "legumes_herbes" },
{ pattern: /SURGELES?/i, category: "epicerie_salee" },
{ pattern: /EPICERIE\s+SUCREE/i, category: "epicerie_sucree" },
{ pattern: /EPICERIE\s+SECHE/i, category: "epicerie_salee" },
{ pattern: /POISSONNERIE|MAREE/i, category: "maree" },
{ pattern: /BOISSONS?/i, category: "boisson" },
{ pattern: /SPIRITUEUX|ALCOOL/i, category: "alcool_spiritueux" },
{ pattern: /DROGUERIE|HYGIENE/i, category: "autre" },
{ pattern: /TRAITEUR/i, category: "charcuterie_viande" },
];

/**
 * Normalise un nom d'ingrédient pour comparaison insensible aux guillemets,
 * accents et espaces multiples. Utilisé pour éviter les doublons à l'import.
 */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»""‟„‹›]/g, '"')
    .replace(/['’‘‛]/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9"'\s%/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCategoryFromName(name: string): Category {
  // Normalise :
  //  - apostrophes → espace : "d'oeuf" → " oeuf" matche
  //  - * → espace : Metro préfixe les produits sous froid de "*" (*SAUMON → saumon)
  // Préfixe espace : évite les faux positifs de sous-chaîne
  // ex: "moule" dans "semoule", "gin" dans "origin"
  const lower = " " + name.toLowerCase().replace(/['’‘*]/g, " ");
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
