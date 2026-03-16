/** Flat design tokens — used directly as T.xxx in hub pages */
export const T = {
  // Colors
  creme: "#f2ede4",
  terracotta: "#D4775A",
  jaune: "#F5E642",
  jauneDark: "#b8a800",
  dark: "#1a1a1a",
  muted: "#999",
  mutedLight: "#b0a894",
  border: "#ddd6c8",
  white: "#fff",
  green: "#22c55e",

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
  return resto === "piccola-mia" ? T.jaune : T.terracotta;
}

export function accentDarkFor(resto: Restaurant): string {
  return resto === "piccola-mia" ? T.jauneDark : T.terracotta;
}
