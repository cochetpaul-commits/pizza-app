import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Version du build en production — sert au rechargement auto des PWA périmées. */
export async function GET() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";
  // État de configuration (jamais de valeur secrète : présence + 6 premiers
  // caractères de la clé publique push, cuite dans l'app au build)
  const config = {
    cron: !!process.env.CRON_SECRET,
    vapid: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").slice(0, 6) || null,
    vapid_prive: !!process.env.VAPID_PRIVATE_KEY,
    drive_kezia: !!(process.env.GOOGLE_DRIVE_API_KEY && process.env.KEZIA_DRIVE_FOLDER_ID),
    pennylane_piccola: !!(process.env.PENNYLANE_API_KEY_PICCOLA ?? process.env.PENYLANE_API_KEY),
  };
  return NextResponse.json({ v, config }, { headers: { "Cache-Control": "no-store" } });
}
