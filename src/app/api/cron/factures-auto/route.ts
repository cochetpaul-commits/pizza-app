import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured } from "@/lib/pennylane/api";
import { autoImportFactures } from "@/lib/invoices/autoImport";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien — récupération automatique des factures Pennylane (Bello Mio).
 * ?days=N pour élargir la fenêtre (défaut 5, max 60) — utile au premier passage.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}` && !req.headers.get("x-vercel-cron")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!pennylaneConfigured()) {
    return NextResponse.json({ error: "PENNYLANE_API_KEY non configurée" }, { status: 400 });
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "5", 10) || 5, 1), 60);

  // Bello Mio uniquement : le forfait Pennylane de Piccola n'inclut pas l'API
  const { data: etab } = await supabaseAdmin
    .from("etablissements").select("id").ilike("slug", "%bello%").maybeSingle();
  if (!etab) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });

  const res = await autoImportFactures(etab.id, days);
  return NextResponse.json({ ok: true, ...res });
}
