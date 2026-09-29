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

export type LigneFeuille = { zone: string; famille: string | null; nom: string; ingredient_id: string; ordre: number };
export type LectureFeuille = { lignes: LigneFeuille[]; erreurs: string[]; zonesInconnues: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Lignes du fichier (tableau de lignes, la première = en-têtes) → lignes d'inventaire dans l'ordre.
 * En-têtes reconnus : zone ; famille / catégorie ; nom / produit / désignation ; id / identifiant.
 * Une zone reste la même tant que la cellule suivante est vide (cellules fusionnées d'Excel), idem pour la famille.
 */
export function lireFeuille(tableau: unknown[][], zones: string[]): LectureFeuille {
  const erreurs: string[] = [];
  const zonesInconnues = new Set<string>();
  const lignes: LigneFeuille[] = [];
  if (!tableau.length) return { lignes, erreurs: ["Fichier vide"], zonesInconnues: [] };
  const entetes = tableau[0].map(norm);
  const col = (...noms: string[]) => entetes.findIndex((h) => noms.some((n) => h === n || h.startsWith(n)));
  const cZone = col("zone", "emplacement"), cFam = col("famille", "categorie"), cNom = col("nom", "produit", "designation", "article");
  const cId = col("id", "identifiant", "ingredient_id", "fiche");
  if (cZone < 0 || cId < 0) return { lignes, erreurs: ["Colonnes « zone » et « identifiant » introuvables dans la première ligne"], zonesInconnues: [] };
  let zone = "", famille: string | null = null;
  const vus = new Set<string>();
  for (let i = 1; i < tableau.length; i++) {
    const r = tableau[i] ?? [];
    const cell = (c: number) => (c >= 0 ? String(r[c] ?? "").trim() : "");
    if (cell(cZone)) zone = cell(cZone);
    if (cFam >= 0 && cell(cFam)) famille = cell(cFam);
    const id = cell(cId);
    const nom = cell(cNom);
    if (!id && !nom) continue; // ligne vide ou titre
    if (!UUID.test(id)) { erreurs.push(`Ligne ${i + 1} (${nom || "sans nom"}) : identifiant invalide`); continue; }
    const z = zoneCorrespondante(zone, zones);
    if (!z) { zonesInconnues.add(zone || "(vide)"); erreurs.push(`Ligne ${i + 1} (${nom}) : zone « ${zone} » inconnue`); continue; }
    const cle = `${id}|${z}`;
    if (vus.has(cle)) { erreurs.push(`Ligne ${i + 1} (${nom}) : produit déjà présent dans la zone ${z}, ligne ignorée`); continue; }
    vus.add(cle);
    lignes.push({ zone: z, famille, nom, ingredient_id: id.toLowerCase(), ordre: lignes.length + 1 });
  }
  return { lignes, erreurs, zonesInconnues: [...zonesInconnues] };
}
