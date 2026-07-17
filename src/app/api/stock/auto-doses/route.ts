import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/stock/auto-doses
 * Returns suggested doses for linked popina products that don't have a dose_map entry yet.
 *
 * POST /api/stock/auto-doses
 * Applies suggested doses (inserts into popina_dose_map).
 * Body: { entries: [{ popina_product_id, ingredient_id, dose, dose_unit }] }
 */

type Suggestion = {
  popina_product_id: string;
  popina_name: string;
  popina_category: string;
  ingredient_id: string;
  ingredient_name: string;
  suggested_dose: number;
  suggested_unit: string;
  rule: string;
};

function inferDose(name: string, category: string): { dose: number; unit: string; rule: string } | null {
  const n = name.trim().toLowerCase();

  // Explicit cl in name
  const clMatch = n.match(/(\d+[.,]?\d*)\s*cl/);
  if (clMatch) return { dose: parseFloat(clMatch[1].replace(",", ".")), unit: "cl", rule: `${clMatch[1]}cl dans le nom` };

  // Explicit ml
  const mlMatch = n.match(/(\d+)\s*ml/);
  if (mlMatch) return { dose: parseFloat(mlMatch[1]) / 10, unit: "cl", rule: `${mlMatch[1]}ml → cl` };

  // Magnum
  if (n.includes("magnum")) return { dose: 150, unit: "cl", rule: "Magnum = 150cl" };

  // Bouteille / Btl
  if (n.startsWith("btl") || n.includes("bouteille")) return { dose: 75, unit: "cl", rule: "Bouteille = 75cl" };

  // Carafe
  if (n.includes("carafe")) return { dose: 50, unit: "cl", rule: "Carafe = 50cl" };

  // Verre
  if (n.includes("verre")) return { dose: 12.5, unit: "cl", rule: "Verre = 12.5cl" };

  // Pinte
  if (n.includes("pinte")) return { dose: 50, unit: "cl", rule: "Pinte = 50cl" };

  // Demi
  if (n.includes("demi") && !n.includes("deca")) return { dose: 25, unit: "cl", rule: "Demi = 25cl" };

  // By category — default doses for spirits/liqueurs
  if (category === "DIGESTIVI") return { dose: 4, unit: "cl", rule: "Digestif = 4cl (dose standard)" };
  if (category === "ALCOOL" && (n.includes("birra") || n.includes("moretti"))) return { dose: 33, unit: "cl", rule: "Bière = 33cl" };
  if (category === "ALCOOL" && !n.includes("birra")) return { dose: 4, unit: "cl", rule: "Alcool = 4cl (dose bar)" };
  if (category === "BEVANDE CALDE") return { dose: 1, unit: "pcs", rule: "Boisson chaude = 1 pcs" };
  if (category === "BEVANDE") {
    // Soft/juice default
    if (n.includes("cola") || n.includes("mole")) return { dose: 33, unit: "cl", rule: "Cola = 33cl" };
    if (n.includes("limonade")) return { dose: 25, unit: "cl", rule: "Limonade = 25cl (verre)" };
    return { dose: 1, unit: "pcs", rule: "Boisson = 1 pcs" };
  }
  if (category === "VINI") return { dose: 75, unit: "cl", rule: "Vin = 75cl (bouteille)" };

  return null;
}

export async function GET() {
  // Get linked products without dose_map
  const { data: linked } = await supabaseAdmin
    .from("popina_products")
    .select("id, name, category, ingredient_id")
    .eq("active", true)
    .not("ingredient_id", "is", null);

  const { data: existingDoses } = await supabaseAdmin
    .from("popina_dose_map")
    .select("popina_product_id");

  const existingSet = new Set((existingDoses ?? []).map((d) => d.popina_product_id));

  // Get ingredient names
  const ingIds = [...new Set((linked ?? []).map((l) => l.ingredient_id).filter(Boolean))];
  const { data: ingredients } = await supabaseAdmin
    .from("ingredients")
    .select("id, name")
    .in("id", ingIds.length > 0 ? ingIds : ["__none__"]);

  const ingMap = new Map((ingredients ?? []).map((i) => [i.id, i.name]));

  const suggestions: Suggestion[] = [];

  for (const p of linked ?? []) {
    if (existingSet.has(p.id)) continue;
    if (!p.ingredient_id) continue;

    const inferred = inferDose(p.name, p.category);
    if (!inferred) continue;

    suggestions.push({
      popina_product_id: p.id,
      popina_name: p.name,
      popina_category: p.category,
      ingredient_id: p.ingredient_id,
      ingredient_name: ingMap.get(p.ingredient_id) ?? "?",
      suggested_dose: inferred.dose,
      suggested_unit: inferred.unit,
      rule: inferred.rule,
    });
  }

  suggestions.sort((a, b) => a.popina_category.localeCompare(b.popina_category) || a.popina_name.localeCompare(b.popina_name));

  return NextResponse.json(suggestions);
}

export async function POST(req: NextRequest) {
  const { entries } = await req.json() as {
    entries: { popina_product_id: string; ingredient_id: string; dose: number; dose_unit: string }[];
  };

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "entries requis" }, { status: 400 });
  }

  const rows = entries.map((e) => ({
    popina_product_id: e.popina_product_id,
    ingredient_id: e.ingredient_id,
    dose: e.dose,
    dose_unit: e.dose_unit,
  }));

  const { error } = await supabaseAdmin
    .from("popina_dose_map")
    .upsert(rows, { onConflict: "popina_product_id,ingredient_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, inserted: rows.length });
}
