import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Verify caller is admin via their JWT */
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

/** GET — list all users with profiles */
export async function GET(req: NextRequest) {
  const role = await getCallerRole(req);
  if (role !== "group_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch emails from auth.users
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map<string, string>();
  for (const u of authData?.users ?? []) {
    emailMap.set(u.id, u.email ?? "");
  }

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    role: p.role,
    displayName: p.display_name,
    email: emailMap.get(p.id) ?? "",
    createdAt: p.created_at,
  }));

  return NextResponse.json({ users });
}

/** PATCH — update user role */
export async function PATCH(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "group_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId, role } = body as { userId?: string; role?: string };
  if (!userId || !role || !["group_admin", "equipier"].includes(role)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PUT — send password reset email to a user */
export async function PUT(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "group_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId } = body as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Get user email from auth
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userErr || !userData.user?.email) {
    return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }

  const reqOrigin = new URL(req.url).origin;
  const origin = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || (reqOrigin.includes("localhost") ? "https://pizza-app.vercel.app" : reqOrigin);

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(userData.user.email, {
    redirectTo: `${origin}/auth/callback`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, email: userData.user.email });
}

/** DELETE — delete user */
export async function DELETE(req: NextRequest) {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "group_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { userId } = body as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  // Delete auth user (cascade deletes profile)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
