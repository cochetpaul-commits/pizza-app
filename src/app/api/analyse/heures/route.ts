import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied } from "@/lib/getEtablissement";
import { COMBO_LOCATIONS, getPlannings, type ComboShift } from "@/lib/combo/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analyse/heures?etablissement_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD   (10/10/2026)
 *
 * Heures planifiées par jour et par équipe, lues dans Combo (le planning n'est pas tenu dans
 * l'application ; combo_presences n'a que des totaux par semaine). Sert à la page CA / personne.
 * Au plus 95 jours ; mémoire de 10 minutes par établissement et période.
 */
export type HeuresJour = { date: string; heures: number; shifts: number; par_equipe: Record<string, number>; personnes: number };
const cache = new Map<string, { quand: number; jours: HeuresJour[] }>();
const DUREE_CACHE = 10 * 60 * 1000;
const jourParis = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!etabId || !from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 95) return NextResponse.json({ error: "95 jours au plus" }, { status: 400 });
  const denied = await etabAccessDenied(req, etabId, ["group_admin", "manager"]);
  if (denied) return denied;

  const { data: etab } = await supabaseAdmin.from("etablissements").select("slug").eq("id", etabId).maybeSingle();
  const slug = (etab?.slug as string | undefined) ?? "";
  const locationId = slug.includes("piccola") ? COMBO_LOCATIONS.piccola : COMBO_LOCATIONS.bello_mio;
  const cle = `${locationId}:${from}:${to}`;
  const enMemoire = cache.get(cle);
  if (enMemoire && Date.now() - enMemoire.quand < DUREE_CACHE) return NextResponse.json({ jours: enMemoire.jours, source: "combo", cache: true });

  let plannings: ComboShift[];
  try {
    plannings = await getPlannings(locationId, from, to);
  } catch (e) {
    return NextResponse.json({ error: `Combo indisponible : ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
  const parJour = new Map<string, HeuresJour & { noms: Set<string> }>();
  for (const p of plannings) {
    const date = jourParis(p.starts_at);
    if (date < from || date > to) continue;
    const minutes = Math.max(0, (new Date(p.ends_at).getTime() - new Date(p.starts_at).getTime()) / 60000 - (p.break_duration ?? 0));
    const h = minutes / 60;
    const equipe = p.team_name?.trim() || "Autre";
    let j = parJour.get(date);
    if (!j) { j = { date, heures: 0, shifts: 0, par_equipe: {}, personnes: 0, noms: new Set() }; parJour.set(date, j); }
    j.heures += h; j.shifts += 1; j.par_equipe[equipe] = (j.par_equipe[equipe] ?? 0) + h; j.noms.add(`${p.firstname} ${p.lastname}`.toLowerCase());
  }
  const jours: HeuresJour[] = [...parJour.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map((j) => ({ date: j.date, heures: Math.round(j.heures * 100) / 100, shifts: j.shifts, par_equipe: Object.fromEntries(Object.entries(j.par_equipe).map(([k, v]) => [k, Math.round(v * 100) / 100])), personnes: j.noms.size }));
  cache.set(cle, { quand: Date.now(), jours });
  return NextResponse.json({ jours, source: "combo" });
}
