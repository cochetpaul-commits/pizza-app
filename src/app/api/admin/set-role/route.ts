import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/admin/set-role — change le rôle d'un employé.
 *
 * Source unique : écrit AU MÊME MOMENT employes.role (la fiche) et
 * profiles.role (le compte, si lié) — fin de la règle implicite
 * « le rôle le plus élevé gagne » entre les deux tables.
 * Réservé aux administrateurs.
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: caller } = await supabaseAdmin
    .from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (caller?.role !== "group_admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }

  const { employeId, role } = (await req.json()) as { employeId?: string; role?: string };
  if (!employeId || !role || !["group_admin", "manager", "equipier"].includes(role)) {
    return NextResponse.json({ error: "employeId et role (group_admin|manager|equipier) requis" }, { status: 400 });
  }

  const { data: emp, error: empErr } = await supabaseAdmin
    .from("employes")
    .update({ role })
    .eq("id", employeId)
    .select("id, auth_user_id, email")
    .single();
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });

  // Toutes les fiches du même compte + le compte lui-même restent alignés
  if (emp.auth_user_id) {
    await supabaseAdmin.from("employes").update({ role }).eq("auth_user_id", emp.auth_user_id);
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", emp.auth_user_id);
    if (profErr) return NextResponse.json({ error: `Fiche mise à jour mais pas le compte : ${profErr.message}` }, { status: 500 });
  } else if (emp.email) {
    // Pas de compte lié : aligner les éventuelles autres fiches au même email
    await supabaseAdmin.from("employes").update({ role }).ilike("email", emp.email);
  }

  return NextResponse.json({ ok: true, role, compteLie: !!emp.auth_user_id });
}
