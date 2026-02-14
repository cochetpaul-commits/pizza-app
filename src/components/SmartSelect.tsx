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
  menuMax?: number;
}) {
  const { options, value, onChange, placeholder = "Rechercher…", inputStyle, menuMax = 12 } = props;

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
                background: "white",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
              }}
            >
              {filtered.length ? (
                filtered.map((o) => {
                  const col = hashColor(String(o.category ?? "other"));
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
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: o.id === value ? "rgba(0,0,0,0.04)" : "white",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: col, flex: "0 0 auto" }} />

                      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                        <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {o.name}
                        </div>
                      </div>

                      <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 110 }}>
                        {o.rightTop ? <div style={{ fontSize: 12, opacity: 0.8 }}>{o.rightTop}</div> : null}
                        {o.rightBottom ? <div style={{ fontSize: 13, fontWeight: 800 }}>{o.rightBottom}</div> : null}
                      </div>
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
