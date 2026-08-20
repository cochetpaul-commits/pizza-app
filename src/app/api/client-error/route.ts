import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Réception des plantages côté client (window.onerror posé dans le
 * layout, avant tout le reste). Sans authentification : le plantage
 * peut survenir avant la connexion. Taille bornée, best-effort.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return NextResponse.json({ ok: false }, { status: 413 });
    const b = JSON.parse(raw) as Record<string, unknown>;
    await supabaseAdmin.from("client_errors").insert({
      message: String(b.message ?? "").slice(0, 2000),
      source: String(b.source ?? "").slice(0, 500),
      stack: String(b.stack ?? "").slice(0, 8000),
      user_agent: String(b.ua ?? "").slice(0, 500),
      url: String(b.url ?? "").slice(0, 500),
    });
  } catch { /* ne jamais faire échouer le client */ }
  return NextResponse.json({ ok: true });
}
