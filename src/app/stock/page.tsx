import { redirect } from "next/navigation";

/**
 * La page Stock a été fondue dans la Base produits le 10/10/2026 (colonne Stock, tuile « À commander »,
 * mouvements dans le volet). Les outils sont dans Commandes › Proposition de commande et Réglages › Stock et doses.
 */
export default function StockPage() {
  redirect("/ingredients");
}
