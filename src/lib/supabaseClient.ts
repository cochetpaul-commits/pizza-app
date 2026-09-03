import { createClient } from "@supabase/supabase-js";

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

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
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
