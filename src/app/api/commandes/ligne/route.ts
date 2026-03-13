import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/commandes/ligne
 * Ajoute ou met à jour une ligne de commande.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest) {
  // TODO: implémenter ajout/modification ligne
  return NextResponse.json({ ok: true, ligne: null });
}

/**
 * DELETE /api/commandes/ligne
 * Supprime une ligne de commande.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  // TODO: implémenter suppression ligne
  return NextResponse.json({ ok: true });
}
