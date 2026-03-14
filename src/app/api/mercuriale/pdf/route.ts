import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MercurialePdfDocument, type MercurialePdfData, type MercurialeRow } from "@/lib/mercurialePdf";
import { offerRowToCpu } from "@/lib/offerPricing";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function readLogoBase64(): string | null {
  try {
    const p = path.join(process.cwd(), "public", "logo.png");
    const buf = fs.readFileSync(p);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch { return null; }
}

function fmtDate(s: string | null): string | null {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return null; }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let etabId: string;
    try {
      ({ etabId } = await getEtablissement(req));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const groupBy = (String(body.groupBy ?? "category")) as "category" | "supplier" | "alpha";
    const establishment = String(body.establishment ?? "all");
    const filterSupplier = String(body.filterSupplier ?? "all");

    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: auth2 } = await supabase.auth.getUser();
    if (!auth2?.user) return NextResponse.json({ message: "Non authentifié" }, { status: 401 });

    // Fetch ingrédients
    const { data: ings, error: ingErr } = await supabase
      .from("ingredients")
      .select("id,name,category,is_active")
      .eq("is_active", true)
      .eq("etablissement_id", etabId)
      .order("name", { ascending: true });
    if (ingErr) return NextResponse.json({ message: ingErr.message }, { status: 500 });

    // Fetch offres (v_latest_offers + establishment depuis supplier_offers)
    const { data: offers, error: offErr } = await supabase
      .from("v_latest_offers")
      .select("ingredient_id,supplier_id,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g,updated_at");
    if (offErr) return NextResponse.json({ message: offErr.message }, { status: 500 });

    // Fetch establishment séparément
    const { data: estabData } = await supabase
      .from("supplier_offers")
      .select("ingredient_id,establishment")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });
    const estabMap = new Map<string, string>();
    for (const e of (estabData ?? []) as { ingredient_id: string; establishment: string }[]) {
      if (!estabMap.has(e.ingredient_id)) estabMap.set(e.ingredient_id, e.establishment ?? "both");
    }

    // Fetch fournisseurs
    const { data: sups } = await supabase.from("suppliers").select("id,name").eq("etablissement_id", etabId);
    const supMap = new Map<string, string>();
    for (const s of (sups ?? []) as { id: string; name: string }[]) supMap.set(s.id, s.name);

    // Build offer map
    const offerMap = new Map<string, { priceLabel: string; supplier: string | null; supplierRawId: string; updatedAt: string | null; establishment: string | null }>();
    for (const o of (offers ?? []) as Record<string, unknown>[]) {
      const iid = String(o.ingredient_id ?? "");
      if (!iid || offerMap.has(iid)) continue;
      const cpu = offerRowToCpu(o);
      let priceLabel = "—";
      if (cpu.g && cpu.g > 0) priceLabel = (cpu.g * 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/kg";
      else if (cpu.ml && cpu.ml > 0) priceLabel = (cpu.ml * 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/L";
      else if (cpu.pcs && cpu.pcs > 0) priceLabel = cpu.pcs.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/pc";
      const sid = String(o.supplier_id ?? "");
      offerMap.set(iid, {
        priceLabel,
        supplier: sid ? (supMap.get(sid) ?? sid.slice(0, 4).toUpperCase()) : null,
        supplierRawId: sid,
        updatedAt: fmtDate(String(o.updated_at ?? "")),
        establishment: estabMap.get(String(o.ingredient_id ?? "")) ?? "both",
      });
    }

    // Build rows
    let rows: MercurialeRow[] = (ings ?? []).map((ing: Record<string, unknown>) => {
      const offer = offerMap.get(String(ing.id));
      return {
        name: String(ing.name ?? ""),
        category: String(ing.category ?? "autre"),
        priceLabel: offer?.priceLabel ?? "—",
        supplier: offer?.supplier ?? null,
        supplierRawId: offer?.supplierRawId ?? null,
        updatedAt: offer?.updatedAt ?? null,
        establishment: offer?.establishment ?? null,
      };
    });

    // Filtre fournisseur
    if (filterSupplier !== "all") {
      rows = rows.filter(r => r.supplierRawId === filterSupplier);
    }

    // Filtre établissement
    if (establishment !== "all") {
      rows = rows.filter(r => !r.establishment || r.establishment === establishment || r.establishment === "both");
    }

    const data: MercurialePdfData = {
      rows,
      groupBy,
      establishment,
      exportedAt: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }),
      logoBase64: readLogoBase64(),
    };

    const doc = React.createElement(MercurialePdfDocument, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(doc as any);

    const date = new Date().toISOString().slice(0, 10);
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="mercuriale-${date}.pdf"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ message: "Erreur mercuriale PDF", details: msg }, { status: 500 });
  }
}
