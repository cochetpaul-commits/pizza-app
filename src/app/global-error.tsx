"use client";

import { useEffect, useState } from "react";

/**
 * Filet de sécurité quand toute l'app plante côté client (« a client-side
 * exception has occurred »). Cause classique : un vieux service worker ou
 * une page en cache qui référence des chunks d'un ancien déploiement.
 * Premier plantage → on purge service workers + caches et on recharge
 * automatiquement. Si ça replante au rechargement, on affiche un écran
 * clair en français au lieu du message anglais de Next.
 */

const RETRY_KEY = "pizza-app-crash-retry";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [autoRepare, setAutoRepare] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionStorage.getItem(RETRY_KEY)) {
        sessionStorage.setItem(RETRY_KEY, "1");
        try {
          const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
          await Promise.all(regs.map((r) => r.unregister()));
          if (typeof caches !== "undefined") {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch { /* on recharge quand même */ }
        window.location.reload();
        return;
      }
      if (!cancelled) setAutoRepare(false);
    })();
    return () => { cancelled = true; };
  }, [error]);

  const relancer = () => {
    sessionStorage.removeItem(RETRY_KEY);
    window.location.href = "/";
  };

  return (
    <html lang="fr">
      <body style={{
        margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f2ede4", fontFamily: "-apple-system, 'DM Sans', sans-serif",
      }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 380 }}>
          {autoRepare ? (
            <>
              <div style={{ fontSize: 34, marginBottom: 10 }}>🔄</div>
              <h1 style={{ fontSize: 17, color: "#1a1a1a", margin: "0 0 6px" }}>Mise à jour de l&apos;application…</h1>
              <p style={{ color: "#8a8378", fontSize: 13, margin: 0 }}>Rechargement automatique dans un instant.</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 34, marginBottom: 10 }}>😕</div>
              <h1 style={{ fontSize: 17, color: "#1a1a1a", margin: "0 0 6px" }}>L&apos;application a rencontré un problème</h1>
              <p style={{ color: "#8a8378", fontSize: 13, margin: "0 0 16px" }}>
                Réessaie — si ça se reproduit, préviens Paul en indiquant ce que tu faisais.
              </p>
              <button type="button" onClick={relancer} style={{
                padding: "10px 22px", borderRadius: 10, border: "none", background: "#D4775A",
                color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>
                Relancer l&apos;application
              </button>
              {error?.digest && (
                <p style={{ color: "#c5beb2", fontSize: 10, marginTop: 14 }}>code : {error.digest}</p>
              )}
            </>
          )}
        </div>
      </body>
    </html>
  );
}
