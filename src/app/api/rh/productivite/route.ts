import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/rh/productivite?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Retourne par jour : nb_shifts, heures_planifiees, ca, couverts
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

  // Fetch shifts
  const { data: shifts } = await supabaseAdmin
    .from("shifts")
    .select("date, heure_debut, heure_fin, pause_minutes")
    .eq("etablissement_id", etabId)
    .gte("date", from)
    .lte("date", to);

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

  // Fetch CA from ventes_lignes (replaces Popina API)
  const { data: ventes } = await supabaseAdmin
    .from("ventes_lignes")
    .select("date_service, ttc, couverts, num_fiscal, type_ligne")
    .eq("etablissement_id", etabId)
    .eq("type_ligne", "Produit")
    .gte("date_service", from)
    .lte("date_service", to);

  const ventesByDate = new Map<string, { ca: number; orders: Set<string>; covTotal: number }>();
  for (const v of ventes ?? []) {
    const date = v.date_service;
    if (!ventesByDate.has(date)) ventesByDate.set(date, { ca: 0, orders: new Set(), covTotal: 0 });
    const d = ventesByDate.get(date)!;
    d.ca += Number(v.ttc) || 0;
    const key = `${date}:${v.num_fiscal}`;
    if (!d.orders.has(key)) {
      d.orders.add(key);
      d.covTotal += Number(v.couverts) || 0;
    }
  }

  const allDates = new Set([...shiftsByDate.keys(), ...ventesByDate.keys()]);
  const days = Array.from(allDates).sort().map((date) => {
    const s = shiftsByDate.get(date) ?? { count: 0, hours: 0 };
    const v = ventesByDate.get(date);
    const ca = v ? Math.round(v.ca) : 0;
    const couverts = v ? (v.covTotal > 0 ? v.covTotal : v.orders.size) : 0;
    return {
      date,
      nb_shifts: s.count,
      heures_planifiees: Math.round(s.hours * 10) / 10,
      ca_popina: ca,
      couverts_popina: couverts,
      ca_par_heure: s.hours > 0 ? Math.round(ca / s.hours) : 0,
    };
  });

  return NextResponse.json({ days });
}
