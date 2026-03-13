/**
 * Wrapper around fetch() that automatically injects:
 * - x-etablissement-id header (from localStorage)
 * - Authorization header (from Supabase session)
 *
 * Use this instead of raw fetch() for all /api/* calls.
 */

const LS_KEY = "etab_current_id";

export async function fetchApi(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  // Inject etablissement_id from localStorage
  const etabId = typeof window !== "undefined"
    ? localStorage.getItem(LS_KEY)
    : null;
  if (etabId && !headers.has("x-etablissement-id")) {
    headers.set("x-etablissement-id", etabId);
  }

  return fetch(url, { ...init, headers });
}
