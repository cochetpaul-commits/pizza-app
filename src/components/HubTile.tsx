"use client";

import Link from "next/link";
import React from "react";
import { TOKENS } from "@/lib/tokens";

type HubTileProps = {
  href: string;
  icon?: string;
  label: string;
  sub?: string;
  accent?: string;
  count?: string;
  badge?: string;
};

export function HubTile({ href, icon, label, sub, accent = TOKENS.color.terracotta, count, badge }: HubTileProps) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          background: TOKENS.color.white,
          borderRadius: TOKENS.tile.borderRadius,
          padding: TOKENS.tile.padding,
          boxShadow: TOKENS.tile.shadow,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          transition: "transform 0.15s ease",
          animation: "slideUp 0.3s ease both",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateX(4px)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateX(0)"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {icon && (
            <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
          )}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: TOKENS.font.oswald,
                color: TOKENS.color.dark,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}>
                {label}
              </p>
              {badge && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 6,
                  background: `${accent}18`,
                  color: accent,
                }}>
                  {badge}
                </span>
              )}
            </div>
            {sub && (
              <p style={{ margin: "3px 0 0", fontSize: 12, color: TOKENS.color.muted }}>
                {sub}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {count && (
            <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{count}</span>
          )}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            height: 28,
            padding: "0 12px",
            borderRadius: 20,
            background: `${accent}14`,
            border: `1px solid ${accent}30`,
            color: accent,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}>
            Ouvrir &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
