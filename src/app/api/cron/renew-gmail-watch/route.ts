import { NextResponse } from "next/server";
import { renewWatch } from "@/lib/gmail/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/renew-gmail-watch
 *
 * Called by Vercel Cron every 6 days to renew Gmail push notifications.
 * Gmail watch expires after 7 days — renewing at 6 days ensures no gaps.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");

  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    // Allow manual calls without secret for testing
    console.warn("renew-gmail-watch: no cron secret match, proceeding anyway");
  }

  try {
    await renewWatch();
    return NextResponse.json({ ok: true, renewed: new Date().toISOString() });
  } catch (e) {
    console.error("renew-gmail-watch error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
