import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pennylane/diagnostic
 * Contrôle sans écriture : pour chaque variable d'environnement candidate,
 * interroge l'API Pennylane et renvoie un échantillon de fournisseurs pour
 * identifier quel dossier (SARL SASHA / SARL I FRATELLI…) la clé lit.
 * Aucune clé n'est renvoyée, seulement présence + résultat.
 */
const CANDIDATES = [
  "PENNYLANE_API_KEY",
  "PENYLANE_API_KEY",
  "PENNYLANE_API_KEY_PICCOLA",
  "PENNYLANE_API_KEY_FRATELLI",
  "PENYLANE_API_KEY_FRATELLI",
];

export async function GET() {
  const out: Record<string, unknown> = {};
  for (const name of CANDIDATES) {
    const key = process.env[name];
    if (!key) { out[name] = { present: false }; continue; }
    try {
      const rep = await fetch("https://app.pennylane.com/api/external/v2/suppliers?limit=5", {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!rep.ok) {
        out[name] = { present: true, ok: false, status: rep.status, body: (await rep.text()).slice(0, 200) };
        continue;
      }
      const data = await rep.json();
      const items = (data?.items ?? []) as { id: number; name?: string }[];
      out[name] = { present: true, ok: true, fournisseurs: items.map((s) => s.name ?? String(s.id)) };
    } catch (e) {
      out[name] = { present: true, ok: false, erreur: e instanceof Error ? e.message.slice(0, 200) : "erreur" };
    }
  }
  return NextResponse.json(out);
}
