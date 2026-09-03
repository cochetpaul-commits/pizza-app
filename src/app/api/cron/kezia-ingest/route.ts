import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { ingestKeziaPdf, type IngestResult } from "@/lib/kezia/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/cron/kezia-ingest — dépôt d'un ou plusieurs journaux de synthèse
 * Kezia (PDF) par un automate (Apps Script côté Gmail/Drive).
 * Auth : `Authorization: Bearer <CRON_SECRET>`.
 * Corps : multipart (champs `file`, un ou plusieurs)
 *      ou JSON { files: [{ name, base64 }] }.
 */
export async function POST(req: NextRequest) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const resultats: (IngestResult & { fichier: string })[] = [];
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const entry of form.getAll("file")) {
      if (!(entry instanceof File)) continue;
      const bytes = new Uint8Array(await entry.arrayBuffer());
      resultats.push({ fichier: entry.name, ...(await ingestKeziaPdf(bytes, entry.name)) });
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { files?: { name?: string; base64?: string }[] };
    for (const f of body.files ?? []) {
      if (!f.base64) continue;
      const bytes = new Uint8Array(Buffer.from(f.base64, "base64"));
      resultats.push({ fichier: f.name ?? "journal.pdf", ...(await ingestKeziaPdf(bytes, f.name ?? "")) });
    }
  }

  if (resultats.length === 0) {
    return NextResponse.json({ ok: false, error: "Aucun fichier reçu (champ `file` ou JSON { files: [{ name, base64 }] })" }, { status: 400 });
  }
  // 422 si rien n'a été écrit (récapitulatif mensuel refusé, PDF illisible) :
  // l'automate voit l'échec ; avec plusieurs fichiers, le détail est par fichier.
  const ecrits = resultats.filter((r) => r.statut === "insere" || r.statut === "mis_a_jour").length;
  return NextResponse.json({ ok: ecrits > 0, ecrits, resultats }, { status: ecrits > 0 ? 200 : 422 });
}
