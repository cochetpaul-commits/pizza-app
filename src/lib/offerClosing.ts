import type { SupabaseClient } from "@supabase/supabase-js";

/** Date du jour (AAAA-MM-JJ) portée par valid_to quand une offre est fermée. */
export const dateFermeture = () => new Date().toISOString().slice(0, 10);

/**
 * Fiche passée « inactive » : toutes ses offres actives sont fermées
 * (is_active = false, valid_to = date du jour), jamais supprimées — l'historique des prix reste.
 * Même règle que l'import Excel (src/lib/ingredientsImport.ts).
 * Retourne un message d'erreur, ou null si tout s'est bien passé.
 */
export async function fermerOffresActives(supabase: SupabaseClient, ingredientId: string): Promise<string | null> {
  const { error } = await supabase
    .from("supplier_offers")
    .update({ is_active: false, valid_to: dateFermeture(), updated_at: new Date().toISOString() })
    .eq("ingredient_id", ingredientId)
    .eq("is_active", true);
  return error ? error.message : null;
}
