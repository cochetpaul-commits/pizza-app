import { NextRequest, NextResponse } from "next/server";

/**
 * Filtre global des routes serveur : refus par défaut sans jeton Supabase
 * valide. Les rôles/établissements restent vérifiés dans chaque route ; ici
 * on garantit seulement qu'un inconnu ne peut rien lire ni écrire.
 *
 * Liste blanche (routes qui portent leur propre garde) :
 *  - /api/version, /api/client-error : sans données
 *  - /api/cron/*, GET /api/pennylane/sync, GET /api/meteo?action=fetch :
 *    tâches planifiées, protégées par CRON_SECRET (lib/cronAuth.ts)
 */
const PUBLIC_EXACT = new Set(["/api/version", "/api/client-error"]);

function isPublic(req: NextRequest): boolean {
  const { pathname, searchParams } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/api/cron/")) return true;
  if (req.method === "GET" && pathname === "/api/pennylane/sync") return true;
  if (req.method === "GET" && pathname === "/api/meteo" && searchParams.get("action") === "fetch") return true;
  return false;
}

// Cache court des jetons validés : évite un aller-retour Auth par requête
// quand une page enchaîne plusieurs appels API.
const TTL_MS = 60_000;
const valides = new Map<string, number>();

async function tokenValide(token: string): Promise<boolean> {
  const now = Date.now();
  const exp = valides.get(token);
  if (exp && exp > now) return true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    if (valides.size > 500) valides.clear();
    valides.set(token, now + TTL_MS);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  if (isPublic(req)) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || !(await tokenValide(token))) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
