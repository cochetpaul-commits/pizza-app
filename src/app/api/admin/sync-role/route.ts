import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/admin/sync-role
 * Synchronise le rôle d'un employé RH avec son profil auth (profiles table).
 * Body: { email: string, role: string }
 */
export async function POST(req: NextRequest) {
  const { email, role } = await req.json();
  if (!email || !role) {
    return NextResponse.json({ error: "email et role requis" }, { status: 400 });
  }

  // Chercher l'utilisateur auth par email
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email === email);

  if (!user) {
    return NextResponse.json({ ok: false, message: "Utilisateur auth introuvable" });
  }

  // Mettre à jour le profil
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: user.id });
}
