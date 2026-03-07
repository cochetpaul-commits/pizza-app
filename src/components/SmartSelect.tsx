"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SmartSelectOption = {
  id: string;
  name: string;
  category?: string | null;
  rightTop?: string | null;
  rightBottom?: string | null;
  isPreparation?: boolean;
};

// Cache global partagé entre toutes les instances
const optionsCache = new Map<string, { options: SmartSelectOption[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useSmartSelectCache(cacheKey: string, loader: () => Promise<SmartSelectOption[]>) {
  const [options, setOptions] = useState<SmartSelectOption[]>(() => {
    const cached = optionsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.options;
    return [];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cached = optionsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptions(cached.options);
      return;
    }
    setLoading(true);
    loader().then((opts) => {
      optionsCache.set(cacheKey, { options: opts, ts: Date.now() });
      setOptions(opts);
      setLoading(false);
    });
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { options, loading };
}

export function invalidateSmartSelectCache(cacheKey?: string) {
  if (cacheKey) optionsCache.delete(cacheKey);
  else optionsCache.clear();
}

function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 45% 45%)`;
}

function isMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function SmartSelect(props: {
  options: SmartSelectOption[];
  value: string;
  onChange: (id: string) => void;
  onAfterSelect?: () => void; // callback pour auto-focus quantité
  placeholder?: string;
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  menuMax?: number;
}) {
  const {
    options, value, onChange, onAfterSelect,
    placeholder = "Rechercher…", inputStyle, inputClassName = "input", menuMax = 12
  } = props;

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  const [typed, setTyped] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const q = isDirty ? typed : selected?.name ?? "";

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
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
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const maxHeight = Math.max(spaceBelow, spaceAbove, 200);
    const top = spaceBelow >= 200 ? r.bottom + 6 : r.top - Math.min(maxHeight, 340) - 6;

    // Sur mobile : pleine largeur
    if (isMobile()) {
      setPos({ left: 8, top, width: window.innerWidth - 16, maxHeight: Math.min(maxHeight, 340) });
    } else {
      setPos({ left: r.left, top, width: Math.max(r.width, 320), maxHeight: Math.min(maxHeight, 400) });
    }
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
          style={{ fontSize: 16, ...inputStyle }} // fontSize 16 évite le zoom auto sur iOS
          placeholder={placeholder}
          value={q}
          onChange={(e) => { setTyped(e.target.value); setIsDirty(true); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
      </div>

      {open && pos ? createPortal(
        <div style={{
          position: "fixed", zIndex: 9999,
          left: pos.left, top: pos.top, width: pos.width,
          overflowY: "auto", maxHeight: pos.maxHeight,
          padding: 6, borderRadius: 14,
          background: "white",
          border: "1px solid rgba(0,0,0,0.10)",
          boxShadow: "0 18px 38px rgba(0,0,0,0.14)",
          WebkitOverflowScrolling: "touch",
        }}>
          {filtered.length ? filtered.map((o) => {
            const col = o.isPreparation ? "#C026D3" : hashColor(String(o.category ?? "other"));
            const isSelected = o.id === value;
            const isMissing = (o.rightBottom ?? "").toLowerCase().includes("manquant");
            const badgeBg = isMissing ? "rgba(220,38,38,0.10)" : o.isPreparation ? "rgba(192,38,211,0.08)" : "rgba(0,0,0,0.04)";
            const badgeBorder = isMissing ? "rgba(220,38,38,0.25)" : o.isPreparation ? "rgba(192,38,211,0.20)" : "rgba(0,0,0,0.10)";
            const badgeText = isMissing ? "rgba(185,28,28,0.95)" : o.isPreparation ? "#9D174D" : "rgba(0,0,0,0.75)";

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
                  // Auto-focus quantité après sélection
                  if (onAfterSelect) window.setTimeout(onAfterSelect, 50);
                }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "12px 10px", // plus grand pour mobile
                  display: "flex", alignItems: "center", gap: 10,
                  background: isSelected ? "rgba(0,0,0,0.04)" : "transparent",
                  border: "none", cursor: "pointer", borderRadius: 12,
                  minHeight: 48, // touch target minimum
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: 999,
                  background: col, flex: "0 0 auto",
                  boxShadow: o.isPreparation ? `0 0 0 2px rgba(192,38,211,0.20)` : "none"
                }} />
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 14 }}>
                    {o.name}
                    {o.isPreparation && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#C026D3", opacity: 0.8 }}>MAISON</span>
                    )}
                  </div>
                  {o.rightTop ? (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {o.rightTop}
                    </div>
                  ) : null}
                </div>
                {o.rightBottom ? (
                  <span style={{
                    flex: "0 0 auto", display: "inline-flex", alignItems: "center",
                    padding: "6px 10px", borderRadius: 999,
                    border: `1px solid ${badgeBorder}`,
                    background: badgeBg, fontSize: 12, fontWeight: 950,
                    color: badgeText, whiteSpace: "nowrap",
                  }}>
                    {o.rightBottom}
                  </span>
                ) : null}
              </button>
            );
          }) : (
            <div style={{ padding: 16, fontSize: 13, opacity: 0.7, textAlign: "center" }}>Aucun résultat</div>
          )}
        </div>,
        document.body
      ) : null}
    </>
  );
}
