/**
 * Inventaires (saisie « feuille ») : règles pures, sans accès base.
 *
 * - Conditionnement retenu pour un produit : celui du fournisseur principal de la fiche (default_supplier_id)
 *   s'il a un conditionnement de commande, sinon celui du fournisseur de la dernière offre active ;
 *   sans conditionnement : saisie en unités seulement, dans l'unité de la fiche.
 * - Quantité totale = colis × contenu + unités (1 colis = contenu × élément).
 * - Lecture du fichier de la feuille papier : zone, famille, nom, identifiant de la fiche, dans l'ordre.
 */
import { libelleColisage, nomUnite, TYPES_COLISAGE, UNITES_COMMANDE, type CommandeArticle, type ElementCommande, type UniteCommande, type UniteTaille } from "@/lib/commandeArticles";

export type ArticleFournisseur = CommandeArticle & { supplier_id: string };
export type OffreActive = { supplier_id: string; created_at: string | null; valid_from: string | null };

export type Conditionnement = {
  /** Fournisseur de l'article de commande ; null quand le conditionnement vient de la fiche seule */
  supplier_id: string | null;
  /** Éléments par colis (1 : le colis est l'unité comptée) */
  contenu: number;
  /** « carton de 6 bouteilles » */
  libelle: string;
  /** Nom de l'unité comptée : « bouteille », « colis », « kg » */
  unite: string;
};

/** Conditionnement compté d'après un article de commande */
export function conditionnementDArticle(article: CommandeArticle, supplierId: string | null): Conditionnement {
  const contenu = Number(article.contenu_nb) > 0 ? Number(article.contenu_nb) : 1;
  const auPoids = article.unite_commande === "kg" || article.unite_commande === "litre";
  const unite = auPoids || contenu <= 1 ? nomUnite(article.unite_commande) : nomUnite(article.element ?? "piece");
  return { supplier_id: supplierId, contenu: auPoids ? 1 : contenu, libelle: libelleColisage({ ...article, contenu_nb: contenu }), unite };
}

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
  return conditionnementDArticle(article, article.supplier_id);
}

/** Code d'unité de commande d'après un libellé libre de la fiche (même règle que cmd_unite_code en SQL) */
export function codeUnite(p: string | null | undefined): UniteCommande | null {
  const u = String(p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!u) return null;
  if (["piece", "pieces", "pc", "pcs"].includes(u)) return "piece";
  if (["l", "litre", "litres"].includes(u)) return "litre";
  if (["kg", "kilo", "kilos"].includes(u)) return "kg";
  if (u === "boite" || u === "boites") return "boite";
  if (u === "fut" || u === "futs") return "fut";
  const liste = UNITES_COMMANDE as readonly string[];
  if (liste.includes(u)) return u as UniteCommande;
  const sans = u.replace(/s+$/, "");
  if (liste.includes(sans)) return sans as UniteCommande;
  return null;
}

/** Champs de la fiche qui décrivent le conditionnement de commande */
export type FicheConditionnement = {
  order_unit_label: string | null; order_quantity: number | null; order_element: string | null; order_element_permis?: boolean | null;
  purchase_unit_label: string | null; piece_weight_g: number | null; piece_volume_ml: number | null;
};

/** Article de commande dérivé de la fiche seule (même règle que cmd_conditionnement_fiche en SQL) ; null si l'unité n'est pas reconnue */
export function articleDeFiche(f: FicheConditionnement): CommandeArticle | null {
  const u = codeUnite(f.order_unit_label);
  if (!u) return null;
  if (u === "kg" || u === "litre") return { unite_commande: u, contenu_nb: 1, element: null, element_qte: null, element_unite: null, commande_element_permise: false, precommande: false };
  let c = u === "piece" ? 1 : Number(f.order_quantity) > 0 ? Number(f.order_quantity) : 1;
  if (c < 0) c = 1;
  const pt = codeUnite(f.purchase_unit_label);
  let e: ElementCommande | null = null;
  if (c > 1) {
    const oe = codeUnite(f.order_element);
    e = (oe && oe !== "kg" && oe !== "litre" ? oe : pt && pt !== "kg" && pt !== "litre" && pt !== "piece" ? pt : "piece") as ElementCommande;
  }
  let q: number | null = null, ut: UniteTaille | null = null;
  if (Number(f.piece_weight_g) > 0) { const g = Number(f.piece_weight_g); if (g >= 1000) { q = g / 1000; ut = "kg"; } else { q = g; ut = "g"; } }
  else if (Number(f.piece_volume_ml) > 0) { const ml = Number(f.piece_volume_ml); if (ml >= 1000) { q = ml / 1000; ut = "l"; } else { q = ml; ut = "ml"; } }
  return { unite_commande: u, contenu_nb: c, element: e, element_qte: q, element_unite: ut, commande_element_permise: !!f.order_element_permis && e != null && c > 1, precommande: false };
}

