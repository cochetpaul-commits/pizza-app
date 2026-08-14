import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/auth/link-employe — auto-liaison de la fiche employé.
 *
 * Rattrape les comptes créés sans passer par l'invitation (ou dont la
 * liaison a échoué) : lie toutes les fiches employés actives portant le
 * même email que l'utilisateur connecté, et complète l'accès
 * etablissements_access du profil. Appelé au login quand aucune fiche
 * n'est liée au compte.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });

  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  const user = auth?.user;
  if (!user?.email) return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });

  // Fiches actives au même email, pas encore liées à un compte
  const { data: emps, error } = await supabaseAdmin
    .from("employes")
    .select("id, etablissement_id")
    .ilike("email", user.email)
    .is("auth_user_id", null)
    .eq("actif", true);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!emps || emps.length === 0) return NextResponse.json({ ok: true, linked: 0 });

  const { error: linkErr } = await supabaseAdmin
    .from("employes")
    .update({ auth_user_id: user.id })
    .in("id", emps.map(e => e.id));
  if (linkErr) return NextResponse.json({ ok: false, error: linkErr.message }, { status: 500 });

  // Compléter l'accès établissements du profil
  const etabIds = [...new Set(emps.map(e => e.etablissement_id).filter(Boolean))] as string[];
  if (etabIds.length > 0) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("etablissements_access")
      .eq("id", user.id)
      .maybeSingle();
    const access = new Set<string>([...(profile?.etablissements_access ?? []), ...etabIds]);
    await supabaseAdmin
      .from("profiles")
      .update({ etablissements_access: [...access], updated_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  return NextResponse.json({ ok: true, linked: emps.length });
}
