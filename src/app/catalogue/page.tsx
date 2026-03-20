"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────

type Fiche = {
  id: string;
  recipe_type: string;
  recipe_id: string;
  name: string;
  category: string | null;
  photo_url: string | null;
  pdf_url: string;
  ingredient_count: number | null;
  step_count: number | null;
  allergens: string[] | null;
  exported_at: string;
};

// ── Colors ───────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  pizza: "#8B1A1A",
  cuisine: "#4a6741",
  cocktail: "#D4775A",
  empatement: "#8a7b6b",
};

const TYPE_LABELS: Record<string, string> = {
  pizza: "Pizza",
  cuisine: "Cuisine",
  cocktail: "Cocktail",
  empatement: "Emp\u00e2tement",
};

const CAT_LABELS: Record<string, string> = {
  preparation: "Pr\u00e9paration",
  entree: "Entr\u00e9e",
  plat_cuisine: "Plat cuisin\u00e9",
  accompagnement: "Accompagnement",
  sauce: "Sauce",
  dessert: "Dessert",
  autre: "Autre",
};

const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten",
  lait: "Lait",
  oeuf: "Oeuf",
  poisson: "Poisson",
  crustaces: "Crustac\u00e9s",
  soja: "Soja",
  arachide: "Arachide",
  "fruits-a-coque": "Fruits \u00e0 coque",
  celeri: "C\u00e9leri",
  moutarde: "Moutarde",
  sesame: "S\u00e9same",
  sulfites: "Sulfites",
  lupin: "Lupin",
  mollusques: "Mollusques",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `Il y a ${diff}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CataloguePage() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [viewerFiche, setViewerFiche] = useState<Fiche | null>(null);

  useEffect(() => {
    supabase
      .from("catalogue_fiches")
      .select("id, recipe_type, recipe_id, name, category, photo_url, pdf_url, ingredient_count, step_count, allergens, exported_at")
      .order("recipe_type")
      .order("name")
      .then(({ data }) => {
        setFiches(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let arr = fiches;
    if (typeFilter) arr = arr.filter((f) => f.recipe_type === typeFilter);
    if (q.trim()) {
      const low = q.toLowerCase();
      arr = arr.filter((f) => f.name.toLowerCase().includes(low));
    }
    return arr;
  }, [fiches, typeFilter, q]);

  // Group by type, then by category (for cuisine)
  const groups = useMemo(() => {
    const map: Record<string, Fiche[]> = {};
    for (const f of filtered) {
      const key =
        f.recipe_type === "cuisine" && f.category
          ? `cuisine:${f.category}`
          : f.recipe_type;
      if (!map[key]) map[key] = [];
      map[key].push(f);
    }
    const order = ["pizza", "cuisine", "cocktail", "empatement"];
    return Object.entries(map).sort(([a], [b]) => {
      const ia = order.indexOf(a.split(":")[0]);
      const ib = order.indexOf(b.split(":")[0]);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "fr");
    });
  }, [filtered]);

  function groupLabel(key: string): string {
    if (key.startsWith("cuisine:")) {
      const cat = key.split(":")[1];
      return CAT_LABELS[cat] ?? cat;
    }
    return TYPE_LABELS[key] ?? key;
  }

  function groupColor(key: string): string {
    const type = key.split(":")[0];
    return TYPE_COLORS[type] ?? "#1a1a1a";
  }

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of fiches) {
      counts[f.recipe_type] = (counts[f.recipe_type] ?? 0) + 1;
    }
    return counts;
  }, [fiches]);

  // Navigate between fiches in modal
  const navigateViewer = useCallback(
    (dir: 1 | -1) => {
      if (!viewerFiche) return;
      const idx = filtered.findIndex((f) => f.id === viewerFiche.id);
      const next = filtered[idx + dir];
      if (next) setViewerFiche(next);
    },
    [viewerFiche, filtered],
  );

  return (
    <main className="container" style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            color: "#1a1a1a",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Catalogue
        </h1>
        <span style={{ fontSize: 13, color: "#999" }}>
          {fiches.length} fiche{fiches.length > 1 ? "s" : ""} technique
          {fiches.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Rechercher une fiche..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1.5px solid #ddd6c8",
          background: "#fff",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      {/* Type filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 6,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setTypeFilter(null)}
          style={tabPill(!typeFilter, "#1a1a1a")}
        >
          Tous ({fiches.length})
        </button>
        {(["pizza", "cuisine", "cocktail", "empatement"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            style={tabPill(typeFilter === t, TYPE_COLORS[t])}
          >
            {TYPE_LABELS[t]} ({typeCounts[t] ?? 0})
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <div
            style={{
              width: 28,
              height: 28,
              border: "3px solid #ddd6c8",
              borderTopColor: "#D4775A",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <p style={{ textAlign: "center", color: "#999", padding: 60, fontSize: 14 }}>
          {fiches.length === 0
            ? "Aucune fiche export\u00e9e. Publiez depuis une recette."
            : "Aucun r\u00e9sultat."}
        </p>
      )}

      {/* Groups */}
      {groups.map(([key, items]) => {
        const color = groupColor(key);
        return (
          <div key={key} style={{ marginBottom: 28 }}>
            {/* Section title */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                }}
              >
                {groupLabel(key)}
              </span>
              <span style={{ fontSize: 11, color: "#999" }}>{items.length}</span>
            </div>

            {/* Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 16,
              }}
            >
              {items.map((f) => (
                <FicheCard key={f.id} fiche={f} onOpen={setViewerFiche} />
              ))}
            </div>
          </div>
        );
      })}

      {/* PDF Viewer Modal */}
      {viewerFiche && (
        <PdfViewerModal
          fiche={viewerFiche}
          onClose={() => setViewerFiche(null)}
          onPrev={() => navigateViewer(-1)}
          onNext={() => navigateViewer(1)}
          hasPrev={filtered.findIndex((f) => f.id === viewerFiche.id) > 0}
          hasNext={filtered.findIndex((f) => f.id === viewerFiche.id) < filtered.length - 1}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes flipIn { from { transform: rotateY(90deg); } to { transform: rotateY(0); } }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </main>
  );
}

// ── Tab pill style ───────────────────────────────────────────────────────────

function tabPill(active: boolean, color: string): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    border: active ? "none" : `1.5px solid ${color}40`,
    background: active ? color : `${color}14`,
    color: active ? "#fff" : color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

// ── Flip Card ────────────────────────────────────────────────────────────────

function FicheCard({ fiche, onOpen }: { fiche: Fiche; onOpen: (f: Fiche) => void }) {
  const [flipped, setFlipped] = useState(false);
  const color = TYPE_COLORS[fiche.recipe_type] ?? "#1a1a1a";
  const hasPhoto = !!fiche.photo_url;
  const allergens = fiche.allergens ?? [];
  const ingredientCount = fiche.ingredient_count ?? 0;
  const stepCount = fiche.step_count ?? 0;

  return (
    <div
      style={{ perspective: 600, cursor: "pointer" }}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onClick={() => onOpen(fiche)}
    >
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0)",
          borderRadius: 12,
        }}
      >
        {/* ── FRONT ── */}
        <div
          style={{
            backfaceVisibility: "hidden",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
            border: "1px solid #ddd6c8",
            boxShadow: flipped
              ? "6px 8px 24px rgba(0,0,0,0.14)"
              : "0 2px 8px rgba(0,0,0,0.06)",
            transition: "box-shadow 0.3s",
          }}
        >
          {/* Cover */}
          <div
            style={{
              aspectRatio: "1",
              background: hasPhoto
                ? `url(${fiche.photo_url}) center/cover`
                : `linear-gradient(135deg, ${color}20 0%, ${color}08 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {!hasPhoto && (
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: `${color}40`,
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                }}
              >
                {initials(fiche.name)}
              </span>
            )}
            <span
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                fontSize: 9,
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: 6,
                background: color,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {TYPE_LABELS[fiche.recipe_type]?.[0] ?? "?"}
            </span>
          </div>

          {/* Title bar */}
          <div style={{ padding: "8px 10px", borderTop: `2px solid ${color}` }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#1a1a1a",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fiche.name}
            </div>
            {fiche.category && (
              <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 2 }}>
                {CAT_LABELS[fiche.category] ?? fiche.category}
              </div>
            )}
          </div>
        </div>

        {/* ── BACK ── */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderRadius: 12,
            overflow: "hidden",
            background: `linear-gradient(160deg, ${color} 0%, ${color}cc 100%)`,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxShadow: "6px 8px 24px rgba(0,0,0,0.14)",
          }}
        >
          {/* Top info */}
          <div style={{ padding: "14px 12px 0" }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 6,
                lineHeight: 1.2,
              }}
            >
              {fiche.name}
            </div>
            {fiche.category && (
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.8,
                  marginBottom: 10,
                  fontWeight: 600,
                }}
              >
                {CAT_LABELS[fiche.category] ?? fiche.category}
              </div>
            )}

            {/* Stats */}
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              {ingredientCount > 0 && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{ingredientCount}</div>
                  <div style={{ fontSize: 8, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    ingr.
                  </div>
                </div>
              )}
              {stepCount > 0 && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{stepCount}</div>
                  <div style={{ fontSize: 8, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {stepCount > 1 ? "\u00e9tapes" : "\u00e9tape"}
                  </div>
                </div>
              )}
            </div>

            {/* Allergens */}
            {allergens.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {allergens.slice(0, 5).map((a) => (
                  <span
                    key={a}
                    style={{
                      fontSize: 8,
                      padding: "2px 5px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.2)",
                      fontWeight: 600,
                    }}
                  >
                    {ALLERGEN_LABELS[a] ?? a}
                  </span>
                ))}
                {allergens.length > 5 && (
                  <span style={{ fontSize: 8, opacity: 0.7 }}>+{allergens.length - 5}</span>
                )}
              </div>
            )}
          </div>

          {/* Bottom */}
          <div style={{ padding: "0 12px 12px" }}>
            <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 8 }}>
              {relativeDate(fiche.exported_at)}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textAlign: "center",
                padding: "6px 0",
                borderRadius: 8,
                background: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(4px)",
                letterSpacing: 0.5,
              }}
            >
              Consulter la fiche
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PDF Viewer Modal ─────────────────────────────────────────────────────────

function PdfViewerModal({
  fiche,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  fiche: Fiche;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const color = TYPE_COLORS[fiche.recipe_type] ?? "#1a1a1a";

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        animation: "modalIn 0.25s ease-out",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          background: "rgba(0,0,0,0.4)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              background: color,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {TYPE_LABELS[fiche.recipe_type]}
          </span>
          <span
            style={{
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            {fiche.name}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href={fiche.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: "#fff",
              textDecoration: "none",
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.3)",
              fontWeight: 600,
            }}
          >
            Ouvrir dans un nouvel onglet
          </a>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* PDF iframe + nav arrows */}
      <div style={{ flex: 1, position: "relative", display: "flex" }}>
        {/* Prev arrow */}
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10,
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              border: "none",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
          >
            &lsaquo;
          </button>
        )}

        {/* PDF */}
        <iframe
          key={fiche.id}
          src={fiche.pdf_url}
          style={{
            flex: 1,
            border: "none",
            background: "#f5f0e8",
            margin: "12px 60px",
            borderRadius: 8,
          }}
          title={fiche.name}
        />

        {/* Next arrow */}
        {hasNext && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10,
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.5)",
              border: "none",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
          >
            &rsaquo;
          </button>
        )}
      </div>
    </div>
  );
}
