/**
 * Inventaires (saisie « feuille ») : règles pures, sans accès base.
 *
 * - Conditionnement retenu pour un produit : celui du fournisseur principal de la fiche (default_supplier_id)
 *   s'il a un conditionnement de commande, sinon celui du fournisseur de la dernière offre active ;
 *   sans conditionnement : saisie en unités seulement, dans l'unité de la fiche.
 * - Quantité totale = colis × contenu + unités (1 colis = contenu × élément).
 * - Lecture du fichier de la feuille papier : zone, famille, nom, identifiant de la fiche, dans l'ordre.
 */
import { libelleColisage, nomUnite, type CommandeArticle } from "@/lib/commandeArticles";

export type ArticleFournisseur = CommandeArticle & { supplier_id: string };
export type OffreActive = { supplier_id: string; created_at: string | null; valid_from: string | null };

export type Conditionnement = {
  supplier_id: string;
  /** Éléments par colis (1 : le colis est l'unité comptée) */
  contenu: number;
  /** « carton de 6 bouteilles » */
  libelle: string;
  /** Nom de l'unité comptée : « bouteille », « colis », « kg » */
  unite: string;
};

export function choisirConditionnement(
  defaultSupplierId: string | null,
  articles: ArticleFournisseur[],
  offres: OffreActive[],
): Conditionnement | null {
  const date = (o: OffreActive) => o.valid_from ?? o.created_at ?? "";
  const derniere = [...offres].sort((a, b) => date(b).localeCompare(date(a)))[0];
  const article =
    (defaultSupplierId ? articles.find((a) => a.supplier_id === defaultSupplierId) : undefined)
    ?? (derniere ? articles.find((a) => a.supplier_id === derniere.supplier_id) : undefined);
  if (!article) return null;
  const contenu = Number(article.contenu_nb) > 0 ? Number(article.contenu_nb) : 1;
  const auPoids = article.unite_commande === "kg" || article.unite_commande === "litre";
  const unite = auPoids || contenu <= 1 ? nomUnite(article.unite_commande) : nomUnite(article.element ?? "piece");
  return { supplier_id: article.supplier_id, contenu: auPoids ? 1 : contenu, libelle: libelleColisage({ ...article, contenu_nb: contenu }), unite };
}

/** Total en unités comptées ; null tant que rien n'est saisi (≠ 0 compté) */
export function totalLigne(colis: number | null, unites: number | null, contenu: number | null): number | null {
  if (colis == null && unites == null) return null;
  const c = contenu && contenu > 0 ? contenu : 1;
  return Math.round(((colis ?? 0) * c + (unites ?? 0)) * 1000) / 1000;
}

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export type LigneFeuille = {
  zone: string; famille: string | null; nom: string; ordre: number;
  /** Identifiant de la fiche, ou à défaut le nom de la fiche (rattachement par nom exact côté serveur) ; null : fiche à créer */
  ref: string | null;
  fournisseur: string | null;
  /** Unité de comptage imprimée sur la feuille (« pièce », « kg », « colis de 20 »…) ; null si le fichier n'en a pas */
  uniteFeuille: string | null;
  rattachement: string | null;
};
export type LectureFeuille = { lignes: LigneFeuille[]; erreurs: string[]; zonesInconnues: string[]; doublons: number };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Zone du fichier → zone de l'établissement : même nom (sans accents ni casse), sinon le nom de zone qui commence pareil (« Cave » → « CAVE A VIN ») */
export function zoneCorrespondante(zoneFichier: string, zones: string[]): string | null {
  const z = norm(zoneFichier);
  if (!z) return null;
  const exacte = zones.find((x) => norm(x) === z);
  if (exacte) return exacte;
  const debut = zones.filter((x) => norm(x).startsWith(z) || z.startsWith(norm(x)));
  return debut.length === 1 ? debut[0] : null;
}

/**
 * Unité de comptage de la feuille → saisie : « colis de 20 », « carton de 6 », « colis de 4 bacs » : deux champs
 * (colis + unités, contenu N) ; « pièce », « kg », « litre », « bouteille »… : un seul champ dans cette unité.
 */
