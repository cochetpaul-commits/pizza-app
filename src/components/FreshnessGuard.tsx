"use client";

import { useEffect } from "react";

/**
 * Garde-fraîcheur PWA : après un déploiement, l'app ouverte sur téléphone
 * garde en mémoire des fichiers qui n'existent plus sur le serveur — au
 * retour au premier plan, plus rien ne répond (menu vide, écran figé).
 *
 *  1. Au retour au premier plan (et toutes les 15 min), on compare la
 *     version du serveur à celle chargée : différente → rechargement.
 *  2. Si un fichier de l'app (/_next/…) ne se charge plus → rechargement.
 * Anti-boucle : au plus un rechargement automatique par minute.
 */
const RELOAD_KEY = "pizza-app-fresh-reload";

function safeReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { /* stockage indisponible : recharger quand même */ }
  window.location.reload();
}

export function FreshnessGuard() {
  useEffect(() => {
    let initial: string | null = null;
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await res.json()) as { v?: string };
        if (cancelled || !v || v === "dev") return;
        if (initial == null) { initial = v; return; }
        if (v !== initial) safeReload();
      } catch { /* hors ligne : on réessaiera */ }
    };

    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    // Restauration depuis le cache navigateur (retour PWA) : re-vérifier aussi
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check(); };
    window.addEventListener("pageshow", onPageShow);
    const timer = window.setInterval(check, 15 * 60_000);

    // Échec de chargement d'un chunk Next (script ou CSS) → app périmée
    const onResourceError = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const src = (t as HTMLScriptElement | null)?.src ?? (t as HTMLLinkElement | null)?.href ?? "";
      if (typeof src === "string" && src.includes("/_next/")) safeReload();
    };
    window.addEventListener("error", onResourceError, true);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("error", onResourceError, true);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
