import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { RecipePdfDocument, type RecipePdfData } from "@/lib/recipePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function slugify(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { recipeId } = (await req.json()) as { recipeId?: string };
    if (!recipeId) {
      return NextResponse.json({ message: "recipeId manquant" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    // 1) Recette
    const { data: recipe, error: rErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .maybeSingle();

    if (rErr) {
      return NextResponse.json({ message: rErr.message }, { status: 500 });
    }
    if (!recipe) {
      return NextResponse.json({ message: "Recette introuvable" }, { status: 404 });
    }

    const data: RecipePdfData = {
      name: recipe.name ?? "Recette",
      type: recipe.type ?? null,
      hydration_total: recipe.hydration_total ?? null,
      salt_percent: recipe.salt_percent ?? null,
      honey_percent: recipe.honey_percent ?? null,
      oil_percent: recipe.oil_percent ?? null,
      yeast_percent: recipe.yeast_percent ?? null,
      biga_yeast_percent: recipe.biga_yeast_percent ?? null,
      flour_mix: Array.isArray(recipe.flour_mix) ? recipe.flour_mix : [],
      exportedAt: new Date().toISOString(),
    };

    const pdfBuffer = await renderToBuffer(
      RecipePdfDocument({ data })
    );

    const base = slugify(recipe.name ?? "recette");
    const ts = data.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const filename = `empatements-${base}-${ts}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        message: "Erreur génération PDF",
        details: String((e as Error)?.message ?? e),
      },
      { status: 500 }
    );
  }
}