import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export type UserRole = "admin" | "direction" | "cuisine";

export interface AuthResult {
  supabase: SupabaseClient;
  userId: string;
  role: UserRole;
}

/**
 * Authenticate the request and return a Supabase client scoped to the user,
 * along with userId and role. Returns a NextResponse on failure.
 */
export async function authenticateRequest(
  req: Request
): Promise<AuthResult | NextResponse> {
  const supabase = createClient(
    getEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        headers: { Authorization: req.headers.get("authorization") ?? "" },
      },
    }
  );

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user?.id) {
    return NextResponse.json(
      { ok: false, error: authErr?.message ?? "Non authentifié." },
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  const role = (profile?.role ?? "cuisine") as UserRole;

  return { supabase, userId: auth.user.id, role };
}
