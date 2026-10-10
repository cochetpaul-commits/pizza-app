/**
 * Contrôle de réception d'une commande (10/10/2026, sur le modèle du contrôle des livraisons
 * ComandR) : chaque ligne reçoit un état, et l'app en déduit ce qui entre réellement en stock
 * et ce qu'il faut réclamer au fournisseur. Logique pure, partagée par l'écran et l'API.
 */

export type EtatReception = "recu" | "manquant" | "partiel" | "abime" | "refuse" | "prix";

export type LigneControle = {
  /** Quantité commandée, dans l'unité de commande */
  quantite: number;
  /** Prix HT par unité de commande (null : prix inconnu, rien ne peut être réclamé) */
  prix_unitaire_ht: number | null;
  etat_reception: EtatReception | null;
  /** Partiel / abîmé : quantité reçue utilisable */
  qty_received: number | null;
  /** Prix différent : prix HT facturé par unité */
  prix_recu: number | null;
  /** La ligne compte dans le total du bon : si non, rien ne sera réclamé */
  facture_sur_bon: boolean;
};

export const ETATS: Record<EtatReception, { libelle: string; court: string; detail: string; couleur: string; probleme: boolean }> = {
  recu: { libelle: "Reçu", court: "Reçu", detail: "Conforme à la commande", couleur: "#4a6741", probleme: false },
  manquant: { libelle: "Manquant", court: "Manque", detail: "Rien n'a été livré", couleur: "#b4443a", probleme: true },
  partiel: { libelle: "Reçu en partie", court: "Partiel", detail: "Une partie manque", couleur: "#b7791f", probleme: true },
  abime: { libelle: "Abîmé", court: "Abîmé", detail: "Tout ou partie inutilisable", couleur: "#b7791f", probleme: true },
  refuse: { libelle: "Refusé", court: "Refusé", detail: "Rendu au livreur", couleur: "#b4443a", probleme: true },
  prix: { libelle: "Prix différent", court: "Prix", detail: "Pas le prix convenu", couleur: "#2563EB", probleme: true },
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Quantité qui entre en stock une fois la réception validée */
export function quantiteEnStock(l: LigneControle): number {
  switch (l.etat_reception) {
    case null: return 0;
    case "recu": case "prix": return l.quantite;
    case "manquant": case "refuse": return 0;
    case "partiel": case "abime": return Math.max(0, Math.min(l.quantite, l.qty_received ?? 0));
  }
}

/** Montant HT à réclamer au fournisseur (0 si rien, ou si la ligne n'est pas facturée) */
export function montantReclame(l: LigneControle): number {
  if (!l.etat_reception || l.etat_reception === "recu") return 0;
  if (l.etat_reception === "prix") {
    if (l.prix_recu == null || l.prix_unitaire_ht == null) return 0;
    return arrondi(Math.max(0, l.prix_recu - l.prix_unitaire_ht) * l.quantite);
  }
  if (!l.facture_sur_bon || l.prix_unitaire_ht == null) return 0;
  const manque = l.quantite - quantiteEnStock(l);
  return arrondi(Math.max(0, manque) * l.prix_unitaire_ht);
}

/** La ligne a-t-elle tout ce qu'il faut pour être enregistrée ? (message d'erreur sinon) */
export function erreurLigne(l: LigneControle): string | null {
  if (l.etat_reception === "partiel" || l.etat_reception === "abime") {
    if (l.qty_received == null || Number.isNaN(l.qty_received)) return "Indiquez la quantité reçue.";
    if (l.qty_received < 0) return "La quantité reçue ne peut pas être négative.";
    if (l.qty_received >= l.quantite) return l.etat_reception === "partiel" ? "Tout est reçu : choisissez « Reçu »." : "Indiquez la quantité utilisable, inférieure à la commande.";
  }
  if (l.etat_reception === "prix" && (l.prix_recu == null || Number.isNaN(l.prix_recu) || l.prix_recu < 0)) return "Indiquez le prix facturé.";
  return null;
}

export type ResumeReception = { total: number; controlees: number; conformes: number; problemes: number; aReclamer: number };

export function resumeReception(lignes: LigneControle[]): ResumeReception {
  let controlees = 0, conformes = 0, problemes = 0, aReclamer = 0;
  for (const l of lignes) {
    if (!l.etat_reception) continue;
    controlees++;
    if (ETATS[l.etat_reception].probleme) problemes++; else conformes++;
    aReclamer += montantReclame(l);
  }
  return { total: lignes.length, controlees, conformes, problemes, aReclamer: arrondi(aReclamer) };
}
