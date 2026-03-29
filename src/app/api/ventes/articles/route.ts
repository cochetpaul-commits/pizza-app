import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Types ── */
type RecipeOption = {
  id: string;
  name: string;
  type: "pizza" | "kitchen" | "cocktail";
  cost: number;
};

type IngredientOption = {
  id: string;
  name: string;
  category: string;
  purchase_price: number | null;
  cost_per_unit: number | null;
  default_unit: string | null;
};

/* ── GET /api/ventes/articles?etablissement_id=X ── */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");

  if (!etabId) {
    return NextResponse.json({ error: "etablissement_id requis" }, { status: 400 });
  }

  /* 1. Fetch existing articles_vente */
  const { data: articles, error: artErr } = await supabaseAdmin
    .from("articles_vente")
    .select("*")
    .eq("etablissement_id", etabId)
    .order("nom_vente");

  if (artErr) {
    return NextResponse.json({ error: artErr.message }, { status: 500 });
  }

  /* 2. Fetch all unique product names from ventes_lignes */
  const { data: ventesRaw, error: ventesErr } = await supabaseAdmin
    .from("ventes_lignes")
    .select("description,categorie,quantite,ttc")
    .eq("etablissement_id", etabId)
    .eq("type_ligne", "Produit")
    .eq("annule", false);

  if (ventesErr) {
    return NextResponse.json({ error: ventesErr.message }, { status: 500 });
  }

  // Aggregate by product name
  const prodMap = new Map<string, { categorie: string; qty: number; ca_ttc: number }>();
  for (const r of ventesRaw ?? []) {
    if (!r.description) continue;
    const key = r.description;
    const prev = prodMap.get(key);
    if (prev) {
      prev.qty += Number(r.quantite) || 1;
      prev.ca_ttc += Number(r.ttc) || 0;
    } else {
      prodMap.set(key, {
        categorie: r.categorie || "Autre",
        qty: Number(r.quantite) || 1,
        ca_ttc: Number(r.ttc) || 0,
      });
    }
  }

  // Find unmatched: products in ventes_lignes not in articles_vente
  const linkedNames = new Set((articles ?? []).map((a: { nom_vente: string }) => a.nom_vente));
  const unmatched: { nom_vente: string; categorie: string; qty: number; ca_ttc: number; prix_unit_ttc: number }[] = [];
  for (const [name, agg] of prodMap) {
    if (!linkedNames.has(name)) {
      const prixUnit = agg.qty > 0 ? Math.round((agg.ca_ttc / agg.qty) * 100) / 100 : 0;
      unmatched.push({ nom_vente: name, categorie: agg.categorie, qty: agg.qty, ca_ttc: agg.ca_ttc, prix_unit_ttc: prixUnit });
    }
  }
  unmatched.sort((a, b) => b.ca_ttc - a.ca_ttc);

  /* 3. Fetch recipes for dropdown */
  const [pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    supabaseAdmin
      .from("pizza_recipes")
      .select("id,name,total_cost")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin
      .from("kitchen_recipes")
      .select("id,name,total_cost,cost_per_portion,cost_per_kg")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
    supabaseAdmin
      .from("cocktails")
      .select("id,name,total_cost")
      .eq("is_draft", false)
      .eq("etablissement_id", etabId),
  ]);

  const recipes: RecipeOption[] = [];
  for (const r of pizzaRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipes.push({ id: r.id, name: r.name, type: "pizza", cost: r.total_cost });
    }
  }
  for (const r of kitchenRes.data ?? []) {
    const cost = r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0;
    if (cost > 0) {
      recipes.push({ id: r.id, name: r.name, type: "kitchen", cost });
    }
  }
  for (const r of cocktailRes.data ?? []) {
    if (r.total_cost && r.total_cost > 0) {
      recipes.push({ id: r.id, name: r.name, type: "cocktail", cost: r.total_cost });
    }
  }
  recipes.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  /* 4. Fetch ingredients for product linking */
  const { data: ingsRaw } = await supabaseAdmin
    .from("ingredients")
    .select("id,name,category,purchase_price,cost_per_unit,default_unit")
    .eq("is_active", true)
    .order("name");

  const ingredients: IngredientOption[] = (ingsRaw ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category || "",
    purchase_price: i.purchase_price ?? null,
    cost_per_unit: i.cost_per_unit ?? null,
    default_unit: i.default_unit ?? null,
  }));

  return NextResponse.json({ articles: articles ?? [], unmatched, recipes, ingredients });
}

