import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Toutes les colonnes qui référencent ingredients.id (FK en base).
// Si une table manque ici, la suppression finale échoue sur la contrainte.
const FK_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ["kitchen_recipe_lines", "ingredient_id"],
  ["prep_recipe_lines", "ingredient_id"],
  ["recipe_ingredients", "ingredient_id"],
  ["recipe_lines", "ingredient_id"],
  ["ingredient_usage", "ingredient_id"],
  ["formula_lines", "ingredient_id"],
  ["supplier_skus", "ingredient_id"],
  ["commande_lignes", "ingredient_id"],
  ["stock_movements", "ingredient_id"],
  ["popina_products", "ingredient_id"],
  ["popina_dose_map", "ingredient_id"],
  ["recipe_pairings", "ingredient_id"],
  ["batch_results", "ingredient_id"],
  ["flour_blends", "flour_ingredient_id"],
  ["prep_recipes", "pivot_ingredient_id"],
  ["prep_recipes", "output_ingredient_id"],
  ["kitchen_recipes", "pivot_ingredient_id"],
  ["kitchen_recipes", "output_ingredient_id"],
  ["ingredients", "parent_ingredient_id"],
] as const;

export async function POST(req: Request) {
  try {
    const supabase = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } }
    );

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    if (!auth?.user?.id) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

    // Resolve etablissement
    try {
      await resolveEtabId(auth.user.id, req.headers);
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    const body = await req.json() as { keepId?: string; deleteId?: string };
    const { keepId, deleteId } = body;

    if (!keepId || !deleteId) {
      return NextResponse.json({ ok: false, error: "keepId et deleteId requis." }, { status: 400 });
    }
    if (keepId === deleteId) {
      return NextResponse.json({ ok: false, error: "keepId et deleteId identiques." }, { status: 400 });
    }

    // Verify both ingredients exist
    const { data: ings } = await supabaseAdmin
      .from("ingredients")
      .select("id")
      .in("id", [keepId, deleteId]);

    if (!ings || ings.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Un ou plusieurs ingrédients introuvables." },
        { status: 404 }
      );
    }

    const errors: string[] = [];

    // 1. Migrate FK references (client admin : le RLS ne doit pas bloquer
    // une migration en silence, sinon le delete final échoue sur la FK)
    for (const [table, column] of FK_COLUMNS) {
      const { error } = await supabaseAdmin
        .from(table)
        .update({ [column]: keepId })
        .eq(column, deleteId);
      if (error) {
        // Violation d'unicité = une ligne existe déjà pour keepId (ex: recette
        // contenant les deux doublons). L'update bulk est annulé en entier,
        // donc on migre ligne par ligne et on supprime seulement les conflits.
        if (error.code === "23505" && table !== "ingredients") {
          const { data: rows, error: selErr } = await supabaseAdmin
            .from(table).select("id").eq(column, deleteId);
          if (selErr || !rows) {
            errors.push(`${table}.${column}: ${selErr?.message ?? error.message}`);
            continue;
          }
          for (const r of rows) {
            const { error: rowErr } = await supabaseAdmin
              .from(table).update({ [column]: keepId }).eq("id", r.id);
            if (rowErr?.code === "23505") {
              await supabaseAdmin.from(table).delete().eq("id", r.id);
            } else if (rowErr) {
              errors.push(`${table}.${column}: ${rowErr.message}`);
            }
          }
        } else {
          errors.push(`${table}.${column}: ${error.message}`);
        }
      }
    }

    // 2. Delete supplier_offers for the deleted ingredient
    const { error: offersErr } = await supabaseAdmin
      .from("supplier_offers")
      .delete()
      .eq("ingredient_id", deleteId);
    if (offersErr) {
      errors.push(`supplier_offers: ${offersErr.message}`);
    }

    // 3. Delete the ingredient
    const { error: delErr } = await supabaseAdmin
      .from("ingredients")
      .delete()
      .eq("id", deleteId);
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message, errors }, { status: 500 });
    }

    return NextResponse.json({ ok: true, errors });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e || "Erreur merge") },
      { status: 500 }
    );
  }
}
