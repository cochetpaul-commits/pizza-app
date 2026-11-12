/**
 * Quiz sur la carte (12/11/2026, demande de Paul) : comme le quiz vins, les questions sont fabriquées depuis ce qui
 * existe déjà (touches de caisse Popina, prix, fiches techniques reliées), rien à saisir. Logique pure, testée.
 * Pas de question sur les allergènes tant que les fiches ne sont pas toutes vérifiées : un quiz faux serait pire
 * que pas de quiz.
 * Les questions gardent la forme du quiz vins (`vin_id`, `vin_nom` = le sujet de la question) pour que les séries
 * enregistrées se lisent toutes de la même façon.
 */
import type { Question, TypeQuestion } from "@/lib/quizVins";

export type PlatQuiz = { id: string; nom: string; categorie: string; prix: number; ingredients: string[] };

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const cle = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function melanger<T>(liste: T[], alea: () => number): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ── Nom d'ingrédient lisible : les fiches portent le nom du catalogue fournisseur ───────────────── */
const BRUIT = new Set(["KG", "G", "GR", "L", "ML", "CL", "X", "C1", "CAT1", "FRANCE", "ESPAGNE", "ITALIE", "BELGIQUE", "KENYA", "NORMANDIE", "BRETONNE", "BOTT", "SAC", "MC", "PREP", "DOP", "IGP", "BLOC", "COLIS", "CM", "S", "VS", "MOIS", "M.C", "B.TIGER", "CRU", "ENTIER", "ARTISANAL", "TRADITIONNELLE", "DOLCEVALLE", "FILET", "RAPE", "MAIGRE", "RONDE", "MOYEN", "DOUX", "FIN", "FR", "MM", "BIO"]);
const ALIAS: Record<string, string> = {
  "parme": "Jambon de Parme", "courg": "Courgette", "parmesan reggiano": "Parmesan", "parmesan reggiano de montagne": "Parmesan",
  "fregula sarda": "Fregola sarda", "olive taggiashe": "Olives taggiasche", "tartare couteau vbf": "Bœuf coupé au couteau",
  "longe de thon rouge": "Thon rouge", "gambas": "Gambas", "homard vivant": "Homard", "tentacules de poulpe cuits": "Poulpe",
  "mozzarella lait": "Mozzarella", "mozzarella bufflonne bbc": "Mozzarella di bufala", "pomme de terre chair ferme": "Pomme de terre",
  "champignon brun pied coupe": "Champignons bruns", "champignon de paris brun": "Champignons bruns", "bresaola boeuf di punta d'anca": "Bresaola",
  "mortadelle pistache": "Mortadelle à la pistache", "spianata de calabre": "Spianata de Calabre", "jambon roti aux herbes": "Jambon rôti aux herbes",
  "tomate seche confite a l'huile": "Tomates séchées", "tomate san marzano pelee": "Tomate San Marzano", "capre capucine": "Câpres",
  "sesame dore": "Sésame", "pesto citron /amande": "Pesto citron amande", "lea&per sce worcester": "Sauce Worcestershire",
  "cognac delaitre": "Cognac", "scamorza fumee": "Scamorza fumée", "pecorino moliterno truffe": "Pecorino à la truffe",
  "moules morisseau": "Moules", "glace vanille gousse naturelle infusée": "Glace vanille", "creme fromages": "Crème 3 fromages",
  "prosecco edoardo rota doc treviso": "Prosecco", "blc spumante brut ribe millesimato mdv": "Spumante", "aperitivo aspide spritz silvio carta": "Aperitivo Aspide",
  "il beneduce limoncello": "Limoncello", "rond gite de veau": "Veau", "cotes de veau": "Côte de veau", "dessus de palette viande": "Palette",
  "creme de mascarpone a la truffe": "Crème de mascarpone à la truffe", "pignon de pin": "Pignons de pin", "pistache hachee": "Pistache",
};
const ACCENTS: Record<string, string> = { creme: "crème", sechee: "séchée", fumee: "fumée", roti: "rôti", echalote: "échalote", concentre: "concentré", legere: "légère", cuillere: "cuillère", oeuf: "œuf", "d'oeuf": "d'œuf" };
/** Les basiques qu'on ne demande pas (présents partout, ou sans intérêt pour la salle) */
const BASIQUES = ["huile", "sel", "fleur de sel", "poivre", "ail", "pulpe d'ail", "persil", "eau", "sucre", "farine", "origan", "thym", "oignon", "échalote", "basilic", "semoule", "chapelure", "œuf", "blanc d'œuf", "jaune d'œuf", "beurre", "crème légère", "vin blanc", "vinaigre", "citron", "concentré", "nescafe", "perrier", "blend"];

