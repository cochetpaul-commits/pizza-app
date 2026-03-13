import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { fetchReports } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rh/productivite?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Compare shifts planifies vs CA Popina par jour.
 * Retourne par jour : nb_shifts, heures_planifiees, ca_popina, couverts_popina
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from et to requis" }, { status: 400 });
  }

  // Get etab for popina_location_id
  const { data: etabData } = await supabaseAdmin
    .from("etablissements")
    .select("popina_location_id")
    .eq("id", etabId)
    .single();

  // Fetch shifts
  const { data: shifts } = await supabaseAdmin
    .from("shifts")
    .select("date, heure_debut, heure_fin, pause_minutes")
    .eq("etablissement_id", etabId)
    .gte("date", from)
    .lte("date", to);

  // Group shifts by date
  const shiftsByDate = new Map<string, { count: number; hours: number }>();
  for (const s of shifts ?? []) {
    const existing = shiftsByDate.get(s.date) ?? { count: 0, hours: 0 };
    const [hd, md] = s.heure_debut.split(":").map(Number);
    const [hf, mf] = s.heure_fin.split(":").map(Number);
    let dur = (hf * 60 + mf) - (hd * 60 + md);
    if (dur < 0) dur += 1440;
    dur -= s.pause_minutes ?? 0;
    existing.count++;
    existing.hours += Math.max(0, dur / 60);
    shiftsByDate.set(s.date, existing);
  }

  // Fetch Popina reports
  const apiKey = process.env.POPINA_API_KEY;
  const popinaByDate = new Map<string, { ca: number; couverts: number }>();

  if (apiKey && etabData?.popina_location_id) {
    const reports = await fetchReports(apiKey, from, to, etabData.popina_location_id);
    for (const r of reports) {
      const date = r.startedAt?.slice(0, 10);
      if (!date) continue;
      const existing = popinaByDate.get(date) ?? { ca: 0, couverts: 0 };
      existing.ca += (r.totalSales ?? 0) / 100;
      existing.couverts += r.guestsNumber ?? 0;
      popinaByDate.set(date, existing);
    }
  }

  // Build daily comparison
  const allDates = new Set([...shiftsByDate.keys(), ...popinaByDate.keys()]);
  const days = Array.from(allDates).sort().map((date) => {
    const s = shiftsByDate.get(date) ?? { count: 0, hours: 0 };
    const p = popinaByDate.get(date) ?? { ca: 0, couverts: 0 };
    return {
      date,
      nb_shifts: s.count,
      heures_planifiees: Math.round(s.hours * 10) / 10,
      ca_popina: Math.round(p.ca),
      couverts_popina: p.couverts,
      ca_par_heure: s.hours > 0 ? Math.round(p.ca / s.hours) : 0,
    };
  });

  return NextResponse.json({ days });
}
