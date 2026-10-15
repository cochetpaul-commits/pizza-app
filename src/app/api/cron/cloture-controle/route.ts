import { NextRequest, NextResponse } from "next/server";
import { cronOrAdminUnauthorized } from "@/lib/cronAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllOrdersForDay, fetchReports, reportsForParisDay } from "@/lib/popinaClient";
import { controlerNuit, type PaiementPopina, type RapportPopina } from "@/lib/controleNuit";
import type { SaisieCloture } from "@/lib/cloture";
import type { TransactionFlatpay } from "@/lib/flatpay";
import { notifyGroupAdmins } from "@/lib/pushNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La caisse Popina (location) est celle de Bello Mio */
const ETAB_BELLO = "93dddd48-21f5-44e9-83aa-024af53bce83";
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

const decaler = (jour: string, n: number) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Contrôle de la nuit de la clôture de caisse (16/10/2026).
 * Cron vers 1 h (heure de Paris) puis seconde passe au matin (?passe=matin : seulement si le Z n'était pas
 * encore publié) ; un administrateur peut le relancer depuis l'écran Clôture (?jour=AAAA-MM-JJ).
 * Lit le Z Popina du soir, le compare à la clôture saisie dans l'app, et range le résultat dans clotures.controle.
 */
export async function GET(req: NextRequest) {
  const refus = await cronOrAdminUnauthorized(req);
  if (refus) return refus;
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });

  const p = req.nextUrl.searchParams;
  // Jour de service : à 1 h ou à 8 h du matin, c'est la veille (heure de Paris moins 10 h)
  const jour = p.get("jour") && JOUR.test(p.get("jour")!) ? p.get("jour")! : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(Date.now() - 10 * 3600e3));

  const { data: cloture } = await supabaseAdmin.from("clotures").select("id, saisie, corrections, controle").eq("etablissement_id", ETAB_BELLO).eq("jour", jour).maybeSingle();
  if (p.get("passe") === "matin" && cloture?.controle && (cloture.controle as { niveau?: string }).niveau !== "absent") {
    return NextResponse.json({ jour, deja: true });
  }

  try {
    const tous = await fetchReports(apiKey, decaler(jour, -1), decaler(jour, 1));
    const rapports = reportsForParisDay(tous, jour) as unknown as RapportPopina[];

    // Paiement par paiement seulement si l'export Flatpay du jour a été déposé
    const { data: tx } = await supabaseAdmin.from("flatpay_transactions")
      .select("horodatage, jour, mode, type_carte, montant_centimes, statut, operation, terminal, emetteur, source")
      .eq("etablissement_id", ETAB_BELLO).eq("jour", jour);
    const tpe: TransactionFlatpay[] = (tx ?? []).map((t) => ({
      horodatage: t.horodatage as string, jour: t.jour as string, mode: t.mode as TransactionFlatpay["mode"], typeCarte: (t.type_carte as string) ?? "",
      montant: (t.montant_centimes as number) / 100, statut: (t.statut as string) ?? "", operation: (t.operation as string) ?? "",
      terminal: (t.terminal as string | null) ?? null, emetteur: (t.emetteur as string | null) ?? null, source: t.source as TransactionFlatpay["source"],
    }));
    let paiementsPopina: PaiementPopina[] | undefined;
    if (rapports.length && tpe.some((t) => t.mode !== "conecs")) {
      const { orders } = await fetchAllOrdersForDay(apiKey, jour);
      paiementsPopina = orders.filter((o) => !o.isCanceled).flatMap((o) => (o.payments ?? []).flatMap((pm): PaiementPopina[] => {
        const nom = pm.paymentName.toLowerCase();
        const mode = /american|amex/.test(nom) ? "amex" : /carte de cr[ée]dit/.test(nom) ? "cb" : null;
        return mode && pm.paymentAmount > 0 ? [{ montant: pm.paymentAmount / 100, mode, heure: o.closedAt ?? null, table: o.orderPlace ?? null }] : [];
      }));
    }

    const controle = controlerNuit({
      saisie: (cloture?.saisie as SaisieCloture | null) ?? null,
      corrections: Array.isArray(cloture?.corrections) ? (cloture!.corrections as string[]) : [],
      rapports, tpe, paiementsPopina,
    });
    const maintenant = new Date().toISOString();
    if (cloture) await supabaseAdmin.from("clotures").update({ controle, controle_at: maintenant }).eq("id", cloture.id);
    else if (controle.niveau !== "absent") await supabaseAdmin.from("clotures").insert({ etablissement_id: ETAB_BELLO, jour, controle, controle_at: maintenant });

    if (controle.niveau === "ecart" || controle.niveau === "sans_saisie") {
      void notifyGroupAdmins({ title: `Clôture du ${new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR")}`, body: controle.titre, url: "/cloture" });
    }
    return NextResponse.json({ jour, niveau: controle.niveau, titre: controle.titre, controle });
  } catch (e) {
    return NextResponse.json({ jour, error: e instanceof Error ? e.message : "contrôle impossible" }, { status: 502 });
  }
}
