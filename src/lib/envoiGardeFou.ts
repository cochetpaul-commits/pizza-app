/**
 * Garde-fou des envois de commandes hors production.
 * Une preview Vercel (ou un poste local) partage la base de production : un appui sur « Envoyer »
 * y partirait chez le vrai fournisseur. Hors production, seules les adresses @bellomio.fr sont
 * autorisées ; un envoi vers toute autre adresse est refusé en entier.
 */

export const DOMAINE_AUTORISE_HORS_PRODUCTION = "bellomio.fr";

/** Destinataires refusés dans cet environnement (liste vide en production) */
export function destinatairesBloques(destinataires: string[], environnement: string | undefined = process.env.VERCEL_ENV): string[] {
  if (environnement === "production") return [];
  return destinataires.filter((e) => !e.trim().toLowerCase().endsWith(`@${DOMAINE_AUTORISE_HORS_PRODUCTION}`));
}
