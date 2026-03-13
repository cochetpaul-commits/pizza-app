import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/commandes/auth";

export const runtime = "nodejs";

/**
 * PATCH /api/commandes/favori
 * Toggle favori_commande on an ingredient.
 * Body: { ingredient_id: string, favori: boolean }
 */
export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    const body = await req.json();
    const { ingredient_id, favori } = body as {
      ingredient_id?: string;
      favori?: boolean;
    };

    if (!ingredient_id) {
      return NextResponse.json(
        { ok: false, error: "ingredient_id requis." },
        { status: 400 }
      );
    }
    if (typeof favori !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "favori (boolean) requis." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("ingredients")
      .update({ favori_commande: favori })
      .eq("id", ingredient_id)
      .select("id, name, favori_commande")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ingredient: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
