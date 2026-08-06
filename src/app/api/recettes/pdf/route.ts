import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import React from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RecettePDFDoc } from "./RecettePDFDoc";

export const runtime = "nodejs";

/**
 * GET /api/recettes/pdf?id=xxx&portions=N
 * Generates a PDF for a recipe (kitchen_recipe or recipe).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const portions = parseInt(req.nextUrl.searchParams.get("portions") ?? "1") || 1;

  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  // Fetch recipe
  const { data: recipe, error: recErr } = await supabaseAdmin
    .from("kitchen_recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (recErr || !recipe) {
    return NextResponse.json({ error: "Recette introuvable" }, { status: 404 });
  }

  // Fetch lines
  const { data: lines } = await supabaseAdmin
    .from("kitchen_recipe_lines")
    .select("ingredient_id, qty, unit, sort_order, stage")
    .eq("recipe_id", id)
    .order("sort_order");

  // Fetch ingredient names + costs
  const ingIds = (lines ?? []).map(l => l.ingredient_id).filter(Boolean);
  const { data: ingredients } = ingIds.length > 0
    ? await supabaseAdmin.from("ingredients").select("id, name, cost_per_unit, purchase_unit_label").in("id", ingIds)
    : { data: [] };

  const ingMap = new Map((ingredients ?? []).map(i => [i.id, i]));

  // Parse steps from notes (JSON array or null)
  let steps: string[] = [];
  try {
    const parsed = JSON.parse(recipe.notes ?? "null");
    if (Array.isArray(parsed)) steps = parsed;
  } catch { /* notes is plain text */ }

  // Fetch dough recipe if applicable
  let doughName: string | null = null;
  if (recipe.dough_recipe_id) {
    const { data: dough } = await supabaseAdmin
      .from("recipes").select("name").eq("id", recipe.dough_recipe_id).single();
    doughName = dough?.name ?? null;
  }

  // Build PDF data
  const pdfData = {
    name: recipe.name ?? "Recette",
    category: recipe.category ?? "",
    photoUrl: recipe.photo_url ?? null,
    portions,
    ballWeightG: recipe.ball_weight_g ?? null,
    doughName,
    totalCost: recipe.total_cost ?? null,
    sellPrice: recipe.sell_price ?? null,
    vatRate: recipe.vat_rate ?? 0.10,
    marginRate: recipe.margin_rate ?? 0,
    lines: (lines ?? []).map(l => {
      const ing = ingMap.get(l.ingredient_id);
      return {
        name: ing?.name ?? "?",
        qty: (l.qty ?? 0) * portions,
        unit: l.unit ?? "g",
        stage: l.stage ?? "pre",
        cost: ing?.cost_per_unit ? (ing.cost_per_unit * (l.qty ?? 0) * portions) : null,
      };
    }),
    steps,
    notes: !steps.length ? (recipe.notes ?? null) : null,
  };

  // Compute totals
  const totalWeightG = pdfData.lines.reduce((acc, l) => {
    const u = l.unit.toLowerCase();
    if (u === "g") return acc + l.qty;
    if (u === "kg") return acc + l.qty * 1000;
    return acc;
  }, 0) + (pdfData.ballWeightG ? pdfData.ballWeightG * portions : 0);

  const totalCost = pdfData.totalCost ? pdfData.totalCost * portions : pdfData.lines.reduce((s, l) => s + (l.cost ?? 0), 0);

  const el = RecettePDFDoc({ ...pdfData, totalWeightG, totalCost }) as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);

  const filename = `fiche-${pdfData.name.replace(/[^a-zA-Z0-9]/g, "_")}${portions > 1 ? `-x${portions}` : ""}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
