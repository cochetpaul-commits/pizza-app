import { normaliserNom } from "@/lib/achats/personnel";

/** Mots qui sentent le repas du personnel plutôt que la carte (tri des fiches Metro, 30/10/2026) */
const MOTS = ["yaourt", "yop", "flanby", "danette", "dessert lact", "compote", "cereal", "muesli", "biscuit", "chips", "coca", "pepsi", "oasis", "ice tea", "jus d", "pain de mie", "nutella", "confiture", "brioche", "petit dej", "gouter", "bonbon", "kinder", "sandwich", "pizza surgel", "plat cuisin", "nouilles", "soupe instant", "lait demi"];

/** Vrai si le nom ressemble à un produit acheté pour l'équipe : proposé en tête du tri */
export function probablePersonnel(nom: string): boolean {
  const n = normaliserNom(nom);
  return MOTS.some((m) => n.includes(normaliserNom(m)));
}
