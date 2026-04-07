import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";
import { VentesPDF } from "./VentesPDFDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stats, prev, mode, viewTab, rangeLabel, etabName, briefing, exportType } = body;

    if (!stats) {
      return NextResponse.json({ error: "stats manquant" }, { status: 400 });
    }

    const type: "ventes" | "produits" | "complet" =
      exportType === "produits" || exportType === "complet" ? exportType : "ventes";

    const el = VentesPDF({ stats, prev, mode, viewTab, rangeLabel, etabName, briefing, exportType: type }) as unknown as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(el);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-${type}-${rangeLabel.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
