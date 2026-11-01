import type { EmpatementType } from "@/lib/pateEngine";

/**
 * Étapes par défaut des recettes de pâte (brief module pâte v2, 01/11/2026). La température de l'eau n'y figure
 * plus : elle se calcule à chaque fournée. Modifiables par recette dans les réglages.
 */
export const ETAPES_BIGA: string[] = [
  "Veille au matin : délayer la levure dans l'eau de biga, ajouter la farine de biga, mélanger 3 min en marche arrière, s'arrêter dès que la farine est hydratée. Bac légèrement huilé, couvert, au froid à 4 °C pendant 24 h (fenêtre 20 à 30 h).",
  "Veille : peser la farine du pétrissage final (stockée à température ambiante, pas au froid), le sel, l'eau de départ avec le miel dissous, l'eau de bassinage.",
  "Jour J : eau de départ et biga coupée en morceaux, vitesse 1 pendant 2 min.",
  "Ajouter la farine du pétrissage final, continuer en vitesse 1.",
  "À 7 min de vitesse 1 : ajouter le sel.",
  "Sel absorbé : bassinage en filet ; fin de vitesse 1 à 10 ou 11 min.",
  "Vitesse 2 pendant 4 min 30 en terminant le bassinage.",
  "Repos 3 min, puis un tour de vitesse 1.",
  "Contrôles : test du voile, température de pâte entre 22 et 24 °C.",
  "Division en grosses boules, rabats, filet d'huile d'olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac.",
];

export const ETAPES_DIRECT: string[] = [
  "Veille : peser toutes les farines (stockées à température ambiante, pas au froid), le sel, l'eau de départ avec le miel dissous, l'eau de bassinage.",
  "Jour J : délayer la levure dans l'eau de départ avec le miel, verser en cuve, vitesse 1 pendant 2 min.",
  "Ajouter toutes les farines, continuer en vitesse 1.",
  "À 7 min de vitesse 1 : ajouter le sel.",
  "Sel absorbé : bassinage en filet ; fin de vitesse 1 à 10 ou 11 min.",
  "Vitesse 2 pendant 4 min 30 en terminant le bassinage.",
  "Repos 3 min, puis un tour de vitesse 1.",
  "Contrôles : test du voile, température de pâte entre 22 et 24 °C.",
  "Division en grosses boules, rabats, filet d'huile d'olive, détaillage au poids du pâton (tolérance 5 g), boulage, 12 pâtons par bac.",
];

export function etapesParDefaut(type: EmpatementType): string[] {
  if (type === "biga") return [...ETAPES_BIGA];
  if (type === "direct") return [...ETAPES_DIRECT];
  return [];
}
