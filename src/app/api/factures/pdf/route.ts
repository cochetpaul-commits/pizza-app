import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { FacturePdfDocument, type FacturePdfData } from "@/lib/facturePdf";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDateFr(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export async function POST(req: NextRequest) {
  try {
    const { factureId } = await req.json();
    if (!factureId) return NextResponse.json({ error: "factureId required" }, { status: 400 });

    const { data: facture, error } = await supabaseAdmin
      .from("factures")
      .select("*,client:clients(nom,prenom,email,telephone)")
      .eq("id", factureId)
      .single();

    if (error || !facture) return NextResponse.json({ error: "Facture not found" }, { status: 404 });

    const { data: lignes } = await supabaseAdmin
      .from("facture_lignes")
      .select("*")
      .eq("facture_id", factureId)
      .order("position");

    // Logo
    let logoBase64: string | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-ifratelli.png");
      const buf = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${buf.toString("base64")}`;
    } catch { /* no logo */ }

    const client = facture.client as { nom: string; prenom: string | null; email: string | null; telephone: string | null } | null;

    const pdfData: FacturePdfData = {
      numero: facture.numero,
      dateEmission: fmtDateFr(facture.date_emission),
      dateEcheance: facture.date_echeance ? fmtDateFr(facture.date_echeance) : null,
      objet: facture.objet,
      clientNom: client ? `${client.nom}${client.prenom ? " " + client.prenom : ""}` : "Client inconnu",
      clientEmail: client?.email ?? null,
      clientTel: client?.telephone ?? null,
      lignes: (lignes ?? []).map((l: Record<string, unknown>) => ({
        description: l.description as string,
        quantite: l.quantite as number,
        unite: l.unite as string,
        prixUnitaireHt: l.prix_unitaire_ht as number,
        totalHt: l.total_ht as number,
      })),
      totalHt: facture.total_ht,
      tvaRate: facture.tva_rate,
      totalTtc: facture.total_ttc,
      montantPaye: facture.montant_paye ?? 0,
      conditions: facture.conditions,
      logoBase64,
    };

    const el = FacturePdfDocument(pdfData) as unknown as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(el);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${facture.numero}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
