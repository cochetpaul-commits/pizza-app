/**
 * Rapprochement bon de livraison / facture ↔ commande (10/10/2026). Logique pure : les lignes
 * lues sur le document (avec la fiche produit trouvée, si elle l'a été) sont mises en face des
 * lignes de la commande. Pour chaque ligne commandée : ce qui est facturé, l'écart de montant,
 * et une suggestion de contrôle (absent du bon, prix plus élevé, quantité facturée moindre).
 */
import type { EtatReception } from "@/lib/reception";

export type LigneDocument = {
  sku: string | null;
  nom: string;
  quantite: number | null;
  unite: string | null;
  prix_unitaire: number | null;
  total: number | null;
  /** Fiche produit reconnue (référence fournisseur ou libellé) */
  ingredient_id: string | null;
};

export type DocumentLu = {
  numero: string | null;
  date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  lignes: LigneDocument[];
  /** « parser » (fournisseur connu, PDF texte) ou « scan » (lecture d'image) */
  lecture: "parser" | "scan";
};

export type LigneCommandeRapprochement = { id: string; ingredient_id: string | null; nom: string; quantite: number; prix_unitaire_ht: number | null };

export type Suggestion = {
  libelle: string;
  patch: { etat_reception: EtatReception; qty_received?: number | null; prix_recu?: number | null; facture_sur_bon?: boolean };
};

export type Rapprochement = {
  /** Ligne commandée → ce que dit le document */
  parLigne: Record<string, {
    doc: LigneDocument | null;
    totalDoc: number | null;
    totalCommande: number | null;
    /** Montant facturé − montant commandé (null si l'un des deux est inconnu) */
    ecart: number | null;
    statut: "conforme" | "ecart" | "absent" | "inconnu";
    suggestion: Suggestion | null;
  }>;
  /** Lignes du document qui ne correspondent à aucune ligne commandée */
  horsCommande: LigneDocument[];
  nbEcarts: number;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;
const normaliser = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const mots = (s: string) => new Set(normaliser(s).split(" ").filter((m) => m.length >= 3 && !/^\d+$/.test(m)));

/** Ressemblance de libellés : part des mots significatifs du plus court présents dans l'autre */
export function ressemblance(a: string, b: string): number {
  const ma = mots(a), mb = mots(b);
  if (!ma.size || !mb.size) return 0;
  const [petit, grand] = ma.size <= mb.size ? [ma, mb] : [mb, ma];
  let communs = 0;
  for (const m of petit) if (grand.has(m)) communs++;
  return communs / petit.size;
}

export const totalLigneDoc = (d: LigneDocument): number | null =>
  d.total != null ? d.total : d.prix_unitaire != null && d.quantite != null ? arrondi(d.prix_unitaire * d.quantite) : null;

/** Tolérance d'écart : 1 % du montant, au moins 5 centimes */
const significatif = (ecart: number, base: number) => Math.abs(ecart) > Math.max(0.05, Math.abs(base) * 0.01);

export function rapprocher(commande: LigneCommandeRapprochement[], doc: DocumentLu | null): Rapprochement {
  const parLigne: Rapprochement["parLigne"] = {};
  if (!doc) return { parLigne, horsCommande: [], nbEcarts: 0 };
  const restantes = doc.lignes.map((l, i) => ({ l, i }));
  const prendre = (pred: (d: LigneDocument) => boolean): LigneDocument | null => {
    const k = restantes.findIndex((x) => pred(x.l));
    if (k < 0) return null;
    return restantes.splice(k, 1)[0].l;
  };

  // 1. par fiche produit reconnue ; 2. par libellé (au moins les deux tiers des mots en commun)
  const trouvees = new Map<string, LigneDocument>();
  for (const c of commande) {
    if (!c.ingredient_id) continue;
    const d = prendre((x) => x.ingredient_id === c.ingredient_id);
    if (d) trouvees.set(c.id, d);
  }
  for (const c of commande) {
    if (trouvees.has(c.id)) continue;
    let meilleur = -1, score = 0;
    restantes.forEach((x, k) => { const s = ressemblance(c.nom, x.l.nom); if (s > score) { score = s; meilleur = k; } });
    if (meilleur >= 0 && score >= 0.67) trouvees.set(c.id, restantes.splice(meilleur, 1)[0].l);
  }

  let nbEcarts = 0;
  for (const c of commande) {
    const d = trouvees.get(c.id) ?? null;
    const totalCommande = c.prix_unitaire_ht != null ? arrondi(c.prix_unitaire_ht * c.quantite) : null;
    if (!d) {
      nbEcarts++;
      parLigne[c.id] = { doc: null, totalDoc: null, totalCommande, ecart: null, statut: "absent",
        suggestion: { libelle: "Absent du bon : manquant, non facturé", patch: { etat_reception: "manquant", qty_received: 0, facture_sur_bon: false } } };
      continue;
    }
    const totalDoc = totalLigneDoc(d);
    const ecart = totalDoc != null && totalCommande != null ? arrondi(totalDoc - totalCommande) : null;
    let suggestion: Suggestion | null = null;
    const memeQte = d.quantite != null && Math.abs(d.quantite - c.quantite) < 0.001;
    // Même unité de vente quand les prix unitaires sont proches (à 3 % près) ou les quantités égales
    const memeUnite = d.prix_unitaire != null && c.prix_unitaire_ht != null && c.prix_unitaire_ht > 0 && Math.abs(d.prix_unitaire / c.prix_unitaire_ht - 1) <= 0.03;
    if (memeQte && d.prix_unitaire != null && c.prix_unitaire_ht != null && d.prix_unitaire > c.prix_unitaire_ht && significatif(d.prix_unitaire - c.prix_unitaire_ht, c.prix_unitaire_ht)) {
      suggestion = { libelle: `Prix facturé plus élevé (${d.prix_unitaire.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)`, patch: { etat_reception: "prix", prix_recu: d.prix_unitaire } };
    } else if (memeUnite && d.quantite != null && d.quantite < c.quantite - 0.001) {
      suggestion = { libelle: `Facturé ${d.quantite.toLocaleString("fr-FR")} sur ${c.quantite.toLocaleString("fr-FR")} : reçu en partie`, patch: { etat_reception: "partiel", qty_received: d.quantite, facture_sur_bon: false } };
    }
    const statut = ecart == null ? "inconnu" : significatif(ecart, totalCommande ?? 0) ? "ecart" : "conforme";
    if (statut === "ecart") nbEcarts++;
    parLigne[c.id] = { doc: d, totalDoc, totalCommande, ecart, statut, suggestion };
  }
  const horsCommande = restantes.map((x) => x.l).filter((l) => (totalLigneDoc(l) ?? 0) !== 0 || (l.quantite ?? 0) !== 0);
  return { parLigne, horsCommande, nbEcarts: nbEcarts + horsCommande.length };
}