/** Création rapide depuis l'inventaire : ce que l'on remplit sans le prix */
export type CreationProduit = {
  nom: string; categorie: string; sous_categorie?: string | null; supplier_id?: string | null;
  /** Acheté à la pièce, au kilo ou au litre */
  unite: "piece" | "kg" | "litre";
  /** Type de pièce (bouteille, pot, sachet…) quand acheté à la pièce */
  type_piece?: string | null;
  /** Taille d'une pièce (750 ml, 250 g…) */
  taille_qte?: number | null; taille_unite?: "g" | "kg" | "ml" | "l" | null;
  /** Conditionnement de commande (carton, colis…) et nombre de pièces dedans */
  colisage?: string | null; contenu?: number | null;
};

/** Contrôle et traduit la création rapide en colonnes de la fiche (sans prix) */
export function ficheDepuisCreation(c: CreationProduit): { ok: true; fiche: Record<string, unknown> } | { ok: false; erreur: string } {
  const nom = String(c.nom ?? "").trim();
  if (nom.length < 2) return { ok: false, erreur: "Nom trop court" };
  if (!c.categorie) return { ok: false, erreur: "Catégorie requise" };
  if (!["piece", "kg", "litre"].includes(c.unite)) return { ok: false, erreur: "Unité d'achat inconnue" };
  const types = TYPES_COLISAGE as readonly string[];
  const typePiece = c.unite === "piece" ? (c.type_piece && types.includes(c.type_piece) ? c.type_piece : "piece") : null;
  if (c.type_piece && c.unite === "piece" && !types.includes(c.type_piece)) return { ok: false, erreur: "Type de pièce inconnu" };
  const colisage = c.colisage ? c.colisage : null;
  if (colisage && !types.includes(colisage)) return { ok: false, erreur: "Conditionnement inconnu" };
  const contenu = colisage ? Number(c.contenu) : null;
  if (colisage && (!Number.isFinite(contenu) || contenu! <= 0)) return { ok: false, erreur: "Nombre de pièces par conditionnement : nombre positif" };
  const qte = c.taille_qte == null || c.taille_qte === 0 ? null : Number(c.taille_qte);
  if (qte != null && (!Number.isFinite(qte) || qte <= 0)) return { ok: false, erreur: "Taille : quantité positive" };
  if (qte != null && !["g", "kg", "ml", "l"].includes(c.taille_unite ?? "")) return { ok: false, erreur: "Taille : unité inconnue" };
  const auPoids = c.unite !== "piece";
  const poids = !auPoids && qte != null && (c.taille_unite === "g" || c.taille_unite === "kg") ? (c.taille_unite === "kg" ? qte * 1000 : qte) : null;
  const volume = !auPoids && qte != null && (c.taille_unite === "ml" || c.taille_unite === "l") ? (c.taille_unite === "l" ? qte * 1000 : qte) : null;
  return {
    ok: true,
    fiche: {
      name: nom, category: c.categorie, sub_category: c.sous_categorie?.trim() || null,
      supplier_id: c.supplier_id || null, default_supplier_id: c.supplier_id || null,
      default_unit: c.unite === "kg" ? "kg" : c.unite === "litre" ? "l" : "pc",
      purchase_unit_label: c.unite === "kg" ? "kg" : c.unite === "litre" ? "L" : typePiece,
      piece_weight_g: poids, piece_volume_ml: volume,
      // Unité de commande : le colis s'il y en a un, sinon la pièce (ou kg / litre) ; la commande en dérive
      order_unit_label: colisage ?? (auPoids ? c.unite : typePiece),
      order_quantity: colisage ? contenu : null,
      order_element: colisage && contenu! > 1 ? typePiece : null,
      order_element_permis: false,
    },
  };
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
