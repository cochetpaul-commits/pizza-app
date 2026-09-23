import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured, type PlDossier } from "@/lib/pennylane/api";
import { cronOrAdminUnauthorized } from "@/lib/cronAuth";
import { autoImportFactures, autoImportCandidats } from "@/lib/invoices/autoImport";
import { getSupplierInvoices, getSuppliers } from "@/lib/pennylane/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron quotidien — récupération automatique des factures Pennylane pour
 * chaque établissement dont le dossier a une clé API :
 *  - Bello Mio   → SARL SASHA
 *  - Piccola Mia → SARL I FRATELLI
 * ?days=N pour élargir la fenêtre (défaut 30, max 200). 30 jours parce que
 * certaines factures (Mael…) arrivent dans Pennylane bien après leur date ;
 * la déduplication par identifiant Pennylane évite tout doublon.
 * ?creer=0 : pas de création de fiche (lignes inconnues en attente) · ?fournisseurs=a,b · ?etab=bello|piccola
 * ?liste=1 : n'écrit RIEN, renvoie seulement les factures qui seraient traitées
 * (pour valider un rattrapage avant de le lancer).
 */
export async function GET(req: NextRequest) {
  // Cron (secret) ou administrateur depuis le bouton « Récupérer maintenant »
  const denied = await cronOrAdminUnauthorized(req);
  if (denied) return denied;

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30, 1), 200);
  const listeSeule = req.nextUrl.searchParams.get("liste") === "1";
  // Rattrapage : ?creer=0 (aucune fiche créée, lignes inconnues en attente) · ?fournisseurs=mael,metro · ?etab=bello|piccola
  const creerFiches = req.nextUrl.searchParams.get("creer") !== "0";
  const prix = req.nextUrl.searchParams.get("prix") !== "0"; // ?prix=0 : facture et lignes seulement, aucun prix écrit
  const fournisseurs = (req.nextUrl.searchParams.get("fournisseurs") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const numeros = (req.nextUrl.searchParams.get("numeros") ?? "").split(",").map((x) => x.trim()).filter(Boolean); // ?numeros=FA1,FA2 : seulement ces factures
  const archivees = req.nextUrl.searchParams.get("archivees") === "1"; // ?archivees=1 : pièces archivées comprises (hors doublons)
  // Diagnostic : ?brut=1&filtre=armor → pièces Pennylane brutes (toutes, archivées comprises) dont le fournisseur ou le libellé contient le filtre
  const brut = req.nextUrl.searchParams.get("brut") === "1";
  const filtre = (req.nextUrl.searchParams.get("filtre") ?? "").toLowerCase();
  const etabFiltre = (req.nextUrl.searchParams.get("etab") ?? "").toLowerCase();
  const limit = Math.max(0, parseInt(req.nextUrl.searchParams.get("limit") ?? "0", 10) || 0) || undefined;

  const { data: etabs } = await supabaseAdmin
    .from("etablissements").select("id, slug, nom").eq("actif", true);

  const out: Record<string, unknown> = {};
  for (const etab of etabs ?? []) {
    const dossier: PlDossier = ((etab.slug as string) ?? "").includes("bello") ? "bello" : "piccola";
    if (!pennylaneConfigured(dossier)) continue;
    if (etabFiltre && !((etab.slug as string) ?? "").includes(etabFiltre)) continue;
    try {
      if (brut) {
        const from = new Date(); from.setDate(from.getDate() - days);
        const [inv, sups] = await Promise.all([getSupplierInvoices(from.toISOString().slice(0, 10), new Date().toISOString().slice(0, 10), dossier, { archivees: true }), getSuppliers(dossier)]);
        const nom = new Map(sups.map((s) => [s.id, s.name]));
        const rows = inv.map((i) => ({ id: i.id, numero: i.invoice_number ?? null, date: i.date ?? null, ttc: Number(i.currency_amount ?? 0) || 0, fournisseur: i.supplier?.id ? (nom.get(i.supplier.id) ?? String(i.supplier.id)) : null, archivee: !!i.archived_at, fichier: !!i.public_file_url, libelle: i.label ?? null }))
          .filter((r) => !filtre || `${r.fournisseur ?? ""} ${r.libelle ?? ""}`.toLowerCase().includes(filtre));
        out[(etab.nom as string) ?? (etab.slug as string)] = { total_periode: inv.length, pieces: rows };
        continue;
      }
      out[(etab.nom as string) ?? (etab.slug as string)] = listeSeule
        ? await autoImportCandidats(days, dossier, { archivees })
        : await autoImportFactures(etab.id as string, days, dossier, { creerFiches, fournisseurs, limit, prix, numeros, archivees });
    } catch (e) {
      out[(etab.nom as string) ?? (etab.slug as string)] = { erreur: e instanceof Error ? e.message : "erreur" };
    }
  }
  if (Object.keys(out).length === 0) {
    return NextResponse.json({ error: "Aucune clé Pennylane configurée" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...out });
}
