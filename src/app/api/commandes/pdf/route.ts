import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { CommandePdfDocument, type CommandePdfData, type CommandePdfCategory } from "@/lib/commandePdf";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT_ORDER = [
  "cremerie_fromage", "charcuterie_viande", "maree",
  "legumes_herbes", "fruit", "epicerie_salee", "epicerie_sucree",
  "alcool_spiritueux", "boisson", "preparation", "sauce",
  "antipasti", "emballage", "autre",
];

const CAT_LABELS: Record<string, string> = {
  cremerie_fromage: "CRÉMERIE / FROMAGE",
  charcuterie_viande: "CHARCUTERIE / VIANDE",
  maree: "MARÉE",
  alcool_spiritueux: "ALCOOL / SPIRITUEUX",
  boisson: "BOISSONS",
  legumes_herbes: "LÉGUMES / HERBES",
  fruit: "FRUITS",
  epicerie_salee: "ÉPICERIE SALÉE",
  epicerie_sucree: "ÉPICERIE SUCRÉE",
  preparation: "PRÉPARATION",
  sauce: "SAUCE",
  antipasti: "ANTIPASTI",
  emballage: "EMBALLAGE",
  autre: "AUTRE",
};

const CAT_COLORS: Record<string, string> = {
  cremerie_fromage: "#D97706",
  charcuterie_viande: "#DC2626",
  maree: "#0284C7",
  alcool_spiritueux: "#7C3AED",
  boisson: "#0D9488",
  legumes_herbes: "#16A34A",
  fruit: "#EA580C",
  epicerie_salee: "#1E40AF",
  epicerie_sucree: "#92400E",
  preparation: "#C026D3",
  sauce: "#9D174D",
  antipasti: "#CA8A04",
  emballage: "#78716C",
  autre: "#6B7280",
};

function readLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

type LigneRow = {
  quantite: number;
  unite: string | null;
  ingredients: { name: string; category: string | null; default_unit: string | null } | null;
};

function getIng(row: LigneRow): { name: string; category: string | null; default_unit: string | null } | null {
  const raw = row.ingredients;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  // Fetch session with supplier name, filtered by etablissement
  const { data: session } = await supabaseAdmin
    .from("commande_sessions")
    .select("*, suppliers(name)")
    .eq("id", sessionId)
    .eq("etablissement_id", etabId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "session introuvable" }, { status: 404 });
  }

  // Fetch lines with qty > 0
  const { data: lignes } = await supabaseAdmin
    .from("commande_lignes")
    .select("quantite, unite, ingredients(name, category, default_unit)")
    .eq("session_id", sessionId)
    .gt("quantite", 0);

  const rows = (lignes ?? []) as unknown as LigneRow[];

  // Group by category
  const byCat: Record<string, { name: string; qty: number; unit: string }[]> = {};
  for (const l of rows) {
    const ing = getIng(l);
    const cat = ing?.category ?? "autre";
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push({
      name: ing?.name ?? "?",
      qty: l.quantite,
      unit: l.unite ?? ing?.default_unit ?? "",
    });
  }

  // Sort categories and items
  const categories: CommandePdfCategory[] = CAT_ORDER
    .filter((c) => byCat[c]?.length)
    .map((c) => ({
      label: CAT_LABELS[c] ?? c.toUpperCase(),
      color: CAT_COLORS[c] ?? "#6B7280",
      items: byCat[c].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }));

  const supplierObj = session.suppliers as { name: string } | null;

  const data: CommandePdfData = {
    supplierName: supplierObj?.name ?? "—",
    sessionDate: new Date(session.created_at).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    }),
    categories,
    totalArticles: rows.length,
    notes: session.notes,
    logoBase64: readLogoBase64(),
    exportedAt: new Date().toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    }),
  };

  const docElement = CommandePdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(docElement);

  const supplierSlug = (supplierObj?.name ?? "commande").toLowerCase().replace(/[^a-z0-9]/g, "-");
  const dateSlug = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="commande-${supplierSlug}-${dateSlug}.pdf"`,
    },
  });
}
