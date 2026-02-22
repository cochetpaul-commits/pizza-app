"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SmartSelectOption = {
  id: string;
  name: string;
  category?: string | null;
  rightTop?: string | null;
  rightBottom?: string | null;
};

function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 45% 45%)`;
}

export function SmartSelect(props: {
  options: SmartSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  menuMax?: number;
}) {
  const { options, value, onChange, placeholder = "Rechercher…", inputStyle, inputClassName = "input", menuMax = 12 } = props;

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const [typed, setTyped] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const q = isDirty ? typed : selected?.name ?? "";

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, menuMax);

    return options
      .map((o) => {
        const n = o.name.toLowerCase();
        const starts = n.startsWith(qq);
        const includes = n.includes(qq);
        const score = starts ? 0 : includes ? 1 : 9;
        return { o, score };
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || a.o.name.localeCompare(b.o.name))
      .slice(0, menuMax)
      .map((x) => x.o);
  }, [options, q, menuMax]);

  const measure = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 6, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;

    const onScroll = () => measure();
    const onResize = () => measure();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, measure]);

  return (
    <>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className={inputClassName}
          style={inputStyle}
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setTyped(e.target.value);
            setIsDirty(true);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
      </div>

      {open && pos
  ? createPortal(
      <div
        style={{
          position: "fixed",
          zIndex: 9999,
          left: pos.left,
          top: pos.top,
          width: pos.width,
          overflow: "hidden",
          padding: 6,
          borderRadius: 14,
          background: "white",
          border: "1px solid rgba(0,0,0,0.10)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.14)",
        }}
      >
        {filtered.length ? (
          filtered.map((o) => {
            const col = hashColor(String(o.category ?? "other"));
            const isSelected = o.id === value;

            const isMissing = (o.rightBottom ?? "").toLowerCase().includes("manquant");
            const badgeBg = isMissing ? "rgba(220, 38, 38, 0.10)" : "rgba(0,0,0,0.04)";
            const badgeBorder = isMissing ? "rgba(220, 38, 38, 0.25)" : "rgba(0,0,0,0.10)";
            const badgeText = isMissing ? "rgba(185, 28, 28, 0.95)" : "rgba(0,0,0,0.75)";

            return (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.id);
                  setTyped("");
                  setIsDirty(false);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: isSelected ? "rgba(0,0,0,0.04)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 12,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: col, flex: "0 0 auto" }} />

                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {o.name}
                  </div>
                  {o.rightTop ? (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {o.rightTop}
                    </div>
                  ) : null}
                </div>

                {o.rightBottom ? (
                  <span
                    style={{
                      flex: "0 0 auto",
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${badgeBorder}`,
                      background: badgeBg,
                      fontSize: 12,
                      fontWeight: 950,
                      color: badgeText,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.rightBottom}
                  </span>
                ) : null}
              </button>
            );
          })
        ) : (
          <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Aucun résultat</div>
        )}
      </div>,
      document.body
    )
  : null}
    </>
  );
}