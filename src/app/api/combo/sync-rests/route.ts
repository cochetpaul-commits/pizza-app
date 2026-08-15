import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { syncRestsFromCombo } from "@/lib/combo/syncRests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/combo/sync-rests — rapatrie les congés/absences depuis Combo.
 * Réservé aux managers/admins (bouton « Synchroniser Combo » de /rh/conges).
 * Le cron quotidien combo-sync fait la même chose automatiquement.
 */
export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: caller } = await supabaseAdmin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (caller?.role !== "group_admin" && caller?.role !== "manager") {
    return NextResponse.json({ error: "Réservé aux managers" }, { status: 403 });
  }

  try {
    const result = await syncRestsFromCombo();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur Combo" }, { status: 500 });
  }
}
