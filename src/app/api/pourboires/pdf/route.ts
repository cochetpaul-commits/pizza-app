import { NextRequest, NextResponse } from "next/server";
import type React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { PourboiresPdfDocument, type PourboiresPdfData } from "@/lib/pourboiresPdf";
import { GET as donneesPourboires } from "@/app/api/pourboires/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pourboires/pdf?mois=AAAA-MM : les pourboires du mois en PDF pour le cabinet comptable (direction).
 * Mêmes chiffres que la page Pourboires : on relit sa réponse, puis on met en page.
 */
export async function GET(req: NextRequest) {
  let etabId: string;
  try { ({ etabId } = await getEtablissement(req)); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const res = await donneesPourboires(req);
  if (!res) return NextResponse.json({ error: "Pourboires indisponibles" }, { status: 500 });
  const d = await res.json();
  if (!res.ok) return NextResponse.json(d, { status: res.status });
  if (!d.direction) return NextResponse.json({ error: "Réservé à la direction" }, { status: 403 });

  const { data: etab } = await supabaseAdmin.from("etablissements").select("nom, siret, adresse").eq("id", etabId).maybeSingle();
  const mois = String(d.mois);
  const finMois = new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).toISOString().slice(0, 10);
  type L = { nom: string; prenom: string; matricule: string | null; poste: string | null; contrat: string | null; jours: number; part: number; net: number; exclu: unknown; ajustements: { montant: number; motif: string }[] };
  const lignes = ((d.lignes ?? []) as L[])
    .filter((l) => !l.exclu && (l.jours > 0 || Math.abs(l.net) >= 0.005))
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr"))
    .map((l) => ({ nom: l.nom, prenom: l.prenom, matricule: l.matricule, poste: l.poste, contrat: l.contrat, jours: l.jours, part: l.part, net: l.net, ajustements: (l.ajustements ?? []).map((a) => ({ montant: Number(a.montant), motif: String(a.motif ?? "") })) }));
  const data: PourboiresPdfData = {
    etablissement: { nom: String(etab?.nom ?? "Bello Mio"), siret: etab?.siret ?? null, adresse: etab?.adresse ?? null },
    mois, aJour: String(d.a_jour), provisoire: String(d.a_jour) < finMois,
    pot: { carte: d.pot.carte, especes: d.pot.especes, total: d.pot.total, complements: (d.pot.complements ?? []).map((c: { montant: number; motif: string }) => ({ montant: Number(c.montant), motif: String(c.motif ?? "") })) },
    totalJours: d.total_jours, valeurJour: d.valeur_jour, joursOuverture: d.jours_ouverture, soirsCagnotte: d.soirs_cagnotte ?? [],
    lignes,
  };
  const el = PourboiresPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);
  const nomFichier = `pourboires-${mois}-${String(etab?.nom ?? "bello-mio").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomFichier}"` },
  });
}
