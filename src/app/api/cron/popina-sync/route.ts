import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { createClient } from "@supabase/supabase-js";
import { fetchAllOrdersForDay, getParisDate } from "@/lib/popinaClient";
import { ordersToVentesLignes } from "@/lib/popina/mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ETAB_BELLO = "93dddd48-21f5-44e9-83aa-024af53bce83";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * Cron Vercel horaire — synchronise J et J-1 depuis l'API Popina vers ventes_lignes.
 *
 * Param ?day=YYYY-MM-DD pour resynchroniser un jour précis (manuel).
 * Param ?days=N pour resynchroniser les N derniers jours (manuel, max 14).
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const explicitDay = url.searchParams.get("day");
  const nDays = Math.min(parseInt(url.searchParams.get("days") ?? "1", 10) || 1, 14);
  const triggeredBy = url.searchParams.get("manual") ? "manual" : "cron";

  // Cron horaire : J (journée en cours, pour que Produits / Rentabilité /
  // Mon tableau reflètent le jour même) + J-1 (clôture de la veille).
  // ?days=N manuel → les N derniers jours à partir de J-1, comme avant.
  const manualDays = url.searchParams.has("days");
  const targetDays = explicitDay
    ? [explicitDay]
    : manualDays
      ? Array.from({ length: nDays }, (_, i) => getParisDate(-1 - i))
      : [getParisDate(0), getParisDate(-1)];

  // Récupère les jours de fermeture de l'établissement
  const { data: etab } = await supabase
    .from("etablissements")
    .select("jours_fermeture")
    .eq("id", ETAB_BELLO)
    .maybeSingle();
  const joursFermeture = new Set<number>((etab?.jours_fermeture as number[] | null) ?? []);

  const results = [];
  for (const day of targetDays) {
    // Sur le cron quotidien, skip les jours de fermeture (pas de log, rien à faire).
    // Pour un appel manuel, on tente quand même (admin peut vouloir vérifier).
    if (triggeredBy === "cron") {
      const dow = new Date(day + "T12:00:00Z").getUTCDay();
      if (joursFermeture.has(dow)) {
        results.push({ day, status: "skipped_closed" });
        continue;
      }
    }
    results.push(await syncDay(apiKey, day, triggeredBy));
  }

  return NextResponse.json({ ok: true, results });
}

async function syncDay(apiKey: string, day: string, triggeredBy: string) {
  const t0 = Date.now();
  try {
    const { reports, orders } = await fetchAllOrdersForDay(apiKey, day);

    if (reports.length === 0) {
      await logSync({ day, status: "empty", nbLignes: 0, nbOrders: 0, duration: Date.now() - t0, triggeredBy });
      return { day, status: "empty", nbLignes: 0 };
    }

    const rows = ordersToVentesLignes(orders, ETAB_BELLO, day, `popina_api_${day}`);

    // Idempotent : delete-then-insert sur import_file LIKE 'popina_api_%'
    const { error: delErr } = await supabase
      .from("ventes_lignes")
      .delete()
      .eq("etablissement_id", ETAB_BELLO)
      .eq("date_service", day)
      .like("import_file", "popina_api_%");
    if (delErr) throw delErr;

    for (let i = 0; i < rows.length; i += 500) {
      const { error: insErr } = await supabase
        .from("ventes_lignes")
        .insert(rows.slice(i, i + 500));
      if (insErr) throw insErr;
    }

    await logSync({ day, status: "ok", nbLignes: rows.length, nbOrders: orders.length, duration: Date.now() - t0, triggeredBy });
    return { day, status: "ok", nbLignes: rows.length, nbOrders: orders.length };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await logSync({ day, status: "error", nbLignes: 0, nbOrders: 0, duration: Date.now() - t0, triggeredBy, errorMsg: msg });
    return { day, status: "error", error: msg };
  }
}

async function logSync(args: {
  day: string;
  status: "ok" | "empty" | "error";
  nbLignes: number;
  nbOrders: number;
  duration: number;
  triggeredBy: string;
  errorMsg?: string;
}) {
  await supabase.from("popina_sync_log").insert({
    etablissement_id: ETAB_BELLO,
    date_service: args.day,
    status: args.status,
    nb_lignes: args.nbLignes,
    nb_orders: args.nbOrders,
    duration_ms: args.duration,
    error_msg: args.errorMsg ?? null,
    triggered_by: args.triggeredBy,
  });
}
