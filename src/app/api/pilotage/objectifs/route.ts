import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const etabId = req.nextUrl.searchParams.get("etablissement_id");
  if (!etabId) return NextResponse.json({ error: "etablissement_id requis" }, { status: 400 });

  const { data, error } = await supabase
    .from("objectifs")
    .select("cle, valeur, unite, periode_debut, periode_fin")
    .eq("etablissement_id", etabId)
    .order("cle");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return as key-value map for easy lookup
  const map: Record<string, { valeur: number; unite: string }> = {};
  for (const row of data ?? []) {
    map[row.cle] = { valeur: Number(row.valeur), unite: row.unite ?? "" };
  }
  return NextResponse.json({ objectifs: map });
}
