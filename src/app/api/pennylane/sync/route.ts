import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured, type PlDossier } from "@/lib/pennylane/api";
import { cronUnauthorized } from "@/lib/cronAuth";
import { syncPennylaneMois } from "@/lib/pennylane/syncCharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/pennylane/sync  { etablissement_id, mois?: "YYYY-MM-01", nb_mois?: n }
 * Rapatrie les factures Pennylane du/des mois dans charges_mensuelles.
 * Réservé aux administrateurs (données financières).
 *
 * GET (cron Vercel) : resynchronise le mois en cours et le précédent,
 * pour chaque établissement dont le dossier Pennylane a une clé.
 */

/** bello → SARL SASHA, piccola → SARL I FRATELLI. */
function dossierPourSlug(slug: string | null): PlDossier {
  return (slug ?? "").includes("bello") ? "bello" : "piccola";
}

async function runSync(etabId: string, dossier: PlDossier, mois: string[], out: unknown[]) {
  for (const m of mois) {
    try {
      out.push(await syncPennylaneMois(etabId, m, dossier));
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
  const { data: etab } = await supabaseAdmin
    .from("etablissements").select("id, slug").eq("id", body.etablissement_id).maybeSingle();
  if (!etab) return NextResponse.json({ error: "Établissement introuvable" }, { status: 404 });
  const dossier = dossierPourSlug(etab.slug as string | null);
  if (!pennylaneConfigured(dossier)) {
    return NextResponse.json({ error: `Clé Pennylane non configurée pour ${dossier === "bello" ? "SARL SASHA (Bello Mio)" : "SARL I FRATELLI (Piccola Mia)"}` }, { status: 400 });
  }

  const mois = body.mois ? [body.mois] : moisPrecedents(Math.min(body.nb_mois ?? 1, 12));
  const out: unknown[] = [];
  await runSync(etab.id as string, dossier, mois, out);
  return NextResponse.json({ ok: true, resultats: out });
}

export async function GET(req: NextRequest) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;
  const { data: etabs } = await supabaseAdmin
    .from("etablissements").select("id, slug, nom").eq("actif", true);

  const out: Record<string, unknown[]> = {};
  for (const etab of etabs ?? []) {
    const dossier = dossierPourSlug(etab.slug as string | null);
    if (!pennylaneConfigured(dossier)) continue;
    const res: unknown[] = [];
    await runSync(etab.id as string, dossier, moisPrecedents(2), res);
    out[(etab.nom as string) ?? (etab.slug as string)] = res;
  }
  if (Object.keys(out).length === 0) {
    return NextResponse.json({ error: "Aucune clé Pennylane configurée" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, resultats: out });
}
