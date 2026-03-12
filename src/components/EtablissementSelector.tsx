"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";

export function EtablissementSelector() {
  const { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin, loading } = useEtablissement();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Don't render while loading or if no establishments exist (migration not run yet)
  if (loading || etablissements.length === 0) return null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Single establishment, no dropdown needed
  if (etablissements.length <= 1 && !isGroupAdmin) {
    if (!current) return null;
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        color: current.couleur,
        background: `${current.couleur}12`,
        border: `1px solid ${current.couleur}30`,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: current.couleur }} />
        {current.nom}
      </span>
    );
  }

  const label = isGroupView ? "Vue groupe" : current?.nom ?? "—";
  const color = isGroupView ? "#6B7280" : current?.couleur ?? "#6B7280";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 14px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          color,
          background: `${color}12`,
          border: `1px solid ${color}30`,
          cursor: "pointer",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        {label}
        <span style={{ fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          minWidth: 200,
          background: "#fff",
          border: "1px solid #ddd6c8",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          padding: "6px 0",
          zIndex: 100,
        }}>
          {/* Group view option (admin only) */}
          {isGroupAdmin && (
            <button
              type="button"
              onClick={() => { setGroupView(true); close(); }}
              style={{
                ...itemStyle,
                background: isGroupView ? "#f5ede4" : undefined,
                color: isGroupView ? "#D4775A" : "#1a1a1a",
              }}
            >
              <span style={{ fontSize: 15 }}>🏢</span>
              <span>Vue groupe</span>
            </button>
          )}

          {/* Each establishment */}
          {etablissements.map(e => {
            const active = !isGroupView && current?.id === e.id;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => { setCurrent(e); close(); }}
                style={{
                  ...itemStyle,
                  background: active ? "#f5ede4" : undefined,
                  color: active ? "#D4775A" : "#1a1a1a",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: e.couleur, flexShrink: 0,
                }} />
                <span>{e.nom}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 16px",
  border: "none",
  background: "none",
  textAlign: "left",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
