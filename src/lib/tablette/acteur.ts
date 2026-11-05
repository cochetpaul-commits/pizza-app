import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifierJeton } from "@/lib/tablette/jeton";

/**
 * Qui agit (05/11/2026) : sur la tablette partagée, l'employé identifié par son code (jeton signé, en-tête
 * x-employe-tablette) ; sinon la fiche employé liée au compte connecté. Sert à signer commandes, réceptions,
 * inventaires et recettes au nom de la personne, pas du compte « Tablette ».
 */
export type Acteur = { userId: string; employeId: string | null; nom: string; source: "tablette" | "compte" };

const court = (prenom: string, nom: string | null) => `${prenom}${nom ? ` ${nom.charAt(0).toUpperCase()}.` : ""}`;

export async function acteurAction(req: Request, userId: string, etabId?: string | null): Promise<Acteur> {
  const jeton = verifierJeton(req.headers.get("x-employe-tablette"));
  if (jeton && (!etabId || jeton.etab_id === etabId)) {
    const { data } = await supabaseAdmin.from("employes").select("id, prenom, nom").eq("id", jeton.employe_id).eq("actif", true).maybeSingle();
    if (data) return { userId, employeId: data.id as string, nom: court(String(data.prenom), data.nom as string | null), source: "tablette" };
  }
  const { data: emps } = await supabaseAdmin.from("employes").select("id, prenom, nom, etablissement_id").eq("auth_user_id", userId).eq("actif", true);
  const liste = (emps ?? []) as { id: string; prenom: string; nom: string | null; etablissement_id: string | null }[];
  const e = liste.find((x) => !etabId || x.etablissement_id === etabId) ?? liste[0];
  if (e) return { userId, employeId: e.id, nom: court(e.prenom, e.nom), source: "compte" };
  const { data: p } = await supabaseAdmin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return { userId, employeId: null, nom: String(p?.display_name ?? "Inconnu"), source: "compte" };
}
