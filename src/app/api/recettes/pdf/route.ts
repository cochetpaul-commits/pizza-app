import { NextRequest, NextResponse } from "next/server";
import React from "react";
import fs from "fs";
import path from "path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { montantsAutorises } from "@/lib/montantsServeur";
import { KitchenPdfDocument, type KitchenPdfData } from "@/lib/kitchenPdf";
import { photoToBase64 } from "@/lib/photoToBase64";
import { POLE_COLORS } from "@/lib/poleColors";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recettes/pdf?id=…&portions=N | &facteur=F — la fiche technique d'une recette (kitchen_recipes).
 * 24/11/2026 (Paul : « ce n'est pas le modèle du début ») : retour au modèle d'origine, celui de l'en-tête au logo
 * iFratelli Group (lib/kitchenPdf), pour tous les boutons « Imprimer » (Carte, Fiches, éditeur, Produire).
 * Coûts, prix et marges seulement pour les responsables (montantsAutorises).
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
function logo(): string | null {
  try { return `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public", "logo-ifratelli.png")).toString("base64")}`; } catch { return null; }
}
function etapes(v: unknown): string | null {
  if (v == null) return null;
  try { const p = typeof v === "string" ? JSON.parse(v) : v; if (Array.isArray(p)) return JSON.stringify(p.map(String).filter((x) => x.trim())); } catch { /* texte simple */ }
  return typeof v === "string" && v.trim() ? v : null;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  const portions = parseInt(req.nextUrl.searchParams.get("portions") ?? "") || null;
  const facteurParam = parseFloat(req.nextUrl.searchParams.get("facteur") ?? "");

  const { data: r, error } = await supabaseAdmin.from("kitchen_recipes").select("*").eq("id", id).maybeSingle();
  if (error || !r) return NextResponse.json({ error: "Recette introuvable" }, { status: 404 });

  const portionsFiche = Math.max(1, Number(r.portions_count) || Number(r.nb_parts) || 1);
  // « Produire » : facteur sur toute la fiche ; ?portions=N : la fiche ramenée à N portions
  const facteur = Number.isFinite(facteurParam) && facteurParam > 0 ? facteurParam : portions ? portions / portionsFiche : 1;

  const { data: lignes } = await supabaseAdmin.from("kitchen_recipe_lines").select("ingredient_id, qty, unit, sort_order").eq("recipe_id", id).order("sort_order");
  const ids = [...new Set((lignes ?? []).map((l) => l.ingredient_id).filter(Boolean))] as string[];
  const { data: ings } = ids.length
    ? await supabaseAdmin.from("ingredients").select("id, name, allergens, supplier_id, rendement, source, recipe_id, source_prep_recipe_id").in("id", ids)
    : { data: [] as never[] };
  const parIng = new Map((ings ?? []).map((i) => [i.id as string, i]));
  const fournIds = [...new Set((ings ?? []).map((i) => i.supplier_id).filter(Boolean))] as string[];
  const [{ data: fourns }, { data: etab }, montants] = await Promise.all([
    fournIds.length ? supabaseAdmin.from("suppliers").select("id, name").in("id", fournIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    r.etablissement_id ? supabaseAdmin.from("etablissements").select("nom").eq("id", r.etablissement_id).maybeSingle() : Promise.resolve({ data: null }),
    montantsAutorises(req),
  ]);
  const nomFourn = new Map((fourns ?? []).map((f) => [f.id as string, f.name as string]));

  const lignesPdf: KitchenPdfData["lines"] = (lignes ?? []).map((l) => {
    const ing = l.ingredient_id ? parIng.get(l.ingredient_id) : undefined;
    const rendement = Number(ing?.rendement);
    return {
      name: (ing?.name as string | undefined) ?? "—",
      qty: l.qty == null ? null : r2(Number(l.qty) * facteur),
      unit: (l.unit as string | null) ?? "g",
      supplier: ing?.supplier_id ? nomFourn.get(ing.supplier_id as string) ?? null : null,
      rendement: rendement > 0 && rendement <= 1 ? rendement : 1,
      isSubRecipe: !!ing && (ing.source === "recette_maison" || ing.recipe_id != null || ing.source_prep_recipe_id != null),
    };
  });
  // Pizza : le pâton en première ligne
  const estPizza = r.category === "pizza";
  if (estPizza && Number(r.ball_weight_g) > 0) {
    let pate = "Pâton";
    if (r.dough_recipe_id) { const { data: d } = await supabaseAdmin.from("recipes").select("name").eq("id", r.dough_recipe_id).maybeSingle(); if (d?.name) pate = `Pâton · ${d.name}`; }
    lignesPdf.unshift({ name: pate, qty: r2(Number(r.ball_weight_g) * facteur), unit: "g", supplier: null, rendement: 1, isSubRecipe: true });
  }

  const totalRecette = Number(r.total_cost) || 0;
  const coutPortion = r.cost_per_portion != null ? Number(r.cost_per_portion) : totalRecette > 0 ? totalRecette / portionsFiche : null;
  const poids = Number(r.yield_grams) > 0 ? Number(r.yield_grams) * facteur : null;
  const data: KitchenPdfData = {
    recipeName: String(r.name ?? "Recette"),
    category: (r.category as string | null) ?? null,
    costPerKg: montants && totalRecette > 0 && Number(r.yield_grams) > 0 ? r2(totalRecette / (Number(r.yield_grams) / 1000)) : null,
    costPerPortion: montants && coutPortion != null ? r2(coutPortion) : null,
    totalCost: montants && totalRecette > 0 ? r2(totalRecette * facteur) : null,
    portionsCount: Math.round(portionsFiche * facteur * 10) / 10,
    yieldGrams: poids,
    sellPrice: montants && r.sell_price != null ? Number(r.sell_price) : null,
    ref: `FT-${String(r.category ?? "fiche").slice(0, 3).toUpperCase()}-${id.slice(0, 6).toUpperCase()}`,
    establishment: (etab?.nom as string | undefined) ?? null,
    lines: lignesPdf,
    notes: null,
    procedure: etapes(r.procedure) ?? etapes(r.notes),
    exportedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    logoBase64: logo(),
    photoUrl: r.photo_url ? await photoToBase64(supabaseAdmin, String(r.photo_url)) : null,
    accentColor: estPizza ? POLE_COLORS.pizza : POLE_COLORS.cuisine,
    allergens: mergeAllergens((ings ?? []).map((i) => parseAllergens(i.allergens))),
    montants,
  };

  const buffer = await renderToBuffer(KitchenPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>);
  const nom = String(r.name ?? "fiche").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="fiche-${nom || "recette"}${facteur !== 1 ? `-x${r2(facteur)}` : ""}.pdf"` },
  });
}