export function comptageFeuille(unite: string): { contenu: number | null; unite: string; libelle: string } {
  const t = unite.trim();
  const m = /^(colis|carton|caisse|pack|plateau)\s+de\s+(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(t);
  if (m) {
    const n = Number(m[2].replace(",", "."));
    const el = (m[3] || "pièce").trim().replace(/s$/i, "");
    return { contenu: n > 0 ? n : null, unite: el, libelle: t };
  }
  return { contenu: null, unite: t || "pièce", libelle: t };
}

/**
 * Lignes du fichier (tableau de lignes, la première = en-têtes) → lignes d'inventaire dans l'ordre (colonne « ordre » si présente).
 * En-têtes reconnus : ordre ; zone ; famille ; produit (comme sur la feuille) / nom ; fournisseur ; unité de comptage ;
 * ingredient_id / identifiant ; rattachement. Zone et famille reportées sur les cellules vides (cellules fusionnées).
 * Un même produit deux fois dans une zone est gardé (deux factures) : additionné à la valorisation.
 */
export function lireFeuille(tableau: unknown[][], zones: string[]): LectureFeuille {
  const erreurs: string[] = [];
  const zonesInconnues = new Set<string>();
  const brutes: (LigneFeuille & { rang: number })[] = [];
  if (!tableau.length) return { lignes: [], erreurs: ["Fichier vide"], zonesInconnues: [], doublons: 0 };
  const entetes = tableau[0].map(norm);
  const col = (...noms: string[]) => entetes.findIndex((h) => noms.some((n) => h === n || h.startsWith(n)));
  const cOrdre = col("ordre"), cZone = col("zone", "emplacement"), cFam = col("famille", "categorie");
  const cNom = col("produit", "nom", "designation", "article"), cFour = col("fournisseur"), cUnite = col("unite de comptage", "unite");
  const cId = col("ingredient_id", "identifiant", "id", "fiche"), cRatt = col("rattachement");
  if (cZone < 0 || (cId < 0 && cNom < 0)) return { lignes: [], erreurs: ["Colonnes « zone » et « produit » ou « identifiant » introuvables dans la première ligne"], zonesInconnues: [], doublons: 0 };
  let zone = "", famille: string | null = null;
  for (let i = 1; i < tableau.length; i++) {
    const r = tableau[i] ?? [];
    const cell = (c: number) => (c >= 0 ? String(r[c] ?? "").trim() : "");
    if (cell(cZone)) zone = cell(cZone);
    if (cFam >= 0 && cell(cFam)) famille = cell(cFam);
    const nom = cell(cNom), ref = cell(cId);
    if (!nom && !ref) continue; // ligne vide ou titre
    const z = zoneCorrespondante(zone, zones);
    if (!z) { zonesInconnues.add(zone || "(vide)"); erreurs.push(`Ligne ${i + 1} (${nom}) : zone « ${zone} » inconnue`); continue; }
    const ordre = Number(cell(cOrdre));
    brutes.push({
      zone: z, famille, nom: nom || ref, ordre: 0, rang: Number.isFinite(ordre) && ordre > 0 ? ordre : i,
      ref: ref || null, fournisseur: cell(cFour) || null, uniteFeuille: cUnite >= 0 ? cell(cUnite) || null : null, rattachement: cell(cRatt) || null,
    });
  }
  brutes.sort((a, b) => a.rang - b.rang);
  const vus = new Set<string>();
  let doublons = 0;
  const lignes = brutes.map(({ rang: _r, ...l }, k) => {
    const cle = `${norm(l.ref ?? l.nom)}|${l.zone}`;
    if (vus.has(cle)) doublons++;
    vus.add(cle);
    return { ...l, ordre: k + 1 };
  });
  return { lignes, erreurs, zonesInconnues: [...zonesInconnues], doublons };
}

/** Famille du fichier → catégorie de fiche (fiches créées à l'import) */
export function categorieDeFamille(famille: string | null): string {
  const f = norm(famille);
  if (f.startsWith("cremerie")) return "cremerie_fromage";
  if (f.startsWith("fruits") || f.startsWith("legumes")) return "legumes_herbes";
  if (f.startsWith("poisson") || f.startsWith("maree")) return "maree";
  if (f.startsWith("viande") || f.startsWith("charcuterie")) return "charcuterie_viande";
  if (f.startsWith("surgele")) return "surgele";
  if (f.startsWith("sauce")) return "sauce";
  if (f.startsWith("epicerie sucree")) return "epicerie_sucree";
  if (f.startsWith("epicerie") || f.startsWith("base pizza") || f.startsWith("sec")) return "epicerie_salee";
  if (f.startsWith("emballage") || f.startsWith("consommable") || f.startsWith("entretien") || f.startsWith("hygiene")) return "emballage";
  if (f.startsWith("vin")) return "vins";
  if (f.startsWith("biere")) return "biere";
  if (f.startsWith("cafe")) return "cafeteria";
  if (f.startsWith("sirop")) return "sirops";
  if (f.startsWith("soft")) return "soft";
  if (f.startsWith("spiritueux")) return "spiritueux";
  if (f.startsWith("liqueur")) return "liqueurs";
  return "autre";
}

/** Unité de comptage de la feuille → unité de base d'une fiche créée (g, kg, l, pc) */
export function uniteFicheDe(uniteFeuille: string | null): "kg" | "l" | "pc" {
  const u = norm(uniteFeuille);
  if (u === "kg") return "kg";
  if (u === "litre" || u === "l") return "l";
  return "pc";
}
