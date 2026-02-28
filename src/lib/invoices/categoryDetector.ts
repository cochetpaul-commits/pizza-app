import type { Category } from "@/types/ingredients";

type Rule = { keywords: string[]; category: Category };

const RULES: Rule[] = [
// Fromages
{ keywords: ["mozzarella", "burrata", "parmesan", "reggiano", "ricotta", "mascarpone", "fontina", "taleggio", "provolone", "pecorino", "gorgonzola", "cheddar", "brie", "camembert", "comté", "emmental", "gruyere", "reblochon", "roquefort", "fromage"], category: "fromage" },
// Charcuterie
{ keywords: ["jambon", "pancetta", "speck", "nduja", "guanciale", "spianata", "coppa", "bresaola", "salami", "saucisson", "mortadelle", "prosciutto", "lardo", "chorizo", "involtini"], category: "charcuterie" },
// Viande
{ keywords: ["boeuf", "veau", "porc", "poulet", "agneau", "dinde", "canard", "lapin", "steak", "entrecote", "filet", "lomo", "tartare", "haché", "hache", "boucherie"], category: "viande" },
// Marée
{ keywords: ["saumon", "anchois", "thon", "cabillaud", "dorade", "bar", "sole", "crevette", "homard", "langoustine", "moule", "huitre", "coquille", "poulpe", "seiche", "poisson", "maree", "merlu", "truite"], category: "maree" },
// Légumes
{ keywords: ["aubergine", "courgette", "poivron", "champignon", "oignon", "tomate", "roquette", "épinard", "epinard", "salade", "laitue", "carotte", "brocoli", "chou", "fenouil", "céleri", "celeri", "asperge", "artichaut", "poireau", "pois", "haricot", "frite", "patate", "pomme de terre"], category: "legume" },
// Fruits
{ keywords: ["framboise", "fraise", "myrtille", "cerise", "abricot", "peche", "pêche", "mangue", "ananas", "citron", "orange", "pomme", "poire", "raisin", "figue", "fruit"], category: "fruit" },
// Herbes
{ keywords: ["basilic", "romarin", "persil", "thym", "origan", "ciboulette", "coriandre", "menthe", "sauge", "estragon", "laurier", "herbe"], category: "herbe" },
// Crémerie
{ keywords: ["lait", "beurre", "creme", "crème", "yaourt", "yogurt", "oeuf", "blanc oeuf", "jaune oeuf", "levure", "kefir"], category: "cremerie" },
// Boisson
{ keywords: ["eau", "jus", "nectar", "sirop", "cafe", "café", "the", "thé", "lait de coco", "boisson"], category: "boisson" },
// Alcool
{ keywords: ["vin", "biere", "bière", "champagne", "prosecco", "amaretto", "whisky", "vodka", "rhum", "gin", "liqueur", "alcool", "spiritueux", "cognac", "calvados"], category: "alcool" },
// Sauce
{ keywords: ["sauce", "ketchup", "mayonnaise", "moutarde", "vinaigre", "tabasco", "pesto", "tapenade", "coulis", "pulpe", "concentré", "concentre", "truffe"], category: "sauce" },
// Surgelé
{ keywords: ["surgelé", "surgele", "congelé", "congele", "surgeles"], category: "surgele" },
// Emballage
{ keywords: ["sac", "sachet", "barquette", "emballage", "couvercle", "film", "gant", "boite", "conteneur", "kebab"], category: "emballage" },
// Épicerie (sucré/salé)
{ keywords: ["aragostine", "farine", "sucre", "sel", "poivre", "huile", "pates", "pâtes", "riz", "quinoa", "lentille", "pois chiche", "chapelure", "panure", "levure chimique", "bicarbonate", "miel", "confiture", "nutella", "chocolat", "cacao", "vanille", "cannelle", "curry", "paprika", "cumin", "noix", "amande", "noisette", "pignon", "raisin sec", "olive", "câpre", "capre", "cornichon", "anchois", "sardine", "thon en boite", "conserve", "bouillon", "fond", "demi glace", "nescafe", "cafe soluble", "cereale", "muesli", "granola", "biscuit", "cookie", "crackers", "pain", "brioche", "foccacia", "mafaldine", "orecchiette", "tagliatelle", "lasagne", "gnocchi", "coquillette", "couscous", "semoule", "polenta"], category: "epicerie" },
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
const lower = name.toLowerCase();
for (const rule of RULES) {
for (const kw of rule.keywords) {
if (lower.includes(kw)) return rule.category;
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