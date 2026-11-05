import { createClient } from "@supabase/supabase-js";
import { employeTabletteActif } from "@/lib/tablette/store";

/**
 * Verrou de session sans attente infinie.
 *
 * supabase-js protège le rafraîchissement du jeton par un verrou Web Locks
 * partagé entre onglets. Dans une « web app » Safari (Mac, iPad, iPhone),
 * ce verrou peut rester tenu par une instance zombie : toutes les requêtes
 * Supabase font alors la queue indéfiniment et l'app reste sur
 * « Chargement… » sans envoyer une seule requête (vécu le 31/08 et le 03/09).
 * Ici : on prend le verrou s'il est libre, sinon on continue sans lui —
 * au pire deux onglets rafraîchissent le jeton en même temps, ce que
 * Supabase tolère (fenêtre de réutilisation du refresh token).
 */
async function safeLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  if (typeof navigator === "undefined" || !navigator.locks) return fn();
  let ran = false;
  let result: R | undefined;
  try {
    await navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      ran = true;
      result = await fn();
    });
  } catch {
    if (!ran) return fn();
    throw new Error("lock");
  }
  if (ran) return result as R;
  return fn();
}

/**
 * Tablette (05/11/2026) : chaque écriture en base porte l'employé identifié par son code (en-tête x-employe-id),
 * lu par les déclencheurs de signature (« créée par », « modifiée par »). Seulement vers l'API REST.
 */
const fetchSigne: typeof fetch = (input, init) => {
  const emp = typeof window !== "undefined" ? employeTabletteActif() : null;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!emp?.id || !url.includes("/rest/v1/")) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("x-employe-id", emp.id);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: { fetch: fetchSigne },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: safeLock,
      storage:
        typeof window !== "undefined" && window?.localStorage ? window.localStorage : undefined,
    },
  }
);
