"use client";

import { useEffect, useState } from "react";

/**
 * Page d'installation de l'application — publique, à partager tel quel :
 * elle détecte l'appareil et guide vers la bonne méthode.
 * iOS n'autorise pas l'installation en un clic (limite d'Apple) : on
 * affiche le pas-à-pas Safari. Android/Chrome : vrai bouton Installer
 * via l'événement beforeinstallprompt.
 */

type Platform = "ios" | "android" | "desktop";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: "20px 22px",
  border: "1px solid #ddd6c8", marginBottom: 14, textAlign: "left",
};

function Etape({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
      <span style={{
        width: 26, height: 26, borderRadius: "50%", background: "#D4775A", color: "#fff",
        fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{n}</span>
      <div style={{ fontSize: 14.5, color: "#1a1a1a", lineHeight: 1.5, paddingTop: 2 }}>{children}</div>
    </div>
  );
}

export default function InstallerPage() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [dejaInstallee, setDejaInstallee] = useState(false);
  const [promptEvt, setPromptEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installee, setInstallee] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlatform(ios ? "ios" : /Android/.test(ua) ? "android" : "desktop");
    if (window.matchMedia("(display-mode: standalone)").matches) setDejaInstallee(true);

    const onPrompt = (e: Event) => { e.preventDefault(); setPromptEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => setInstallee(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installer = async () => {
    if (!promptEvt) return;
    await promptEvt.prompt();
    const { outcome } = await promptEvt.userChoice;
    if (outcome === "accepted") setInstallee(true);
    setPromptEvt(null);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#f2ede4",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "40px 18px 60px", boxSizing: "border-box",
    }}>
      <img src="/icons/icon-192.png" alt="" width={84} height={84}
        style={{ borderRadius: 20, boxShadow: "0 6px 24px rgba(0,0,0,0.12)", marginBottom: 16 }} />
      <h1 style={{
        fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700,
        letterSpacing: 1, color: "#1a1a1a", margin: "0 0 4px", textTransform: "uppercase",
      }}>
        iFratelli
      </h1>
      <p style={{ fontSize: 13.5, color: "#8a8378", margin: "0 0 26px", textAlign: "center", maxWidth: 340 }}>
        L&apos;application de Bello Mio &amp; Piccola Mia — installe-la sur ton téléphone pour l&apos;avoir toujours sous la main.
      </p>

      <div style={{ width: "100%", maxWidth: 430 }}>
        {(dejaInstallee || installee) && (
          <div style={{ ...card, textAlign: "center", borderColor: "rgba(45,106,79,0.35)", background: "rgba(45,106,79,0.05)" }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#2D6A4F", marginBottom: 10 }}>
              L&apos;application est installée
            </div>
            <a href="/login" style={{
              display: "inline-block", padding: "11px 26px", borderRadius: 10, background: "#D4775A",
              color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 700,
            }}>Se connecter</a>
          </div>
        )}

        {!dejaInstallee && !installee && platform === "ios" && (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>
               Sur iPhone / iPad
            </div>
            <Etape n={1}>Ouvre cette page dans <strong>Safari</strong> (ça ne marche pas depuis Chrome ou l&apos;app Mail — copie le lien dans Safari si besoin).</Etape>
            <Etape n={2}>Touche le bouton <strong>Partager</strong> <span style={{ display: "inline-block", transform: "translateY(2px)" }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </span> en bas de l&apos;écran.</Etape>
            <Etape n={3}>Fais défiler et touche <strong>« Sur l&apos;écran d&apos;accueil »</strong> puis <strong>Ajouter</strong>.</Etape>
            <div style={{ fontSize: 12, color: "#8a8378", marginTop: 4 }}>
              L&apos;icône iFratelli apparaît sur l&apos;écran d&apos;accueil, comme une vraie app.
            </div>
          </div>
        )}

        {!dejaInstallee && !installee && platform === "android" && (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>
              🤖 Sur Android
            </div>
            {promptEvt ? (
              <button type="button" onClick={installer} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: "#D4775A", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>
                Installer l&apos;application
              </button>
            ) : (
              <>
                <Etape n={1}>Ouvre cette page dans <strong>Chrome</strong>.</Etape>
                <Etape n={2}>Touche le menu <strong>⋮</strong> en haut à droite.</Etape>
                <Etape n={3}>Touche <strong>« Installer l&apos;application »</strong> (ou « Ajouter à l&apos;écran d&apos;accueil »).</Etape>
              </>
            )}
          </div>
        )}

        {!dejaInstallee && !installee && platform === "desktop" && (
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>
              💻 Sur ordinateur
            </div>
            {promptEvt ? (
              <button type="button" onClick={installer} style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: "#D4775A", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>
                Installer l&apos;application
              </button>
            ) : (
              <>
                <Etape n={1}><strong>Chrome / Edge :</strong> clique sur l&apos;icône d&apos;installation
                  <span style={{ display: "inline-block", margin: "0 4px", transform: "translateY(3px)" }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </span>
                  à droite de la barre d&apos;adresse.</Etape>
                <Etape n={2}><strong>Safari (Mac) :</strong> menu Fichier → <strong>« Ajouter au Dock »</strong>.</Etape>
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <a href="/login" style={{ fontSize: 13, color: "#8a8378", textDecoration: "underline" }}>
            Continuer sans installer
          </a>
        </div>
      </div>
    </div>
  );
}
