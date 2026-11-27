import { NextRequest, NextResponse } from "next/server";
import { roleDenied } from "@/lib/getEtablissement";
import { appelFidelite } from "@/lib/fidelite/serveur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fidelite/{fonction} — relais vers la base fidélité (managers et admins).
 * Premier lot : consultation seule. Les réglages (programmes, offres, affiches) restent pour l'instant sur fidelite.piccolamia.fr.
 */
const LECTURE = new Set(["admin_stats", "admin_clients", "admin_client", "admin_reglages_programme"]);

const MESSAGES: Record<string, string> = {
  non_configure: "Le lien avec la fidélité n'est pas encore réglé (variables FIDELITE_* manquantes).",
  session_invalide: "Le jeton de l'app n'est plus accepté par la fidélité.",
  acces_refuse: "Le jeton de l'app n'a pas les droits de gérance.",
  erreur_reseau: "La base fidélité ne répond pas.",
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ fn: string }> }) {
  const { fn } = await ctx.params;
  if (!LECTURE.has(fn)) return NextResponse.json({ error: "Fonction inconnue" }, { status: 404 });
  const refus = await roleDenied(req, ["group_admin", "manager"]);
  if (refus) return refus;
  const args = await req.json().catch(() => ({}));
  if (typeof args !== "object" || args === null || Array.isArray(args)) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const { data, erreur } = await appelFidelite(fn, args as Record<string, unknown>);
  if (erreur) return NextResponse.json({ error: MESSAGES[erreur] ?? erreur, code: erreur }, { status: erreur === "non_configure" ? 503 : 502 });
  return NextResponse.json({ data });
}
