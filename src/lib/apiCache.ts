/**
 * Simple in-memory API cache for client-side data.
 * Keeps data alive across page navigations — no refetch when returning to a page.
 * Data expires after `ttl` ms (default 5 minutes).
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

/** Get cached data if still fresh. */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/** Store data in cache. */
export function setCache<T>(key: string, data: T, ttl = 5 * 60 * 1000): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

/** Invalidate a specific key or all keys matching a prefix. */
export function invalidateCache(keyOrPrefix?: string): void {
  if (!keyOrPrefix) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ":")) {
      cache.delete(k);
    }
  }
}

/**
 * Fetch with cache. Returns cached data instantly if available,
 * otherwise fetches and caches.
 */
export async function cachedFetch<T>(
  url: string,
  opts?: { ttl?: number; forceRefresh?: boolean },
): Promise<T> {
  const ttl = opts?.ttl ?? 5 * 60 * 1000;

  if (!opts?.forceRefresh) {
    const cached = getCached<T>(url);
    if (cached) return cached;
  }

  const res = await fetch(url);
  const data = await res.json();
  setCache(url, data, ttl);
  return data as T;
}
