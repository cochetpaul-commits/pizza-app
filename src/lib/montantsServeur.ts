import { callerProfile } from "@/lib/getEtablissement";
import { hasPermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Montants (coûts, prix, marges) côté serveur (05/11/2026) : administrateurs et managers seulement
 * (permission « performances.show_money », exceptions de la fiche employé comprises), jamais la tablette partagée.
 */
export async function montantsAutorises(req: Request): Promise<boolean> {
  const appelant = await callerProfile(req);
  if (!appelant?.role) return false;
  if (req.headers.get("x-employe-tablette")) return false;
  const { data: e } = await supabaseAdmin.from("employes").select("custom_permissions").eq("auth_user_id", appelant.userId).maybeSingle();
  const perms = (e?.custom_permissions ?? undefined) as Record<string, boolean> | undefined;
  return hasPermission(appelant.role, "performances.show_money", perms);
}
