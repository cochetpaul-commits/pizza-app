"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ── Constantes ──────────────────────────────────────────────── */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
// Lettres rarement jouées au petit bac : exclues par défaut
const EXCLUDED_DEFAULT = ["K", "Q", "W", "X", "Y", "Z"];
const TIMER_OPTIONS = [0, 60, 90, 120, 180];
const STORAGE_KEY = "petit-bac-settings-v1";

const ACCENT = "#D4775A";
const CREME = "#f2ede4";
const DARK = "#1a1a1a";
const BORDER = "#ddd6c8";
const MUTED = "#999";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";

type Settings = { excluded: string[]; noRepeat: boolean; timer: number };

const DEFAULT_SETTINGS: Settings = { excluded: EXCLUDED_DEFAULT, noRepeat: true, timer: 0 };

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded.filter(l => ALPHABET.includes(l)) : EXCLUDED_DEFAULT,
      noRepeat: typeof parsed.noRepeat === "boolean" ? parsed.noRepeat : true,
      timer: TIMER_OPTIONS.includes(parsed.timer ?? -1) ? (parsed.timer as number) : 0,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/* ── Styles ──────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16,
  padding: 16, marginBottom: 16,
};

const sectionTitle: React.CSSProperties = {
  fontFamily: OSWALD, fontSize: 13, fontWeight: 700, letterSpacing: 1,
  textTransform: "uppercase", color: DARK, margin: "0 0 10px",
};

const pill = (active: boolean, disabled = false): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  border: `1px solid ${active ? ACCENT : BORDER}`,
  background: active ? ACCENT : "#fff", color: active ? "#fff" : DARK,
  cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  opacity: disabled ? 0.5 : 1,
});

/* ── Page ────────────────────────────────────────────────────── */

