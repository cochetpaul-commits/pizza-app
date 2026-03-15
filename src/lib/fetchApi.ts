/**
 * Wrapper around fetch() that automatically injects:
 * - x-etablissement-id header (from localStorage)
 *
 * Use this instead of raw fetch() for all /api/* calls.
 */

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

  return fetch(url, { ...init, headers: existing });
}
