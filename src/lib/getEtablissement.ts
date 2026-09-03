import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side helper to resolve the active etablissement_id from a request.
 *
 * Strategy:
 * 1. Read `x-etablissement-id` header (sent by client-side EtablissementContext)
 * 2. Authenticate the user via their Authorization header
 * 3. Verify the user has access to the requested etablissement
 *
 * Returns { etabId, userId } or throws a descriptive error.
 */
export type EtabAuth = {
  etabId: string;
  userId: string;
  isGroupAdmin: boolean;
};

export async function getEtablissement(req: NextRequest | Request): Promise<EtabAuth> {
  // 1. Get the requested etablissement from header
  const etabHeader = req.headers.get("x-etablissement-id");

  // 2. Authenticate user
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new EtabError("Non authentifié", 401);
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: auth, error: authErr } = await userClient.auth.getUser();
  if (authErr || !auth?.user?.id) {
    throw new EtabError("Non authentifié", 401);
  }
  const userId = auth.user.id;

  // 3. Fetch profile to check access
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, etablissements_access")
    .eq("id", userId)
    .single();

  const isGroupAdmin = profile?.role === "group_admin";
  const accessIds: string[] = profile?.etablissements_access ?? [];

  // 4. Resolve etablissement_id
  let etabId = etabHeader;

  if (!etabId) {
    // Fallback: if user has exactly one establishment, use it
    if (accessIds.length === 1) {
      etabId = accessIds[0];
    } else if (isGroupAdmin) {
      // Group admin without specifying — get first active
      const { data: first } = await supabaseAdmin
        .from("etablissements")
        .select("id")
        .eq("actif", true)
        .order("nom")
        .limit(1)
        .single();
      etabId = first?.id ?? null;
    }
  }

  if (!etabId) {
    throw new EtabError("Établissement non spécifié", 400);
  }

  // 5. Verify access
  if (!isGroupAdmin && !accessIds.includes(etabId)) {
    throw new EtabError("Accès refusé à cet établissement", 403);
  }

  return { etabId, userId, isGroupAdmin };
}

/**
 * Lightweight version: resolve etablissement from supabaseAdmin only
 * (for routes that already have their own auth, like invoice imports).
 * Takes userId + headers directly.
 */
export async function resolveEtabId(
  userId: string,
  headers: Headers,
): Promise<{ etabId: string; isGroupAdmin: boolean }> {
  const etabHeader = headers.get("x-etablissement-id");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, etablissements_access")
    .eq("id", userId)
    .single();

  const isGroupAdmin = profile?.role === "group_admin";
  const accessIds: string[] = profile?.etablissements_access ?? [];

  let etabId = etabHeader;
  if (!etabId && accessIds.length === 1) {
    etabId = accessIds[0];
  } else if (!etabId && isGroupAdmin) {
    const { data: first } = await supabaseAdmin
      .from("etablissements")
      .select("id")
      .eq("actif", true)
      .order("nom")
      .limit(1)
      .single();
    etabId = first?.id ?? null;
  }

  if (!etabId) throw new EtabError("Établissement non spécifié", 400);
  if (!isGroupAdmin && !accessIds.includes(etabId)) {
    throw new EtabError("Accès refusé à cet établissement", 403);
  }

  return { etabId, isGroupAdmin };
}

export class EtabError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ── Contrôles d'accès pour les routes qui reçoivent un etablissement_id ──

async function callerProfile(req: NextRequest | Request): Promise<{ userId: string; role: string | null; accessIds: string[] } | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  if (!auth?.user?.id) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, etablissements_access")
    .eq("id", auth.user.id)
    .single();
  return { userId: auth.user.id, role: profile?.role ?? null, accessIds: profile?.etablissements_access ?? [] };
}

/**
 * Refuse (401/403) si l'appelant n'a pas accès à l'établissement demandé
 * en paramètre — les group_admin voient tout. Renvoie null si OK.
 * `roles` restreint en plus aux rôles listés (ex. données RH).
 */
export async function etabAccessDenied(
  req: NextRequest | Request,
  etabId: string,
  roles?: string[],
): Promise<NextResponse | null> {
  const p = await callerProfile(req);
  if (!p) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (roles && !roles.includes(p.role ?? "")) {
    return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
  }
  if (p.role !== "group_admin" && !p.accessIds.includes(etabId)) {
    return NextResponse.json({ error: "Accès refusé à cet établissement" }, { status: 403 });
  }
  return null;
}

/** Refuse (401/403) si l'appelant n'a pas l'un des rôles listés. */
export async function roleDenied(req: NextRequest | Request, roles: string[]): Promise<NextResponse | null> {
  const p = await callerProfile(req);
  if (!p) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!roles.includes(p.role ?? "")) return NextResponse.json({ error: "Accès réservé" }, { status: 403 });
  return null;
}
