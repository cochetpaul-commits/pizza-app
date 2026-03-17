import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getCallerRole(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await userClient.auth.getUser(token);
  if (!data.user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile?.role ?? null;
}

/** POST — invite a new user by email */
export async function POST(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "admin" && callerRole !== "group_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { email, role, displayName } = body as { email?: string; role?: string; displayName?: string };

  if (!email || !role || !["group_admin", "cuisine", "salle"].includes(role)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  // Invite user
  const origin = new URL(req.url).origin;
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email, role },
    redirectTo: `${origin}/auth/setup-password`,
  });

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Update profile role (trigger creates it with default 'cuisine')
  if (inviteData.user) {
    await supabaseAdmin
      .from("profiles")
      .update({ role, display_name: displayName || email, updated_at: new Date().toISOString() })
      .eq("id", inviteData.user.id);
  }

  return NextResponse.json({ ok: true, userId: inviteData.user?.id });
}
