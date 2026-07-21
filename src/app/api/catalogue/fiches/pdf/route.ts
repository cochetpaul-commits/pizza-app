import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

// ── Register fonts ──────────────────────────────────────────
const fontDir = path.join(process.cwd(), "public", "fonts");
try {
  Font.register({ family: "Oswald", src: path.join(fontDir, "Oswald-Bold.ttf"), fontWeight: 700 });
  Font.register({ family: "DMSans", src: path.join(fontDir, "DMSans-Regular.ttf"), fontWeight: 400 });
  Font.register({ family: "DMSans", src: path.join(fontDir, "DMSans-Bold.ttf"), fontWeight: 700 });
} catch { /* fonts may already be registered */ }

// ── Types ───────────────────────────────────────────────────
type PairingItem = { name: string; category: string };
type FichePdf = {
  name: string;
  category: string;
  description_courte: string | null;
  price_ttc: number | null;
  allergens: string[];
  ingredients: string[];
  pairings: PairingItem[];
};

const CAT_LABELS: Record<string, string> = {
  pizza: "PIZZE", entree: "ANTIPASTI", plat_cuisine: "CUCINA",
  dessert: "DOLCI", accompagnement: "CONTORNI", cocktail: "COCKTAILS",
};

const CAT_COLORS: Record<string, string> = {
  pizza: "#A0522D", entree: "#8B6914", plat_cuisine: "#1B7A3D",
  dessert: "#A0522D", accompagnement: "#117A65", cocktail: "#922B21",
};

// ── Styles ──────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { padding: "28 32", fontFamily: "DMSans", fontSize: 9, color: "#1a1a1a" },
  header: { marginBottom: 16, borderBottom: "2 solid #D4775A", paddingBottom: 8 },
  headerTitle: { fontFamily: "Oswald", fontSize: 20, fontWeight: 700, color: "#1a1a1a" },
  headerSub: { fontSize: 9, color: "#D4775A", fontWeight: 700, letterSpacing: 2, marginBottom: 2 },
  catHeader: { fontFamily: "Oswald", fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 6, paddingBottom: 4, borderBottom: "1.5 solid #e5ddd0" },
  card: { marginBottom: 8, padding: "8 10", borderRadius: 6, border: "0.5 solid #e5ddd0", backgroundColor: "#fefefe" },
  cardName: { fontFamily: "Oswald", fontSize: 12, fontWeight: 700, color: "#1a1a1a" },
  cardPrice: { fontFamily: "Oswald", fontSize: 12, fontWeight: 700, color: "#1a1a1a" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  desc: { fontSize: 8, color: "#666", marginBottom: 3, fontStyle: "italic" },
  label: { fontSize: 7, fontWeight: 700, color: "#999", letterSpacing: 1, marginBottom: 2, textTransform: "uppercase" },
  ingredients: { fontSize: 8, color: "#333", marginBottom: 3 },
  allergens: { fontSize: 7, color: "#B91C1C", marginBottom: 3 },
  pairings: { fontSize: 8, color: "#7B2D5F", fontStyle: "italic" },
  footer: { position: "absolute", bottom: 16, left: 32, right: 32, fontSize: 7, color: "#bbb", textAlign: "center" },
});

