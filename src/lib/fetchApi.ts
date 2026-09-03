/**
 * Wrapper around fetch() that automatically injects:
 * - x-etablissement-id header (from localStorage)
 * - Authorization: Bearer <token> (from Supabase session)
 *
 * Use this instead of raw fetch() for all /api/* calls.
 */

import { supabase } from "@/lib/supabaseClient";

const LS_KEY = "etab_current_id";

export async function fetchApi(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // Build headers as plain object to avoid iOS Safari issues
  // with new Headers() + FormData body (breaks multipart boundary)
  const existing: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { existing[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) existing[k] = v;
    } else {
      Object.assign(existing, init.headers);
    }
  }

  // Inject etablissement_id from localStorage
  const etabId = typeof window !== "undefined"
    ? localStorage.getItem(LS_KEY)
    : null;
  if (etabId && !existing["x-etablissement-id"]) {
    existing["x-etablissement-id"] = etabId;
  }

  // Inject auth token from Supabase session
  if (!existing["authorization"] && !existing["Authorization"]) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        existing["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch { /* silencieux */ }
  }

  return fetch(url, { ...init, headers: existing });
}

/**
 * Ouvre un fichier servi par /api (PDF…) dans un nouvel onglet, en passant
 * par fetchApi pour porter le jeton (un simple lien n'en a pas).
 * L'onglet est ouvert AVANT l'attente réseau : Safari bloque sinon la popup.
 */
export async function openApiFile(url: string): Promise<void> {
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const res = await fetchApi(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (w) w.location.href = objectUrl; else window.open(objectUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    if (w) w.close();
    alert("Le document n'a pas pu être généré. Réessaie dans un instant.");
  }
}
