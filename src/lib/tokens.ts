/** Flat design tokens — used directly as T.xxx in hub pages */
export const T = {
  // Colors (updated brief Komia)
  creme: "#f6eedf",
  cremeLegacy: "#f2ede4",
  terracotta: "#e27f57",
  jaune: "#efd199",
  jauneDark: "#a8893a",
  dark: "#1a1a1a",
  muted: "#999",
  mutedLight: "#b0a894",
  border: "#ddd6c8",
  white: "#fff",
  green: "#22c55e",

  // Brand
  sidebar: "#1a1512",
  ifratelli: "#b45f57",
  belloMio: "#e27f57",
  piccolaMia: "#5B8EAE",

  // Section accents
  sauge: "#4a6741",       // achats, approvisionnement
  dore: "#b8860b",        // prix & marges, finances
  bleu: "#2563eb",        // RH
  ardoise: "#64748b",     // admin
  violet: "#7B1FA2",      // evenements

  // Shadows
  tileShadow: "0 2px 8px rgba(0,0,0,0.04)",
  tileShadowHover: "0 4px 16px rgba(0,0,0,0.08)",

  // Patterns
  stripedPM:
    "repeating-linear-gradient(90deg, #fff 0px, #fff 10px, #FAF0A0 10px, #FAF0A0 20px)",
} as const;

/** Nested tokens — backward compat for existing code */
export const TOKENS = {
  color: {
    creme: T.creme,
    terracotta: T.terracotta,
    jaune: T.jaune,
    jauneDark: T.jauneDark,
    dark: T.dark,
    muted: T.muted,
    border: T.border,
    white: T.white,
    green: T.green,
  },
  pattern: {
    stripedPM: T.stripedPM,
  },
  font: {
    oswald: "var(--font-oswald), 'Oswald', sans-serif",
    body: "var(--font-dm-sans), 'DM Sans', sans-serif",
    display: "var(--font-cormorant), 'Cormorant Garamond', serif",
  },
  tile: {
    borderRadius: 14,
    shadow: T.tileShadow,
    padding: "18px 20px",
  },
} as const;

export type Restaurant = "bello-mio" | "piccola-mia";

export function accentFor(resto: Restaurant): string {
  return resto === "piccola-mia" ? T.piccolaMia : T.belloMio;
}

export function accentDarkFor(resto: Restaurant): string {
  return resto === "piccola-mia" ? T.piccolaMia : T.belloMio;
}
