import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Version du build en production — sert au rechargement auto des PWA périmées. */
export async function GET() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