export default function PetitBacPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [display, setDisplay] = useState<string>("?");
  const [spinning, setSpinning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const spinTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShown = useRef<string>("?");

  /* Chargement / sauvegarde des réglages */
  useEffect(() => {
    // Lecture localStorage après montage (évite un mismatch d'hydratation SSR)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings, settingsLoaded]);

  /* Nettoyage des timers au démontage */
  useEffect(() => () => {
    if (spinTimeout.current) clearTimeout(spinTimeout.current);
    if (tickInterval.current) clearInterval(tickInterval.current);
  }, []);

  /* Lettres disponibles pour le tirage */
  const pool = useMemo(() => {
    const base = ALPHABET.filter(l => !settings.excluded.includes(l));
    return settings.noRepeat ? base.filter(l => !history.includes(l)) : base;
  }, [settings.excluded, settings.noRepeat, history]);

  const exhausted = pool.length === 0;

  /* Chrono */
  const stopTimer = useCallback(() => {
    if (tickInterval.current) { clearInterval(tickInterval.current); tickInterval.current = null; }
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    setRemaining(seconds);
    tickInterval.current = setInterval(() => {
      setRemaining(prev => {
        if (prev === null) return null;
        if (prev <= 1) { stopTimer(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  /* Tirage avec effet « roue » qui ralentit */
  const draw = useCallback(() => {
    if (spinning || exhausted) return;
    const target = pool[Math.floor(Math.random() * pool.length)];
    const visible = ALPHABET.filter(l => !settings.excluded.includes(l));
    setSpinning(true);
    setCurrent(null);
    stopTimer();
    setRemaining(null);

    let delay = 40;
    let elapsed = 0;
    const total = 1400;
    const step = () => {
      elapsed += delay;
      if (elapsed >= total) {
        setDisplay(target);
        setCurrent(target);
        setSpinning(false);
        setHistory(h => [...h, target]);
        if (settings.timer > 0) startTimer(settings.timer);
        return;
      }
      let next = visible[Math.floor(Math.random() * visible.length)];
      // évite d'afficher deux fois la même lettre d'affilée pendant la rotation
      if (visible.length > 1 && next === lastShown.current) next = visible[(visible.indexOf(next) + 1) % visible.length];
      lastShown.current = next;
      setDisplay(next);
      delay = Math.min(220, Math.round(delay * 1.12));
      spinTimeout.current = setTimeout(step, delay);
    };
    step();
  }, [spinning, exhausted, pool, settings.excluded, settings.timer, stopTimer, startTimer]);

  const reset = () => {
    if (spinTimeout.current) clearTimeout(spinTimeout.current);
    stopTimer();
    setSpinning(false);
    setHistory([]);
    setCurrent(null);
    setDisplay("?");
    setRemaining(null);
  };

  const toggleExcluded = (l: string) => {
    setSettings(s => ({
      ...s,
      excluded: s.excluded.includes(l) ? s.excluded.filter(x => x !== l) : [...s.excluded, l],
    }));
  };

  /* Barre espace = tirage */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      draw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draw]);

  const timerDone = remaining === 0;
  const timerColor = timerDone ? "#DC2626" : remaining !== null && remaining <= 10 ? "#b45309" : DARK;

  /* ── Rendu ────────────────────────────────────────────────── */

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>
      <h1 style={{ fontFamily: OSWALD, fontSize: 22, fontWeight: 700, letterSpacing: 1, color: DARK, margin: "0 0 4px" }}>
        Petit bac
      </h1>
      <p style={{ fontSize: 12, color: MUTED, margin: "0 0 16px" }}>
        Tire une lettre au hasard pour lancer la manche. Barre espace pour tirer.
      </p>

      {/* ── Tirage ── */}
      <div style={{ ...card, textAlign: "center", padding: "28px 16px 20px" }}>
        <div
          aria-live="polite"
          style={{
            width: 180, height: 180, margin: "0 auto 18px",
            borderRadius: 24, background: CREME,
            border: `2px solid ${current ? ACCENT : BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: OSWALD, fontWeight: 700, fontSize: 120, lineHeight: 1,
            color: current ? ACCENT : spinning ? DARK : MUTED,
            transition: "border-color 0.2s ease, color 0.2s ease",
            userSelect: "none",
          }}
        >
          {display}
        </div>

        {remaining !== null && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: OSWALD, fontSize: 34, fontWeight: 700, color: timerColor, lineHeight: 1 }}>
              {fmtTime(remaining)}
            </div>
            <div style={{ fontSize: 12, color: timerDone ? "#DC2626" : MUTED, marginTop: 4, fontWeight: timerDone ? 600 : 400 }}>
              {timerDone ? "Temps écoulé, posez vos stylos" : "Temps restant"}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={draw}
            disabled={spinning || exhausted}
            style={{
              padding: "12px 28px", borderRadius: 20, border: "none",
              background: spinning || exhausted ? "#c9b9ad" : ACCENT, color: "#fff",
              fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
              cursor: spinning || exhausted ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {spinning ? "Tirage..." : exhausted ? "Plus de lettres" : current ? "Nouvelle lettre" : "Tirer une lettre"}
          </button>
          {remaining !== null && !timerDone && (
            <button
              type="button"
              onClick={() => { stopTimer(); setRemaining(null); }}
              style={{
                padding: "12px 20px", borderRadius: 20, border: `1px solid ${BORDER}`,
                background: "#fff", color: DARK, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Stopper le chrono
            </button>
          )}
        </div>

        {exhausted && (
          <p style={{ fontSize: 12, color: MUTED, margin: "12px 0 0" }}>
            Toutes les lettres disponibles ont été tirées. Réinitialise la partie ou autorise les répétitions.
          </p>
        )}
      </div>

      {/* ── Historique ── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Lettres tirées ({history.length})</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={reset}
              style={{
                background: "none", border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: "5px 10px", fontSize: 12, color: DARK, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Nouvelle partie
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Aucune lettre tirée pour l&apos;instant.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {history.map((l, i) => (
              <span
                key={`${l}-${i}`}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontFamily: OSWALD, fontWeight: 700, fontSize: 16,
                  background: i === history.length - 1 ? ACCENT : CREME,
                  color: i === history.length - 1 ? "#fff" : DARK,
                }}
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Réglages ── */}
      <div style={card}>
        <button
          type="button"
          onClick={() => setShowSettings(v => !v)}
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
            background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <span style={{ ...sectionTitle, margin: 0 }}>Réglages</span>
          <span style={{ fontSize: 12, color: MUTED }}>
            {ALPHABET.length - settings.excluded.length} lettres
            {settings.noRepeat ? " · sans répétition" : ""}
            {settings.timer > 0 ? ` · ${fmtTime(settings.timer)}` : ""}
            {showSettings ? "  ▴" : "  ▾"}
          </span>
        </button>

        {showSettings && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 8px" }}>
              Lettres jouées (clique pour exclure ou réactiver une lettre)
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {ALPHABET.map(l => {
                const active = !settings.excluded.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleExcluded(l)}
                    aria-pressed={active}
                    style={{
                      width: 36, height: 36, borderRadius: 8,
                      border: `1px solid ${active ? ACCENT : BORDER}`,
                      background: active ? "#fff" : CREME,
                      color: active ? DARK : MUTED,
                      textDecoration: active ? "none" : "line-through",
                      fontFamily: OSWALD, fontWeight: 700, fontSize: 15,
                      cursor: "pointer",
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => setSettings(s => ({ ...s, excluded: EXCLUDED_DEFAULT }))} style={pill(false)}>
                Classique (sans K Q W X Y Z)
              </button>
              <button type="button" onClick={() => setSettings(s => ({ ...s, excluded: [] }))} style={pill(false)}>
                Tout l&apos;alphabet
              </button>
            </div>

            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 8px" }}>Répétition</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => setSettings(s => ({ ...s, noRepeat: true }))} style={pill(settings.noRepeat)}>
                Chaque lettre une seule fois
              </button>
              <button type="button" onClick={() => setSettings(s => ({ ...s, noRepeat: false }))} style={pill(!settings.noRepeat)}>
                Avec remise
              </button>
            </div>

            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 8px" }}>Chrono lancé au tirage</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TIMER_OPTIONS.map(t => (
                <button key={t} type="button" onClick={() => setSettings(s => ({ ...s, timer: t }))} style={pill(settings.timer === t)}>
                  {t === 0 ? "Sans chrono" : fmtTime(t)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