/* ── POST /api/ventes/articles — Create or update an article ── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      etablissement_id,
      nom_vente,
      categorie_vente,
      recette_type,
      recette_id,
      ingredient_id,
      prix_achat,
      conditionnement,
      unite_conditionnement,
      nb_portions,
      prix_vente_ttc,
      notes,
    } = body;

    if (!etablissement_id || !nom_vente) {
      return NextResponse.json({ error: "etablissement_id et nom_vente requis" }, { status: 400 });
    }

    /* Calculate cout_unitaire */
    let cout_unitaire: number | null = null;
    let source = "manuel";

    if (recette_id && recette_type) {
      // Look up recipe cost
      source = "recette";

      if (recette_type === "kitchen") {
        const { data: recipe } = await supabaseAdmin
          .from("kitchen_recipes")
          .select("cost_per_portion,total_cost,cost_per_kg")
          .eq("id", recette_id)
          .maybeSingle();
        if (recipe) {
          cout_unitaire = recipe.cost_per_portion ?? recipe.total_cost ?? recipe.cost_per_kg ?? null;
        }
      } else if (recette_type === "pizza") {
        const { data: recipe } = await supabaseAdmin
          .from("pizza_recipes")
          .select("total_cost")
          .eq("id", recette_id)
          .maybeSingle();
        if (recipe) {
          cout_unitaire = recipe.total_cost ?? null;
        }
      } else {
        const { data: recipe } = await supabaseAdmin
          .from("cocktails")
          .select("total_cost")
          .eq("id", recette_id)
          .maybeSingle();
        if (recipe) {
          cout_unitaire = recipe.total_cost ?? null;
        }
      }
    } else if (ingredient_id && nb_portions && nb_portions > 0) {
      source = "achat";
      // Look up ingredient purchase price
      const { data: ing } = await supabaseAdmin
        .from("ingredients")
        .select("purchase_price,cost_per_unit")
        .eq("id", ingredient_id)
        .maybeSingle();

      if (ing) {
        const basePrice = prix_achat ?? ing.purchase_price ?? null;
        if (basePrice !== null && basePrice > 0) {
          cout_unitaire = Math.round((basePrice / nb_portions) * 100) / 100;
        }
      }
    } else if (prix_achat && nb_portions && nb_portions > 0) {
      source = "manuel";
      cout_unitaire = Math.round((prix_achat / nb_portions) * 100) / 100;
    } else if (prix_achat) {
      source = "manuel";
      cout_unitaire = prix_achat;
    }

    /* Auto-fill prix_vente_ttc from sales data if not provided */
    let autoPrice = prix_vente_ttc ? Number(prix_vente_ttc) : null;
    if (!autoPrice && etablissement_id && nom_vente) {
      // Get average unit price from ventes_lignes
      const { data: salesData } = await supabaseAdmin
        .from("ventes_lignes")
        .select("ttc,quantite")
        .eq("etablissement_id", etablissement_id)
        .eq("description", nom_vente)
        .eq("type_ligne", "Produit")
        .eq("annule", false)
        .gt("ttc", 0)
        .limit(50);
      if (salesData && salesData.length > 0) {
        let totalTTC = 0, totalQty = 0;
        for (const s of salesData) {
          totalTTC += Number(s.ttc) || 0;
          totalQty += Number(s.quantite) || 1;
        }
        if (totalQty > 0) autoPrice = Math.round((totalTTC / totalQty) * 100) / 100;
      }
    }

    /* Calculate HT, marge, food cost */
    const pvTTC = autoPrice;
    const pvHT = pvTTC ? Math.round((pvTTC / 1.1) * 100) / 100 : null;
    const margePct =
      pvHT && cout_unitaire ? Math.round(((pvHT - cout_unitaire) / pvHT) * 1000) / 10 : null;
    const foodCostPct =
      pvHT && cout_unitaire ? Math.round((cout_unitaire / pvHT) * 1000) / 10 : null;

    const row = {
      etablissement_id,
      nom_vente,
      categorie_vente: categorie_vente || null,
      source,
      recette_type: recette_type || null,
      recette_id: recette_id || null,
      ingredient_id: ingredient_id || null,
      prix_achat: prix_achat || null,
      conditionnement: conditionnement || null,
      unite_conditionnement: unite_conditionnement || null,
      nb_portions: nb_portions || null,
      cout_unitaire,
      prix_vente_ttc: pvTTC,
      prix_vente_ht: pvHT,
      marge_pct: margePct,
      food_cost_pct: foodCostPct,
      notes: notes || null,
    };

    // Upsert on (etablissement_id, nom_vente)
    const { data, error } = await supabaseAdmin
      .from("articles_vente")
      .upsert(row, { onConflict: "etablissement_id,nom_vente" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ article: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* ── DELETE /api/ventes/articles?id=X ── */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("articles_vente").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
