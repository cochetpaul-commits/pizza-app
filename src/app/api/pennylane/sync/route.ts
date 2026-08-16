import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured } from "@/lib/pennylane/api";
import { syncPennylaneMois } from "@/lib/pennylane/syncCharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/pennylane/sync  { etablissement_id, mois?: "YYYY-MM-01", nb_mois?: n }
 * Rapatrie les factures Pennylane du/des mois dans charges_mensuelles.
 * Réservé aux administrateurs (données financières).
 *
 * GET (cron Vercel) : resynchronise le mois en cours et le précédent.
 */

async function runSync(etabId: string, mois: string[], out: unknown[]) {
  for (const m of mois) {
    try {
      out.push(await syncPennylaneMois(etabId, m));
    } catch (e) {
      out.push({ mois: m, erreur: e instanceof Error ? e.message : "erreur" });
    }
  }
}

function moisPrecedents(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!pennylaneConfigured()) {
    return NextResponse.json({ error: "PENNYLANE_API_KEY non configurée" }, { status: 400 });
  }
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: caller } = await supabaseAdmin.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (caller?.role !== "group_admin") {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { etablissement_id?: string; mois?: string; nb_mois?: number };
  if (!body.etablissement_id) {
    return NextResponse.json({ error: "etablissement_id requis" }, { status: 400 });
  }

  const mois = body.mois ? [body.mois] : moisPrecedents(Math.min(body.nb_mois ?? 1, 12));
  const out: unknown[] = [];
  await runSync(body.etablissement_id, mois, out);
  return NextResponse.json({ ok: true, resultats: out });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !req.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pennylaneConfigured()) {
    return NextResponse.json({ error: "PENNYLANE_API_KEY non configurée" }, { status: 400 });
  }
  // Bello Mio : seul dossier Pennylane connecté aujourd'hui
  const { data: etab } = await supabaseAdmin
    .from("etablissements").select("id").ilike("slug", "%bello%").maybeSingle();
  if (!etab) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });

  const out: unknown[] = [];
  await runSync(etab.id, moisPrecedents(2), out);
  return NextResponse.json({ ok: true, resultats: out });
}
