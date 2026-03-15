import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { parseKeziaSynthese } from "@/lib/kezia/keziaParser";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Seuls les fichiers PDF sont acceptes." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await pdfToText(bytes);
    const parsed = parseKeziaSynthese(text);

    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifie." }, { status: 401 });

    let etabId: string;
    try {
      ({ etabId } = await resolveEtabId(userId, req.headers));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    if (mode === "preview") {
      return NextResponse.json({ ok: true, mode: "preview", parsed });
    }

    // Check if already imported for this date
    const { data: existing } = await supabase
      .from("daily_sales")
      .select("id")
      .eq("etablissement_id", etabId)
      .eq("date", parsed.date)
      .eq("source", "kezia_pdf")
      .limit(1);

    const alreadyExists = existing && existing.length > 0;

    if (alreadyExists) {
      // Update existing record
      const { error: upErr } = await supabase
        .from("daily_sales")
        .update({
          ca_ttc: parsed.ca_ttc,
          ca_ht: parsed.ca_ht,
          tva_total: parsed.tva_total,
          tickets: parsed.tickets,
          couverts: parsed.couverts,
          panier_moyen: parsed.panier_moyen,
          especes: parsed.especes,
          cartes: parsed.cartes,
          cheques: parsed.cheques,
          virements: parsed.virements,
          marge_total: parsed.marge_total,
          taux_marque: parsed.taux_marque,
          rayons: parsed.rayons,
          tva_details: parsed.tva_details,
          raw_text: text,
          user_id: userId,
        })
        .eq("id", existing[0].id);

      if (upErr) throw new Error(upErr.message);

      return NextResponse.json({ ok: true, mode: "commit", updated: true, date: parsed.date });
    }

    // Insert new record
    const { error: insErr } = await supabase
      .from("daily_sales")
      .insert({
        etablissement_id: etabId,
        date: parsed.date,
        source: "kezia_pdf",
        ca_ttc: parsed.ca_ttc,
        ca_ht: parsed.ca_ht,
        tva_total: parsed.tva_total,
        tickets: parsed.tickets,
        couverts: parsed.couverts,
        panier_moyen: parsed.panier_moyen,
        especes: parsed.especes,
        cartes: parsed.cartes,
        cheques: parsed.cheques,
        virements: parsed.virements,
        marge_total: parsed.marge_total,
        taux_marque: parsed.taux_marque,
        rayons: parsed.rayons,
        tva_details: parsed.tva_details,
        raw_text: text,
        user_id: userId,
      });

    if (insErr) throw new Error(insErr.message);

    return NextResponse.json({ ok: true, mode: "commit", updated: false, date: parsed.date });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[kezia] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
