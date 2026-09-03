import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { ingestKeziaPdf, datesDejaImportees, type IngestResult } from "@/lib/kezia/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/kezia-drive — va chercher dans Google Drive les journaux de
 * synthèse Kezia (JOURNAL_YYYY-MM-DD.pdf) déposés par l'Apps Script
 * « Journaux Piccola Mia vers Drive », et importe ceux qui manquent.
 *
 * Arborescence attendue : <dossier racine> / <année> / <MM - Mois> / JOURNAL_*.pdf
 * Config : KEZIA_DRIVE_FOLDER_ID (dossier racine ou dossier année, partagé
 * « tous les utilisateurs disposant du lien ») et GOOGLE_DRIVE_API_KEY.
 * ?days=N : ne regarde que les N derniers jours (défaut 10, max 400).
 */
const DRIVE = "https://www.googleapis.com/drive/v3";

type DriveFile = { id: string; name: string; mimeType: string };

async function listChildren(folderId: string, key: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const url = `${DRIVE}/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=200&key=${key}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Drive ${res.status} : ${(await res.text()).slice(0, 160)}`);
    const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(json.files ?? []));
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** Tous les PDF JOURNAL_* sous un dossier, en descendant les sous-dossiers (année / mois). */
async function collectJournaux(folderId: string, key: string, depth = 0): Promise<DriveFile[]> {
  const children = await listChildren(folderId, key);
  const files: DriveFile[] = [];
  for (const c of children) {
    if (c.mimeType === "application/vnd.google-apps.folder") {
      if (depth < 3) files.push(...(await collectJournaux(c.id, key, depth + 1)));
    } else if (/^JOURNAL_\d{4}-\d{2}-\d{2}\.pdf$/i.test(c.name)) {
      files.push(c);
    }
  }
  return files;
}

export async function GET(req: NextRequest) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const key = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = process.env.KEZIA_DRIVE_FOLDER_ID;
  if (!key || !folderId) {
    return NextResponse.json({ ok: false, error: "GOOGLE_DRIVE_API_KEY / KEZIA_DRIVE_FOLDER_ID non configurés — dépôt via /api/cron/kezia-ingest en attendant" }, { status: 200 });
  }
  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "10", 10) || 10, 1), 400);
  const depuis = new Date(); depuis.setDate(depuis.getDate() - days);
  const depuisIso = depuis.toISOString().slice(0, 10);

  try {
    const [journaux, deja] = await Promise.all([collectJournaux(folderId, key), datesDejaImportees()]);
    const aFaire = journaux
      .map((f) => ({ ...f, date: f.name.slice(8, 18) }))
      .filter((f) => f.date >= depuisIso && !deja.has(f.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const resultats: (IngestResult & { fichier: string })[] = [];
    for (const f of aFaire.slice(0, 40)) {
      const res = await fetch(`${DRIVE}/files/${f.id}?alt=media&key=${key}`, { cache: "no-store" });
      if (!res.ok) { resultats.push({ fichier: f.name, date: f.date, statut: "erreur", detail: `téléchargement ${res.status}` }); continue; }
      const bytes = new Uint8Array(await res.arrayBuffer());
      resultats.push({ fichier: f.name, ...(await ingestKeziaPdf(bytes, f.name)) });
    }
    return NextResponse.json({
      ok: true, periode_depuis: depuisIso, journaux_sur_drive: journaux.length, deja_importes: deja.size,
      traites: resultats.length, restants: Math.max(0, aFaire.length - resultats.length), resultats,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
  }
}
