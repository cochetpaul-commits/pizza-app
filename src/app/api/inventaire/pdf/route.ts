import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { InventairePdfDocument, type InventairePdfData } from "./InventairePdfDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAT_LABELS: Record<string, string> = {
  cremerie_fromage: "Cremerie / Fromage", charcuterie_viande: "Charcuterie / Viande",
  maree: "Maree", vins: "Vins", spiritueux: "Spiritueux", biere: "Biere",
  soft: "Softs", cafeteria: "Cafeteria", liqueurs: "Liqueurs", sirops: "Sirops",
  legumes_herbes: "Legumes / Herbes", fruit: "Fruits",
  epicerie_salee: "Epicerie Salee", epicerie_sucree: "Epicerie Sucree",
  preparation: "Preparation", sauce: "Sauce", antipasti: "Antipasti",
  emballage: "Emballage", autre: "Autre",
};

export async function GET(req: NextRequest) {
  const invId = req.nextUrl.searchParams.get("id");
  if (!invId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = supabaseAdmin;

  // Fetch inventory + lines + ingredients
  const [{ data: inv }, { data: lignes }] = await Promise.all([
    supabase.from("inventaires").select("id, date, statut, total_valeur, notes, etablissement_id").eq("id", invId).single(),
    supabase.from("inventaire_lignes").select("ingredient_id, quantite, unite, cout_unitaire").eq("inventaire_id", invId),
  ]);

  if (!inv) return NextResponse.json({ error: "Inventaire non trouve" }, { status: 404 });

  // Fetch establishment name
  const { data: etab } = await supabase.from("etablissements").select("nom").eq("id", inv.etablissement_id).single();

  // Fetch all ingredients for this establishment
  const { data: ings } = await supabase.from("ingredients").select("id, name, category, default_unit, cost_per_unit, storage_zone")
    .eq("etablissement_id", inv.etablissement_id).eq("is_active", true);

  const ingMap = new Map((ings ?? []).map(i => [i.id, i]));
  const qtyMap = new Map((lignes ?? []).map(l => [l.ingredient_id, { qty: l.quantite, unit: l.unite, cpu: l.cout_unitaire }]));

  // Group by zone then category
  type Line = { name: string; qty: number; unit: string; value: number };
  type CatGroup = { cat: string; label: string; lines: Line[]; value: number };
  type ZoneGroup = { zone: string; categories: CatGroup[]; value: number };

  const zoneMap = new Map<string, Map<string, Line[]>>();

  for (const [ingId, q] of qtyMap) {
    if (q.qty <= 0) continue;
    const ing = ingMap.get(ingId);
    if (!ing) continue;
    const zone = ing.storage_zone || "Sans zone";
    const cat = ing.category || "autre";
    if (!zoneMap.has(zone)) zoneMap.set(zone, new Map());
    const catMap = zoneMap.get(zone)!;
    if (!catMap.has(cat)) catMap.set(cat, []);
    const cpu = q.cpu ?? ing.cost_per_unit ?? 0;
    catMap.get(cat)!.push({
      name: ing.name,
      qty: q.qty,
      unit: q.unit || ing.default_unit || "pcs",
      value: q.qty * cpu,
    });
  }

  const zones: ZoneGroup[] = [];
  for (const [zone, catMap] of zoneMap) {
    const categories: CatGroup[] = [];
    for (const [cat, lines] of catMap) {
      lines.sort((a, b) => a.name.localeCompare(b.name));
      categories.push({
        cat,
        label: CAT_LABELS[cat] ?? cat,
        lines,
        value: lines.reduce((s, l) => s + l.value, 0),
      });
    }
    categories.sort((a, b) => a.label.localeCompare(b.label));
    zones.push({
      zone,
      categories,
      value: categories.reduce((s, c) => s + c.value, 0),
    });
  }
  zones.sort((a, b) => a.zone.localeCompare(b.zone));

  const pdfData: InventairePdfData = {
    etabNom: etab?.nom ?? "",
    date: inv.date,
    totalValeur: inv.total_valeur ?? zones.reduce((s, z) => s + z.value, 0),
    zones,
  };

  const el = InventairePdfDocument(pdfData) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);
  const dateStr = inv.date.replace(/-/g, "");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="inventaire-${dateStr}.pdf"`,
    },
  });
}
