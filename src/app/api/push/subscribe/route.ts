import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * POST /api/push/subscribe
 * Register a push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function POST(req: NextRequest) {
  let userId: string;
  try {
    ({ userId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "endpoint et keys requis" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/push/subscribe
 * Unregister a push subscription.
 * Body: { endpoint }
 */
export async function DELETE(req: NextRequest) {
  let userId: string;
  try {
    ({ userId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { endpoint } = await req.json();
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint requis" }, { status: 400 });
  }

  await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}
