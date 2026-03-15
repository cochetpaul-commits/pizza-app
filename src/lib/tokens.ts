export const TOKENS = {
  color: {
    creme: "#f2ede4",
    terracotta: "#D4775A",
    jaune: "#F5E642",
    jauneDark: "#b8a800",
    dark: "#1a1a1a",
    muted: "#999",
    border: "#ddd6c8",
    white: "#fff",
    green: "#22c55e",
  },
  pattern: {
    stripedPM:
      "repeating-linear-gradient(90deg, #fff 0px, #fff 10px, #FAF0A0 10px, #FAF0A0 20px)",
  },
  font: {
    oswald: "var(--font-oswald), 'Oswald', sans-serif",
    body: "var(--font-dm-sans), 'DM Sans', sans-serif",
    display: "var(--font-cormorant), 'Cormorant Garamond', serif",
  },
  tile: {
    borderRadius: 14,
    shadow: "0 2px 8px rgba(0,0,0,0.04)",
    padding: "18px 20px",
  },
} as const;

export type Restaurant = "bello-mio" | "piccola-mia";

export function accentFor(resto: Restaurant): string {
  return resto === "piccola-mia" ? TOKENS.color.jaune : TOKENS.color.terracotta;
}

export function accentDarkFor(resto: Restaurant): string {
  return resto === "piccola-mia" ? TOKENS.color.jauneDark : TOKENS.color.terracotta;
}
