import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Garde des tâches planifiées (crons Vercel, pg_cron Supabase).
 *
 * Fermé par défaut : sans CRON_SECRET dans l'environnement, aucune tâche ne
 * tourne — c'est le comportement recommandé par Vercel. Les crons Vercel
 * envoient d'eux-mêmes `Authorization: Bearer <CRON_SECRET>` dès que la
 * variable existe ; le job pg_cron « popina-sync-horaire » l'envoie aussi.
 */
export function cronUnauthorized(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré — tâche désactivée" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Variante pour les tâches qu'un administrateur peut aussi lancer à la main
 * depuis l'appli (bouton « Récupérer maintenant ») : secret cron OU jeton
 * d'un utilisateur group_admin.
 */
export async function cronOrAdminUnauthorized(req: Request): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth === `Bearer ${secret}`) return null;

  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data } = await supabaseAdmin.auth.getUser(token);
    if (data?.user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (profile?.role === "group_admin") return null;
    }
  }
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré — tâche désactivée" }, { status: 503 });
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
