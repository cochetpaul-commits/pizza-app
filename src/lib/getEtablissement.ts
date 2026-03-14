import { NextRequest } from "next/server";
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
