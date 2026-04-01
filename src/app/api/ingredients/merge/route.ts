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

const FK_TABLES = [
  "pizza_ingredients",
  "kitchen_recipe_lines",
  "prep_recipe_lines",
  "cocktail_ingredients",
  "recipe_ingredients",
  "ingredient_usage",
  "formula_lines",
  "supplier_skus",
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

    // 1. Migrate FK references
    for (const table of FK_TABLES) {
      const { error } = await supabase
        .from(table)
        .update({ ingredient_id: keepId })
        .eq("ingredient_id", deleteId);
      if (error) {
        // Non-fatal: table may not exist or column may differ
        errors.push(`${table}: ${error.message}`);
      }
    }

    // 2. Delete supplier_offers for the deleted ingredient
    const { error: offersErr } = await supabase
      .from("supplier_offers")
      .delete()
      .eq("ingredient_id", deleteId);
    if (offersErr) {
      errors.push(`supplier_offers: ${offersErr.message}`);
    }

    // 3. Delete the ingredient
    const { error: delErr } = await supabase
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
