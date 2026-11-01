import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { calculerPate, type EmpatementType, type FlourMixItem } from "@/lib/pateEngine";
import { EtiquettesPdfDocument, type EtiquettesData } from "@/lib/etiquettesPdf";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const n = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

/**
 * GET /api/empatements/etiquettes?recette=&patons=&poids=&date=
 * Étiquettes de mise en place de la veille (PDF) : une par contenant, pour la fournée du lendemain par défaut.
 */
export async function GET(req: NextRequest) {
  let etab: { etabId: string };
  try { etab = await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  const recetteId = sp.get("recette") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(recetteId)) return NextResponse.json({ error: "recette invalide" }, { status: 400 });
  const demain = new Date(); demain.setDate(demain.getDate() + 1);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? (sp.get("date") as string) : demain.toISOString().slice(0, 10);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } }, auth: { persistSession: false },
  });
  const [{ data: r, error }, { data: etabRow }] = await Promise.all([
    supabase.from("recipes").select("*").eq("id", recetteId).maybeSingle(),
    supabase.from("etablissements").select("nom").eq("id", etab.etabId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!r) return NextResponse.json({ error: "Recette introuvable" }, { status: 404 });

  const t = String(r.type ?? "direct");
  const type = (t === "biga" || t === "focaccia" ? t : "direct") as EmpatementType;
  let mix: FlourMixItem[] = [];
  try { mix = (typeof r.flour_mix === "string" ? JSON.parse(r.flour_mix) : r.flour_mix) as FlourMixItem[]; } catch { mix = []; }
  const patons = Math.max(1, Math.round(n(sp.get("patons"), n(r.balls_count, 12))));
  const poids = Math.max(1, Math.round(n(sp.get("poids"), n(r.ball_weight, 260))));

  let resultat;
  try {
    resultat = calculerPate({
      type, nbPatons: patons, poidsPaton: poids,
      recipe: {
        hydration_total: n(r.hydration_total, 65), salt_percent: n(r.salt_percent), honey_percent: n(r.honey_percent), oil_percent: n(r.oil_percent),
        yeast_percent: n(r.yeast_percent), biga_yeast_percent: n(r.biga_yeast_percent) || 0.5, biga_percent: n(r.biga_percent) || 50, biga_hydration: n(r.biga_hydration) || 45,
        biga_flour: r.biga_flour ?? null, water_start_pct: r.water_start_pct == null ? 80 : n(r.water_start_pct), loss_margin_pct: n(r.loss_margin_pct), mixer_max_balls: n(r.mixer_max_balls),
      },
      flourMix: Array.isArray(mix) && mix.length ? mix : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Calcul impossible" }, { status: 400 });
  }

  const data: EtiquettesData = { nom: String(r.name ?? "").trim(), date, resultat, etablissement: etabRow?.nom ?? null };
  const el = EtiquettesPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquettes-${date}.pdf"` },
  });
}
