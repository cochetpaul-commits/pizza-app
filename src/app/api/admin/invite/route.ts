import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function getCallerRole(req: NextRequest): Promise<string | null> {
  // Try Authorization header first
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await userClient.auth.getUser(token);
    if (data.user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      return profile?.role ?? null;
    }
  }

  // Try cookie-based auth (for client-side fetch without explicit token)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sbAccessToken = cookieHeader
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith("sb-") && c.includes("-auth-token"))
    ?.split("=")[1];

  if (sbAccessToken) {
    try {
      const decoded = JSON.parse(decodeURIComponent(sbAccessToken));
      const token = decoded?.[0] ?? decoded?.access_token ?? sbAccessToken;
      const userClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data } = await userClient.auth.getUser(token);
      if (data.user) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();
        return profile?.role ?? null;
      }
    } catch { /* ignore parse errors */ }
  }

  return null;
}

/** POST — invite a new user by email */
export async function POST(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "admin" && callerRole !== "group_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, role, displayName } = body as { email?: string; role?: string; displayName?: string };

  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  // Normalize role for Supabase profile
  const profileRole = role ?? "employe";

  // Invite user — use production URL, never localhost
  const reqOrigin = new URL(req.url).origin;
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || (reqOrigin.includes("localhost") ? "https://pizza-app.vercel.app" : reqOrigin);
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email, role: profileRole },
    redirectTo: `${origin}/auth/setup-password`,
  });

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 });

  // Update profile role
  if (inviteData.user) {
    await supabaseAdmin
      .from("profiles")
      .update({ role: profileRole, display_name: displayName || email, updated_at: new Date().toISOString() })
      .eq("id", inviteData.user.id);
  }

  return NextResponse.json({ ok: true, userId: inviteData.user?.id });
}
