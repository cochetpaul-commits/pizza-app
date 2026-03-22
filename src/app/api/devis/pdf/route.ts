import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { DevisPdfDocument, type DevisPdfData } from "@/lib/devisPdf";
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
    const { devisId } = await req.json();
    if (!devisId) return NextResponse.json({ error: "devisId required" }, { status: 400 });

    const { data: devis, error } = await supabaseAdmin
      .from("devis")
      .select("*,client:clients(nom,prenom,email,telephone)")
      .eq("id", devisId)
      .single();

    if (error || !devis) return NextResponse.json({ error: "Devis not found" }, { status: 404 });

    const { data: lignes } = await supabaseAdmin
      .from("devis_lignes")
      .select("*")
      .eq("devis_id", devisId)
      .order("position");

    // Logo
    let logoBase64: string | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-ifratelli.png");
      const buf = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${buf.toString("base64")}`;
    } catch { /* no logo */ }

    const client = devis.client as { nom: string; prenom: string | null; email: string | null; telephone: string | null } | null;

    const pdfData: DevisPdfData = {
      numero: devis.numero,
      dateEmission: fmtDateFr(devis.date_emission),
      dateValidite: devis.date_validite ? fmtDateFr(devis.date_validite) : null,
      objet: devis.objet,
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
      totalHt: devis.total_ht,
      tvaRate: devis.tva_rate,
      totalTtc: devis.total_ttc,
      acomptePct: devis.acompte_pct,
      conditions: devis.conditions,
      logoBase64,
    };

    const el = DevisPdfDocument(pdfData) as unknown as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(el);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${devis.numero}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
