import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { etabAccessDenied } from "@/lib/getEtablissement";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InventairePdfDocument, type InventairePdfData } from "./InventairePdfDoc";
import { valoriserInventaire } from "@/lib/inventaireValoServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Raison sociale par établissement (en-tête de l'export comptable) */
const RAISON_SOCIALE: Record<string, string> = { bello_mio: "SARL SASHA", piccola: "SARL I FRATELLI" };

/**
 * GET /api/inventaire/pdf?id=… — export comptable de l'inventaire : valorisation HT au dernier prix connu
 * (coûts figés à la clôture), par zone dans l'ordre de la feuille, puis récapitulatif par famille et par
 * catégorie, et annexe des lignes sans prix ou sur fiche désactivée / supprimée. Admins et managers de l'établissement.
 */
export async function GET(req: NextRequest) {
  const invId = req.nextUrl.searchParams.get("id");
  if (!invId) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const { data: inv } = await supabaseAdmin.from("inventaires")
    .select("id, date, statut, type, saisie, total_valeur, notes, etablissement_id, cloture_at, created_at")
    .eq("id", invId).maybeSingle();
  if (!inv) return NextResponse.json({ error: "Inventaire introuvable" }, { status: 404 });
  const refus = await etabAccessDenied(req, inv.etablissement_id as string, ["group_admin", "manager"]);
  if (refus) return refus;

  const [{ data: etab }, valo] = await Promise.all([
    supabaseAdmin.from("etablissements").select("nom, slug, adresse, siret").eq("id", inv.etablissement_id).maybeSingle(),
    valoriserInventaire(invId, inv.etablissement_id as string),
  ]);

  const pdfData: InventairePdfData = {
    etabNom: (etab?.nom as string | undefined) ?? "",
    raisonSociale: RAISON_SOCIALE[(etab?.slug as string | undefined) ?? ""] ?? "",
    adresse: (etab?.adresse as string | null | undefined) ?? null,
    siret: (etab?.siret as string | null | undefined) ?? null,
    date: inv.date as string,
    type: inv.type === "fin_exercice" ? "Inventaire de fin d'exercice" : "Inventaire mensuel",
    statut: inv.statut === "cloture" ? "Clôturé" : "En cours (valorisation provisoire)",
    clotureAt: (inv.cloture_at as string | null) ?? null,
    genereLe: new Date().toISOString(),
    total: valo.total,
    nbComptees: valo.nb_comptees, nbNonComptees: valo.nb_non_comptees, nbSansPrix: valo.nb_sans_prix,
    parZone: valo.par_zone, parFamille: valo.par_famille, parCategorie: valo.par_categorie,
    lignes: valo.lignes,
  };

  const el = InventairePdfDocument(pdfData) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);
  const dateStr = String(inv.date).replace(/-/g, "");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="inventaire-${(etab?.slug as string | undefined) ?? "etab"}-${dateStr}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