// ── PDF Document ────────────────────────────────────────────
function CataloguePdf({ fiches }: { fiches: FichePdf[] }) {
  // Group by category
  const grouped = new Map<string, FichePdf[]>();
  for (const f of fiches) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }

  const catOrder: Record<string, number> = { pizza: 0, entree: 1, plat_cuisine: 2, dessert: 3, accompagnement: 4, cocktail: 5 };
  const sortedCats = [...grouped.keys()].sort((a, b) => (catOrder[a] ?? 9) - (catOrder[b] ?? 9));

  return React.createElement(Document, {},
    React.createElement(Page, { size: "A4", style: s.page, wrap: true },
      // Header
      React.createElement(View, { style: s.header, fixed: true },
        React.createElement(Text, { style: s.headerSub }, "CATALOGUE SALLE"),
        React.createElement(Text, { style: s.headerTitle }, "Carte & Accords"),
      ),
      // Categories
      ...sortedCats.map((cat) => {
        const items = grouped.get(cat) ?? [];
        const color = CAT_COLORS[cat] ?? "#1a1a1a";
        return React.createElement(View, { key: cat, wrap: false },
          React.createElement(Text, { style: { ...s.catHeader, color } }, CAT_LABELS[cat] ?? cat),
          ...items.map((f) =>
            React.createElement(View, { key: f.name, style: s.card, wrap: false },
              React.createElement(View, { style: s.cardRow },
                React.createElement(Text, { style: s.cardName }, f.name),
                f.price_ttc && f.price_ttc > 0
                  ? React.createElement(Text, { style: s.cardPrice }, `${f.price_ttc.toFixed(0)} \u20AC`)
                  : null,
              ),
              f.description_courte
                ? React.createElement(Text, { style: s.desc }, f.description_courte)
                : null,
              f.ingredients.length > 0
                ? React.createElement(View, {},
                    React.createElement(Text, { style: s.label }, "COMPOSITION"),
                    React.createElement(Text, { style: s.ingredients }, f.ingredients.join(", ")),
                  )
                : null,
              f.allergens.length > 0
                ? React.createElement(View, {},
                    React.createElement(Text, { style: s.label }, "ALLERGENES"),
                    React.createElement(Text, { style: s.allergens }, f.allergens.join(" \u00B7 ")),
                  )
                : null,
              f.pairings.length > 0
                ? React.createElement(View, {},
                    React.createElement(Text, { style: s.label }, "ACCORDS"),
                    React.createElement(Text, { style: s.pairings }, f.pairings.map((p) => p.name).join(", ")),
                  )
                : null,
            ),
          ),
        );
      }),
      // Footer
      React.createElement(Text, { style: s.footer, fixed: true, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Catalogue Salle \u2014 Page ${pageNumber}/${totalPages}` }),
    ),
  );
}

// ── GET handler ─────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = sb();

    const [
      { data: kitchens },
      { data: kitchenLines },
      { data: allIngredients },
      { data: popinaProducts },
      { data: pairingsData },
    ] = await Promise.all([
      supabase.from("kitchen_recipes").select("id, name, category, description_courte, in_catalogue, is_active, output_ingredient_id"),
      supabase.from("kitchen_recipe_lines").select("recipe_id, ingredient_id"),
      supabase.from("ingredients").select("id, name, allergens, category"),
      supabase.from("popina_products").select("id, price_ttc, kitchen_recipe_id").eq("active", true),
      supabase.from("recipe_pairings").select("recipe_id, recipe_type, ingredient_id"),
    ]);

    // Ingredient lookup
    const ingMap = new Map<string, { name: string; allergens: string[]; category: string | null }>();
    for (const i of allIngredients ?? []) {
      let allergens: string[] = [];
      try { allergens = typeof i.allergens === "string" ? JSON.parse(i.allergens) : (i.allergens ?? []); } catch { /* */ }
      ingMap.set(i.id, { name: i.name, allergens, category: i.category });
    }

    // Kitchen sub-recipe lookup
    const kitchenMap = new Map<string, { lines: { ingredient_id: string }[] }>();
    for (const kr of kitchens ?? []) {
      const lines = (kitchenLines ?? []).filter((l) => l.recipe_id === kr.id);
      if (kr.output_ingredient_id) kitchenMap.set("out:" + kr.output_ingredient_id, { lines });
    }

    // Popina prices
    const popinaPrice = new Map<string, number>();
    for (const pp of popinaProducts ?? []) {
      if (pp.kitchen_recipe_id) popinaPrice.set("kitchen:" + pp.kitchen_recipe_id, pp.price_ttc);
    }

    // Pairings
    const pairingsMap = new Map<string, PairingItem[]>();
    for (const p of pairingsData ?? []) {
      const ing = ingMap.get(p.ingredient_id);
      if (!ing) continue;
      const key = p.recipe_type + ":" + p.recipe_id;
      const arr = pairingsMap.get(key) ?? [];
      arr.push({ name: ing.name, category: ing.category ?? "" });
      pairingsMap.set(key, arr);
    }

    function collectAllergens(lines: { ingredient_id: string }[], visited = new Set<string>()): string[] {
      const allergens = new Set<string>();
      for (const line of lines) {
        if (visited.has(line.ingredient_id)) continue;
        visited.add(line.ingredient_id);
        const ing = ingMap.get(line.ingredient_id);
        if (ing) for (const a of ing.allergens) allergens.add(a);
        const sub = kitchenMap.get("out:" + line.ingredient_id);
        if (sub) for (const a of collectAllergens(sub.lines, visited)) allergens.add(a);
      }
      return [...allergens].sort();
    }

    function cleanName(raw: string): string {
      return raw
        .replace(/\s+\d+[.,/]?\d*\s*(KG|G|CL|ML|L|PCS|PIECES?|UNITE?S?)\b/gi, "")
        .replace(/\s+\d+[.,/]\d+\s*$/g, "")
        .trim();
    }

    const fiches: FichePdf[] = [];
    const sellCategories = ["pizza", "entree", "plat_cuisine", "dessert", "accompagnement", "cocktail"];

    for (const kr of kitchens ?? []) {
      if (!kr.is_active || !sellCategories.includes(kr.category) || kr.in_catalogue === false) continue;
      const lines = (kitchenLines ?? []).filter((l) => l.recipe_id === kr.id);
      const isPizza = kr.category === "pizza";
      const isCocktail = kr.category === "cocktail";
      const pairingKey = isPizza ? "pizza:" + kr.id : isCocktail ? "cocktail:" + kr.id : "cuisine:" + kr.id;
      fiches.push({
        name: kr.name, category: kr.category, description_courte: kr.description_courte,
        price_ttc: popinaPrice.get("kitchen:" + kr.id) ?? null,
        allergens: collectAllergens(lines),
        ingredients: lines.map((l) => cleanName(ingMap.get(l.ingredient_id)?.name ?? "?")),
        pairings: pairingsMap.get(pairingKey) ?? [],
      });
    }

    const catOrder: Record<string, number> = { pizza: 0, entree: 1, plat_cuisine: 2, dessert: 3, accompagnement: 4, cocktail: 5 };
    fiches.sort((a, b) => (catOrder[a.category] ?? 9) - (catOrder[b.category] ?? 9) || a.name.localeCompare(b.name));

    const el = CataloguePdf({ fiches }) as unknown as React.ReactElement<DocumentProps>;
    const buffer = await renderToBuffer(el);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=catalogue-salle.pdf" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
