import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { RecipePdfDocument, type RecipePdfData } from "@/lib/recipePdf";
import { calculerPate } from "@/lib/pateEngine";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

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

function toNum(v: unknown, fallback: number) {
  const n = typeof v === "string" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { recipeId?: string; nbPatons?: number; poidsPaton?: number };

    const recipeId = String(body.recipeId ?? "").trim();
    if (!recipeId) {
      return NextResponse.json({ message: "recipeId manquant" }, { status: 400 });
    }
    if (!isUuid(recipeId)) {
      return NextResponse.json({ message: "ID invalide (UUID attendu)" }, { status: 400 });
    }

    const nbPatons = Math.max(1, Math.round(toNum(body.nbPatons, 150)));
    const poidsPaton = Math.max(1, Math.round(toNum(body.poidsPaton, 264)));

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: recipe, error: rErr } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .maybeSingle();

    if (rErr) return NextResponse.json({ message: rErr.message }, { status: 500 });
    if (!recipe) return NextResponse.json({ message: "Recette introuvable" }, { status: 404 });

    const typeRaw = String(recipe.type ?? "direct").toLowerCase();
    const type =
      (typeRaw === "direct" || typeRaw === "biga" || typeRaw === "focaccia" ? typeRaw : "direct") as
        | "direct"
        | "biga"
        | "focaccia";

    const flour_mix = Array.isArray(recipe.flour_mix) ? recipe.flour_mix : [];

    const calc = calculerPate({
      type,
      nbPatons,
      poidsPaton,
      recipe:
        type === "biga"
          ? {
              hydration_total: toNum(recipe.hydration_total, 65),
              salt_percent: toNum(recipe.salt_percent, 2),
              honey_percent: toNum(recipe.honey_percent, 0),
              oil_percent: toNum(recipe.oil_percent, 0),
              biga_yeast_percent: toNum(recipe.biga_yeast_percent, 0),
              yeast_percent: 0,
            }
          : {
              hydration_total: toNum(recipe.hydration_total, 65),
              salt_percent: toNum(recipe.salt_percent, 2),
              honey_percent: toNum(recipe.honey_percent, 0),
              oil_percent: toNum(recipe.oil_percent, 0),
              yeast_percent: toNum(recipe.yeast_percent, 0),
              biga_yeast_percent: 0,
            },
      flourMix: flour_mix,
    });

    const exportedAt = new Date().toISOString();

    const data: RecipePdfData = {
      name: recipe.name ?? "Empâtement",
      type,

      hydration_total: recipe.hydration_total ?? null,
      salt_percent: recipe.salt_percent ?? null,
      honey_percent: recipe.honey_percent ?? null,
      oil_percent: recipe.oil_percent ?? null,

      yeast_percent: recipe.yeast_percent ?? null,
      biga_yeast_percent: recipe.biga_yeast_percent ?? null,

      flour_mix,

      // ✅ NEW
      procedure: recipe.procedure ?? "",

      nbPatons,
      poidsPaton,
      exportedAt,

      totals: calc.totals,
      phases: calc.phases,
      warnings: calc.warnings ?? [],
    };

    // ✅ Fix TypeScript: renderToBuffer attend ReactElement<DocumentProps>
    const documentElement = RecipePdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(documentElement);

    const base = slugify(recipe.name ?? "empatement");
    const ts = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    const filename = `empatement-${base}-${ts}.pdf`;

    const pdfBody = new Uint8Array(pdfBuffer);

       return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
    return NextResponse.json(
      { message: "Erreur génération PDF", details: msg },
      { status: 500 }
    );
  }
}