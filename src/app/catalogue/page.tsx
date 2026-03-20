"use client";

import { useEffect, useState, useMemo } from "react";
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CataloguePage() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("catalogue_fiches")
      .select("id, recipe_type, recipe_id, name, category, photo_url, pdf_url, exported_at")
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
    // Sort keys: pizza, cuisine:*, cocktail, empatement
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

  // Tab counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of fiches) {
      counts[f.recipe_type] = (counts[f.recipe_type] ?? 0) + 1;
    }
    return counts;
  }, [fiches]);

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
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: 60,
          }}
        >
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
        <p
          style={{
            textAlign: "center",
            color: "#999",
            padding: 60,
            fontSize: 14,
          }}
        >
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 20,
                  borderRadius: 2,
                  background: color,
                }}
              />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  fontFamily:
                    "var(--font-oswald), 'Oswald', sans-serif",
                }}
              >
                {groupLabel(key)}
              </span>
              <span style={{ fontSize: 11, color: "#999" }}>
                {items.length}
              </span>
            </div>

            {/* iTunes-style grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 16,
              }}
            >
              {items.map((f) => (
                <FicheCard key={f.id} fiche={f} />
              ))}
            </div>
          </div>
        );
      })}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}

// ── Tab pill style ───────────────────────────────────────────────────────────

function tabPill(
  active: boolean,
  color: string
): React.CSSProperties {
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

// ── Fiche Card (iTunes pochette style) ───────────────────────────────────────

function FicheCard({ fiche }: { fiche: Fiche }) {
  const color = TYPE_COLORS[fiche.recipe_type] ?? "#1a1a1a";
  const hasPhoto = !!fiche.photo_url;

  return (
    <a
      href={fiche.pdf_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textDecoration: "none",
        borderRadius: 12,
        overflow: "hidden",
        background: "#fff",
        border: "1px solid #ddd6c8",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform =
          "perspective(600px) rotateY(-3deg) translateY(-4px)";
        e.currentTarget.style.boxShadow =
          "6px 8px 24px rgba(0,0,0,0.14)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow =
          "0 2px 8px rgba(0,0,0,0.06)";
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
              fontFamily:
                "var(--font-oswald), 'Oswald', sans-serif",
            }}
          >
            {initials(fiche.name)}
          </span>
        )}

        {/* Type badge */}
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
      <div
        style={{
          padding: "8px 10px",
          borderTop: `2px solid ${color}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#1a1a1a",
            fontFamily:
              "var(--font-oswald), 'Oswald', sans-serif",
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
          <div
            style={{
              fontSize: 9,
              color,
              fontWeight: 600,
              marginTop: 2,
            }}
          >
            {CAT_LABELS[fiche.category] ?? fiche.category}
          </div>
        )}
      </div>
    </a>
  );
}
