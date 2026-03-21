import type { CSSProperties } from "react";

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 9px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
};

export const ESTAB_CONFIG = {
  bellomio: { bg: "rgba(226,127,87,0.1)", color: "#e27f57", label: "Bello Mio",   short: "BM"    },
  piccola:  { bg: "rgba(239,209,153,0.2)", color: "#a8893a", label: "Piccola Mia", short: "PM"    },
  both:     { bg: "#F3F4F6", color: "#6B7280", label: "Les deux",    short: "BM·PM" },
} as const;

type EstabKey = keyof typeof ESTAB_CONFIG;

export function EstabBadge({ estab, short = false }: { estab: EstabKey; short?: boolean }) {
  const c = ESTAB_CONFIG[estab];
  return <span style={{ ...BASE, background: c.bg, color: c.color }}>{short ? c.short : c.label}</span>;
}

/**
 * Renders establishment badge(s) for a given establishments array.
 * - Both establishments → no badge (implicit default, no need to show)
 * - Single establishment → one badge
 */
export function EstabBadges({
  establishments,
  short = false,
}: {
  establishments: string[] | null | undefined;
  short?: boolean;
}) {
  const e = establishments ?? ["bellomio", "piccola"];
  const hasBM = e.includes("bellomio");
  const hasPM = e.includes("piccola");
  if (hasBM && hasPM) return null;
  return (
    <>
      {hasBM && <EstabBadge estab="bellomio" short={short} />}
      {hasPM && <EstabBadge estab="piccola" short={short} />}
    </>
  );
}
