import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement } from "@/lib/getEtablissement";
import { verifierJeton } from "@/lib/tablette/jeton";

/**
 * Qui agit sur une fournée (02/11/2026). L'employé vient du jeton tablette (code à 4 chiffres) ou de la fiche liée au
 * compte. Lancer et clôturer un lot : pizzaiolos formés (employes.pate_autorise) et responsables (manager, group_admin).
 * Les étapes intermédiaires : toute personne identifiée.
 */
export type ActeurPate = {
  etabId: string;
  userId: string;
  employeId: string | null;
  nom: string;
  peutLancer: boolean;
  /** « tablette » quand l'employé vient du code tablette */
  source: "tablette" | "compte";
};

export async function acteurPate(req: NextRequest | Request): Promise<ActeurPate> {
  const { etabId, userId, isGroupAdmin } = await getEtablissement(req);
  const [{ data: profil }, jeton] = [await supabaseAdmin.from("profiles").select("role, display_name").eq("id", userId).maybeSingle(), verifierJeton(req.headers.get("x-employe-tablette"))];
  const roleCompte = String(profil?.role ?? "");
  const responsableCompte = isGroupAdmin || roleCompte === "manager" || roleCompte === "group_admin";

  type Emp = { id: string; prenom: string; nom: string | null; role: string | null; pate_autorise: boolean | null; etablissement_id: string | null };
  const colonnes = "id, prenom, nom, role, pate_autorise, etablissement_id";
  let employe: Emp | null = null;
  let source: "tablette" | "compte" = "compte";
  if (jeton && jeton.etab_id === etabId) {
    const { data } = await supabaseAdmin.from("employes").select(colonnes).eq("id", jeton.employe_id).eq("actif", true).maybeSingle();
    if (data) { employe = data as Emp; source = "tablette"; }
  }
  if (!employe) {
    const { data } = await supabaseAdmin.from("employes").select(colonnes).eq("auth_user_id", userId).eq("actif", true);
    const liste = (data ?? []) as Emp[];
    employe = liste.find((e) => e.etablissement_id === etabId) ?? liste[0] ?? null;
  }
  const roleEmploye = String(employe?.role ?? "");
  const peutLancer = source === "tablette"
    ? !!employe && (!!employe.pate_autorise || roleEmploye === "manager" || roleEmploye === "group_admin")
    : responsableCompte || (!!employe && (!!employe.pate_autorise || roleEmploye === "manager" || roleEmploye === "group_admin"));
  const nom = employe ? `${employe.prenom}${employe.nom ? ` ${String(employe.nom).charAt(0)}.` : ""}` : String(profil?.display_name ?? "Compte");
  return { etabId, userId, employeId: employe?.id ?? null, nom, peutLancer, source };
}
