import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { CocktailPdfDocument, type CocktailPdfData } from "@/lib/cocktailPdf";
import { offerRowToCpu } from "@/lib/offerPricing";
import fs from "fs";
import path from "path";

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

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function readLogoBase64(): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}


type CocktailRow = {
  id: string;
  name: string | null;
  type: string | null;
  glass: string | null;
  garnish: string | null;
  steps: string | null;
  sell_price: number | null;
  image_url: string | null;
};

type LineRow = {
  ingredient_id: string;
  qty: number | null;
  unit: string | null;
  sort_order: number | null;
};

type IngRow = {
  id: string;
  name: string | null;
  piece_volume_ml: number | null;
};

type OfferRow = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const SUPABASE_ANON_KEY = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const cocktailId = String(b.cocktailId ?? "").trim();
    if (!cocktailId) {
      return NextResponse.json({ message: "cocktailId manquant" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: cocktail, error: cErr } = await supabase
      .from("cocktails")
      .select("id,name,type,glass,garnish,steps,sell_price,image_url")
      .eq("id", cocktailId)
      .maybeSingle();

    if (cErr) return NextResponse.json({ message: cErr.message }, { status: 500 });
    if (!cocktail) return NextResponse.json({ message: "Cocktail introuvable" }, { status: 404 });

    const cr = cocktail as CocktailRow;

    const { data: ln, error: lErr } = await supabase
      .from("cocktail_ingredients")
      .select("ingredient_id,qty,unit,sort_order")
      .eq("cocktail_id", cocktailId)
      .order("sort_order", { ascending: true });

    if (lErr) return NextResponse.json({ message: lErr.message }, { status: 500 });

    const lineRows = ((ln ?? []) as LineRow[]).slice();
    const ingredientIds = Array.from(
      new Set(lineRows.map((r) => String(r.ingredient_id || "")).filter(Boolean))
    );

    // Fetch ingredients (name + piece_volume_ml for spirits)
    const ingMap = new Map<string, { name: string | null; piece_volume_ml: number | null }>();
    if (ingredientIds.length) {
      const { data: ings, error: iErr } = await supabase
        .from("ingredients")
        .select("id,name,piece_volume_ml")
        .in("id", ingredientIds);

      if (iErr) return NextResponse.json({ message: iErr.message }, { status: 500 });

      for (const it of (ings ?? []) as IngRow[]) {
        ingMap.set(String(it.id), { name: it.name ?? null, piece_volume_ml: it.piece_volume_ml ?? null });
      }
    }

    // Fetch latest offers for pricing
    const offerMap = new Map<string, OfferRow>();
    if (ingredientIds.length) {
      const { data: offers } = await supabase
        .from("v_latest_offers")
        .select("*")
        .in("ingredient_id", ingredientIds);

      for (const o of (offers ?? []) as OfferRow[]) {
        const iid = String(o["ingredient_id"] ?? "");
        if (iid) offerMap.set(iid, o);
      }
    }

    // Compute line costs
    const lines = lineRows.map((r) => {
      const iid = String(r.ingredient_id || "");
      const ing = ingMap.get(iid);
      const offerRow = offerMap.get(iid);
      const qty = r.qty == null ? null : n2(r.qty);
      const unit = (r.unit ?? "cl").toLowerCase();

      let cost: number | null = null;

      if (offerRow && qty != null && qty > 0) {
        const cpu = offerRowToCpu(offerRow);

        // Derive cpu.ml from cpu.pcs + piece_volume_ml (spirits sold per bottle)
        let cpuMl = cpu.ml;
        if (cpuMl == null && cpu.pcs != null) {
          const pvm = ing?.piece_volume_ml ?? null;
          if (pvm != null && pvm > 0) cpuMl = cpu.pcs / pvm;
        }

        if (unit === "cl" && cpuMl != null) {
          cost = round2(qty * 10 * cpuMl);
        } else if (unit === "ml" && cpuMl != null) {
          cost = round2(qty * cpuMl);
        } else if (unit === "g" && cpu.g != null) {
          cost = round2(qty * cpu.g);
        } else if (unit === "pc" && cpu.pcs != null) {
          cost = round2(qty * cpu.pcs);
        }
      }

      return {
        name: ing?.name ?? null,
        qty: qty == null ? null : qty,
        unit: r.unit ?? "cl",
        cost,
      };
    });

    const totalCost = round2(lines.reduce((acc, l) => acc + n2(l.cost), 0));

    // Fetch photo as base64 via HTTP (plus fiable que le SDK storage pour react-pdf)
    let photoUrl: string | null = null;
    if (cr.image_url) {
      try {
        const res = await fetch(cr.image_url);
        if (res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          const mime = ct.startsWith("image/") ? ct.split(";")[0].trim() : "image/jpeg";
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0) {
            photoUrl = `data:${mime};base64,${buf.toString("base64")}`;
          }
        }
      } catch {
        // photo non critique — on génère le PDF sans
      }
    }

    const exportedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const logoBase64 = readLogoBase64();

    const data: CocktailPdfData = {
      cocktailName: (cr.name ?? "Cocktail").toString(),
      type: cr.type ?? null,
      glass: cr.glass ?? null,
      garnish: cr.garnish ?? null,
      steps: cr.steps ?? null,
      sellPrice: cr.sell_price ?? null,
      totalCost: totalCost > 0 ? totalCost : null,
      lines: lines.map((l) => ({
        name: l.name,
        qty: l.qty == null ? null : round2(l.qty),
        unit: l.unit,
        cost: l.cost,
      })),
      exportedAt,
      logoBase64,
      photoUrl,
    };

    const documentElement = CocktailPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
    const pdfBuffer = await renderToBuffer(documentElement);

    const base = slugify(cr.name ?? "cocktail");
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const filename = `cocktail-${base}-${ts}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ message: "Export PDF cocktail impossible", details: msg }, { status: 500 });
  }
}
