import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/commandes/active
 * Retourne les sessions de commande actives (non finalisées).
 */
export async function GET() {
  // TODO: implémenter la requête quand la table commande_sessions existera
  return NextResponse.json({ sessions: [] });
}
