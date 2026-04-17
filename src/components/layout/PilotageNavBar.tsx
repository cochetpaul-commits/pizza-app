"use client";

import { useRouter, usePathname } from "next/navigation";
import type { DateRange } from "@/components/ui/DateRangePicker";

type PilotageNavBarProps = {
  range: DateRange;
  onRangeChange?: (r: DateRange) => void;
  accent?: string;
};

const ACCENT = "#D4775A";

const TABS = [
  { label: "Ventes", href: "/ventes", match: (p: string) => p === "/ventes" },
  { label: "Produits", href: "/ventes/marges", match: (p: string) => p === "/ventes/marges" },
  { label: "Masse sal.", href: "/rh/masse-salariale", match: (p: string) => p.startsWith("/rh/masse-salariale") || p === "/ventes/simulation" },
  { label: "Trésorerie", href: "/tresorerie", match: (p: string) => p.startsWith("/tresorerie") },
];

export function PilotageNavBar({ range, accent = ACCENT }: PilotageNavBarProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  // Navigate to another pilotage page, preserving the date range in URL
  const goTo = (href: string) => {
    const url = `${href}?from=${range.from}&to=${range.to}`;
    router.push(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      {/* Toggle de navigation entre les pages Pilotage */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{
          display: "inline-flex", gap: 4, padding: 4,
          background: "#f0ebe2", borderRadius: 12,
          border: "1px solid #e8e0d0",
          maxWidth: "100%", overflowX: "auto",
        }}>
          {TABS.map(t => {
            const active = t.match(pathname);
            return (
              <button
                key={t.href}
                type="button"
                onClick={() => !active && goTo(t.href)}
                style={{
                  padding: "7px 14px", borderRadius: 10, border: "none",
                  background: active ? "#fff" : "transparent",
                  color: active ? accent : "#777",
                  fontSize: 12, fontWeight: 700,
                  cursor: active ? "default" : "pointer",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  whiteSpace: "nowrap",
                  fontFamily: "inherit",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
