import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cronOrAdminUnauthorized } from "@/lib/cronAuth";
import { getSuppliers, pennylaneConfigured, type PlDossier } from "@/lib/pennylane/api";
import { canoniserNomFournisseur, estFournisseurInterne } from "@/lib/invoices/rapprochement";
import { facturesPeriode, nomsCorrespondent, pieceExclue } from "@/lib/invoices/autoImport";

export const runtime = "nodejs";
export const maxDuration = 60;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Contrôle hebdomadaire (cron du lundi) : factures Pennylane des 30 derniers jours,
 * fournisseurs de la mercuriale, hors archivées et devis, ABSENTES de l'appli (par n° de facture).
 * Résultat remplacé à chaque passage dans controle_factures_manquantes et affiché dans Lignes en attente.
 * ?days=N pour une autre fenêtre. Ne déclenche aucun import.
 * (Le volet « déposées dans le Drive mais absentes de Pennylane » demande un accès Drive côté serveur : à brancher.)
 */
export async function GET(req: NextRequest) {
  const refus = await cronOrAdminUnauthorized(req);
  if (refus) return refus;
  const days = Math.min(120, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30) || 30));
  const from = new Date(); from.setDate(from.getDate() - days);
  const fromIso = from.toISOString().slice(0, 10), toIso = new Date().toISOString().slice(0, 10);

  const [{ data: etabs }, { data: appSuppliers }] = await Promise.all([
    supabaseAdmin.from("etablissements").select("id, slug, nom").eq("actif", true),
    supabaseAdmin.from("suppliers").select("name").eq("is_active", true),
  ]);
  const mercuriale = (appSuppliers ?? []).filter((s) => !estFournisseurInterne(s.name as string)).map((s) => norm(s.name as string)).filter((n) => n.length >= 3);

  const lignes: Array<Record<string, unknown>> = [];
  const resume: Record<string, unknown> = {};
  for (const etab of etabs ?? []) {
    const dossier: PlDossier = ((etab.slug as string) ?? "").includes("bello") ? "bello" : "piccola";
    if (!pennylaneConfigured(dossier)) continue;
    const sups = await getSuppliers(dossier);
    const inv = await facturesPeriode(fromIso, toIso, dossier, sups, mercuriale);
    const nom = new Map(sups.map((s) => [s.id, s.name]));
    const candidates = inv.filter((i) => !pieceExclue(i) && i.date && !/^\s*DV/i.test(String(i.invoice_number ?? ""))); // ni archivées, ni 0 €
    const numeros = Array.from(new Set(candidates.map((i) => String(i.invoice_number ?? "").trim()).filter(Boolean)));
    const connues = new Set<string>();
    for (let i = 0; i < numeros.length; i += 200) {
      const { data } = await supabaseAdmin.from("supplier_invoices").select("invoice_number").in("invoice_number", numeros.slice(i, i + 200));
      for (const r of data ?? []) connues.add(String(r.invoice_number).trim());
    }
    let manquantes = 0, sansNumero = 0;
    for (const i of candidates) {
      const fournisseur = nom.get(i.supplier?.id ?? -1) ?? String((i as { label?: string }).label ?? "");
      const nf = norm(canoniserNomFournisseur(fournisseur));
      if (!(nf.length >= 3 && mercuriale.some((m) => nomsCorrespondent(nf, m)))) continue;
      const num = String(i.invoice_number ?? "").trim();
      if (!num) { sansNumero++; lignes.push({ etablissement_id: etab.id, dossier, fournisseur, pennylane_id: i.id, invoice_number: null, invoice_date: i.date, montant_ttc: Number(i.currency_amount ?? 0) || null, motif: "sans numéro dans Pennylane" }); continue; }
      if (connues.has(num)) continue;
      manquantes++;
      lignes.push({ etablissement_id: etab.id, dossier, fournisseur, pennylane_id: i.id, invoice_number: num, invoice_date: i.date, montant_ttc: Number(i.currency_amount ?? 0) || null, motif: i.public_file_url ? "absente de l'appli" : "absente de l'appli · sans fichier dans Pennylane" });
    }
    resume[(etab.nom as string) ?? dossier] = { factures_pennylane: candidates.length, manquantes, sans_numero: sansNumero };
  }

  const purge = await supabaseAdmin.from("controle_factures_manquantes").delete().gte("controle_le", "1970-01-01");
  if (purge.error) return NextResponse.json({ error: purge.error.message }, { status: 500 });
  if (lignes.length) {
    const ins = await supabaseAdmin.from("controle_factures_manquantes").insert(lignes);
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, periode: { from: fromIso, to: toIso }, resume, manquantes: lignes });
}
