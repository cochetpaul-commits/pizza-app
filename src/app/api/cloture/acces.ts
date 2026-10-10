import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { hasPermission } from "@/lib/permissions";
import { permissionsEmploye } from "@/lib/commandeEnvoi";

/** Appelant autorisé à la clôture de caisse : permission « Saisir la clôture de caisse » (rôle ou fiche employé) */
export async function accesCloture(req: NextRequest): Promise<{ etabId: string; userId: string } | { erreur: NextResponse }> {
  let a: { etabId: string; userId: string };
  try { a = await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
  const [{ data: profil }, perms] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", a.userId).maybeSingle(),
    permissionsEmploye(a.userId),
  ]);
  if (!hasPermission(String(profil?.role ?? ""), "caisse.cloture", perms)) {
    return { erreur: NextResponse.json({ error: "Accès réservé : autorisation « Saisir la clôture de caisse » sur la fiche employé." }, { status: 403 }) };
  }
  return a;
}