export function nomIngredient(brut: string): string {
  const sans = brut.replace(/’/g, "'").replace(/\([^)]*\)/g, " ").replace(/\bDE VACHE\b/gi, " ").replace(/~/g, " ");
  const mots = sans.split(/\s+/).filter((m) => m && !/\d/.test(m) && !BRUIT.has(m.toUpperCase()) && !/^[%Ø/.,-]+$/.test(m));
  let propre = mots.join(" ").toLowerCase().replace(/\s+/g, " ").replace(/\s+(de|d'|a|au|aux|et)$/i, "").trim();
  if (ALIAS[propre]) return ALIAS[propre];
  propre = propre.split(" ").map((m) => ACCENTS[m] ?? m).join(" ");
  return propre ? propre.charAt(0).toUpperCase() + propre.slice(1) : "";
}
const estBasique = (nom: string) => { const n = nom.toLowerCase(); return BASIQUES.some((b) => n === b || n.startsWith(`${b} `)); };

/** Les ingrédients d'un plat tels qu'on les dit à la table : nettoyés, sans doublon, sans les basiques */
export function ingredientsMarquants(plat: PlatQuiz): string[] {
  const vus = new Set<string>(); const out: string[] = [];
  for (const b of plat.ingredients) {
    const n = nomIngredient(b);
    if (!n || estBasique(n) || vus.has(cle(n))) continue;
    vus.add(cle(n)); out.push(n);
  }
  return out;
}

function assembler(type: TypeQuestion, plat: PlatQuiz, question: string, bonne: string, faux: string[], explication: string, alea: () => number): Question | null {
  const distincts = [...new Map(faux.filter((f) => cle(f) !== cle(bonne)).map((f) => [cle(f), f])).values()].slice(0, 3);
  if (distincts.length < 3) return null;
  const options = melanger([bonne, ...distincts], alea);
  return { type, vin_id: plat.id, vin_nom: plat.nom, question, options, bonne: options.indexOf(bonne), explication };
}
/** Les autres plats, ceux de la même catégorie d'abord */
function voisins(plats: PlatQuiz[], plat: PlatQuiz, alea: () => number): PlatQuiz[] {
  const autres = plats.filter((p) => p.id !== plat.id);
  return [...melanger(autres.filter((p) => p.categorie === plat.categorie), alea), ...melanger(autres.filter((p) => p.categorie !== plat.categorie), alea)];
}

/** Toutes les questions possibles pour un plat */
export function questionsPourPlat(plat: PlatQuiz, plats: PlatQuiz[], alea: () => number): Question[] {
  const out: Question[] = [];
  const pousser = (q: Question | null) => { if (q) out.push(q); };
  const ings = ingredientsMarquants(plat);
  const proches = voisins(plats, plat, alea);
  const fiche = ings.length ? `${plat.nom} : ${ings.join(", ")}. ${eur(plat.prix)}.` : `${plat.nom} : ${eur(plat.prix)}.`;

  if (plat.prix > 0) pousser(assembler("prix_plat", plat, `À quel prix : ${plat.nom} ?`, eur(plat.prix), proches.filter((p) => p.prix > 0).map((p) => eur(p.prix)), fiche, alea));

  if (ings.length >= 3) {
    // Retrouver le plat à sa composition : seulement face à des plats qui ont eux aussi une fiche
    const liste = ings.slice(0, 6).join(", ");
    pousser(assembler("plat_compo", plat, `Quel plat : ${liste} ?`, plat.nom, proches.filter((p) => p.ingredients.length).map((p) => p.nom), fiche, alea));
  }
  if (ings.length) {
    const miens = new Set(ings.map(cle));
    const ailleurs = [...new Map(proches.flatMap((p) => ingredientsMarquants(p)).filter((n) => !miens.has(cle(n))).map((n) => [cle(n), n])).values()];
    // Un ingrédient du plat qui ne répète pas son nom (la truffe des « arancini al tartufo » ne se demande pas)
    const motsNom = new Set(cle(plat.nom).split(" ").filter((m) => m.length > 3));
    const candidats = ings.filter((n) => !cle(n).split(" ").some((m) => motsNom.has(m)));
    const bon = melanger(candidats.length ? candidats : ings, alea)[0];
    pousser(assembler("ingredient_dans", plat, `Lequel de ces ingrédients est dans : ${plat.nom} ?`, bon, melanger(ailleurs, alea), fiche, alea));
    if (ings.length >= 3 && ailleurs.length) {
      const intrus = melanger(ailleurs, alea)[0];
      pousser(assembler("intrus", plat, `Lequel n'est PAS dans : ${plat.nom} ?`, intrus, melanger(ings, alea), fiche, alea));
    }
  }
  return out;
}

/** Un quiz de n questions : un plat différent par question tant que possible, des types variés */
export function genererQuizCarte(plats: PlatQuiz[], n: number, alea: () => number = Math.random): Question[] {
  const carte = plats.filter((p) => p.nom.trim());
  if (carte.length < 4) return [];
  const sortie: Question[] = [];
  const typesVus = new Map<TypeQuestion, number>();
  for (let tour = 0; tour < 3 && sortie.length < n; tour++) {
    for (const plat of melanger(carte, alea)) {
      if (sortie.length >= n) break;
      const possibles = questionsPourPlat(plat, carte, alea).filter((q) => !sortie.some((s) => s.vin_id === q.vin_id && s.type === q.type));
      if (!possibles.length) continue;
      possibles.sort((a, b) => (typesVus.get(a.type) ?? 0) - (typesVus.get(b.type) ?? 0) || alea() - 0.5);
      const q = possibles[0];
      typesVus.set(q.type, (typesVus.get(q.type) ?? 0) + 1);
      sortie.push(q);
    }
  }
  return sortie;
}

/* ── Quiz de la semaine et classement du mois ─────────────────────────────────────────────────── */
/** Le jour à Paris (AAAA-MM-JJ) d'un instant */
export function jourParis(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}
/** Le lundi (AAAA-MM-JJ) de la semaine d'un jour */
export function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export type SerieSemaine = { cle: string; nom: string; score: number; nb_questions: number; created_at: string };
export type LigneClassement = { nom: string; points: number; sur: number; semaines: number };
/**
 * Classement d'un mois (AAAA-MM) : la somme des quiz de la semaine joués dans le mois, un seul par personne et par
 * semaine (le premier). À égalité de points, celui qui a le meilleur taux, puis l'ordre alphabétique.
 */
export function classementMois(series: SerieSemaine[], mois: string): LigneClassement[] {
  const par = new Map<string, LigneClassement & { vues: Set<string> }>();
  for (const s of [...series].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const jour = jourParis(s.created_at);
    if (!jour.startsWith(mois)) continue;
    const p = par.get(s.cle) ?? { nom: s.nom, points: 0, sur: 0, semaines: 0, vues: new Set<string>() };
    const semaine = lundiDe(jour);
    if (p.vues.has(semaine)) continue;
    p.vues.add(semaine); p.points += s.score; p.sur += s.nb_questions; p.semaines++;
    par.set(s.cle, p);
  }
  return [...par.values()].map(({ nom, points, sur, semaines }) => ({ nom, points, sur, semaines }))
    .sort((a, b) => b.points - a.points || (b.sur ? b.points / b.sur : 0) - (a.sur ? a.points / a.sur : 0) || a.nom.localeCompare(b.nom, "fr"));
}
