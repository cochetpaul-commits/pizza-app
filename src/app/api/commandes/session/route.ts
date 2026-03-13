import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/commandes/session
 * Crée ou met à jour une session de commande fournisseur.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest) {
  // TODO: implémenter création session
  return NextResponse.json({ ok: true, session: null });
}

/**
 * GET /api/commandes/session?id=xxx
 * Récupère une session de commande par ID.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // TODO: implémenter lecture session
  return NextResponse.json({ session: null });
}
