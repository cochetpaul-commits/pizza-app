import { supabase } from "@/lib/supabaseClient";
import { dateFermeture } from "@/lib/offerClosing";

/**
 * Actif / inactif d'un produit de la Base produits (10/10/2026).
 * Inactif : la fiche sort des listes, des commandes et du prochain inventaire ; ses offres
 * fournisseur sont fermées ; l'historique est conservé. Réactiver remet la fiche dans les listes
 * (les offres restent à ressaisir ou reviennent avec la prochaine facture).
 */
export async function desactiverProduits(ids: string[]): Promise<string | null> {
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const off = await supabase.from("supplier_offers").update({ is_active: false, valid_to: dateFermeture() }).in("ingredient_id", lot).eq("is_active", true);
    if (off.error) return `Fermeture des offres : ${off.error.message}`;
    const { error } = await supabase.from("ingredients").update({ is_active: false }).in("id", lot);
    if (error) return error.message;
  }
  return null;
}

export async function reactiverProduits(ids: string[]): Promise<string | null> {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from("ingredients").update({ is_active: true }).in("id", ids.slice(i, i + 100));
    if (error) return error.message;
  }
  return null;
}
