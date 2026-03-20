import { NextRequest, NextResponse } from "next/server";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/catalogue/publish
 * Body: { recipeType: "pizza"|"cuisine"|"cocktail"|"empatement", recipeId: string }
 *
 * Calls the existing PDF generation endpoint internally, uploads the PDF to
 * Supabase Storage, and upserts a row in catalogue_fiches.
 */
export async function POST(req: NextRequest) {
  let etab;
  try {
    etab = await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { recipeType, recipeId } = await req.json();
  if (!recipeType || !recipeId) {
    return NextResponse.json({ error: "recipeType and recipeId required" }, { status: 400 });
  }

  // Map recipe type to PDF API route and body field
  const pdfRouteMap: Record<string, { path: string; bodyKey: string }> = {
    pizza: { path: "/api/pizzas/pdf", bodyKey: "pizzaId" },
    cuisine: { path: "/api/kitchen/pdf", bodyKey: "kitchenId" },
    cocktail: { path: "/api/cocktails/pdf", bodyKey: "cocktailId" },
    empatement: { path: "/api/recipes/pdf", bodyKey: "recipeId" },
  };

  const route = pdfRouteMap[recipeType];
  if (!route) {
    return NextResponse.json({ error: `Unknown recipeType: ${recipeType}` }, { status: 400 });
  }

  // Call the internal PDF generation endpoint
  const origin = req.nextUrl.origin;
  const pdfRes = await fetch(`${origin}${route.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      "x-etablissement-id": req.headers.get("x-etablissement-id") ?? "",
    },
    body: JSON.stringify({ [route.bodyKey]: recipeId }),
  });

  if (!pdfRes.ok) {
    const errText = await pdfRes.text().catch(() => "PDF generation failed");
    return NextResponse.json({ error: errText }, { status: 500 });
  }

  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

  // Fetch recipe metadata for the catalogue entry
  let name = "Recette";
  let category: string | null = null;
  let photoUrl: string | null = null;

  if (recipeType === "pizza") {
    const { data } = await supabaseAdmin.from("pizza_recipes").select("name, photo_url").eq("id", recipeId).single();
    if (data) { name = data.name; photoUrl = data.photo_url; }
  } else if (recipeType === "cuisine") {
    const { data } = await supabaseAdmin.from("kitchen_recipes").select("name, category, photo_url").eq("id", recipeId).single();
    if (data) { name = data.name; category = data.category; photoUrl = data.photo_url; }
  } else if (recipeType === "cocktail") {
    const { data } = await supabaseAdmin.from("cocktails").select("name, image_url").eq("id", recipeId).single();
    if (data) { name = data.name; photoUrl = data.image_url; }
  } else if (recipeType === "empatement") {
    const { data } = await supabaseAdmin.from("recipes").select("name").eq("id", recipeId).single();
    if (data) { name = data.name; }
  }

  // Upload PDF to Storage
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const storagePath = `${recipeType}/${slug}-${recipeId.slice(0, 8)}.pdf`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("catalogue-fiches")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage.from("catalogue-fiches").getPublicUrl(storagePath);
  const pdfUrl = urlData.publicUrl;

  // Upsert catalogue entry
  const { error: dbErr } = await supabaseAdmin
    .from("catalogue_fiches")
    .upsert(
      {
        recipe_type: recipeType,
        recipe_id: recipeId,
        name,
        category,
        photo_url: photoUrl,
        pdf_url: pdfUrl,
        exported_at: new Date().toISOString(),
        exported_by: etab.userId,
      },
      { onConflict: "recipe_type,recipe_id" }
    );

  if (dbErr) {
    return NextResponse.json({ error: `DB error: ${dbErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name, pdf_url: pdfUrl });
}

/**
 * GET /api/catalogue
 * Returns all catalogue entries, ordered by recipe_type then name.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("catalogue_fiches")
    .select("id, recipe_type, recipe_id, name, category, photo_url, pdf_url, exported_at")
    .order("recipe_type")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
