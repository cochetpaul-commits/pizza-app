"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "@/lib/ProfileContext";

type PairingItem = { id: string; name: string; category: string };

type Fiche = {
  id: string;
  type: "pizza" | "cuisine" | "cocktail";
  name: string;
  category: string;
  description_courte: string | null;
  wine_pairing: string | null;
  pairings: PairingItem[];
  in_catalogue: boolean;
  photo_url: string | null;
  price_ttc: number | null;
  allergens: string[];
  ingredients: string[];
  sub_recipes: { name: string; ingredients: string[] }[];
};

const CAT_LABELS: Record<string, string> = {
  pizza: "Pizze", entree: "Antipasti", plat_cuisine: "Piatti",
  dessert: "Dolci", accompagnement: "Contorni", cocktail: "Cocktails",
};

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  pizza: { bg: "#FDEBD0", fg: "#A0522D" },
  entree: { bg: "#FAD7A0", fg: "#8B6914" },
  plat_cuisine: { bg: "#D4EFDF", fg: "#1B7A3D" },
  dessert: { bg: "#F5CBA7", fg: "#A0522D" },
  accompagnement: { bg: "#D1F2EB", fg: "#117A65" },
  cocktail: { bg: "#FADBD8", fg: "#922B21" },
};

const ALLERGEN_ICONS: Record<string, string> = {
  Gluten: "G", "Crustac\u00e9s": "Cr", "\u0152ufs": "Oe", Poisson: "Po",
  Arachides: "Ar", Soja: "So", Lait: "La", "Fruits \u00e0 coque": "Fc",
  "C\u00e9leri": "Ce", Moutarde: "Mo", "S\u00e9same": "S\u00e9", Sulfites: "Su",
  Lupin: "Lu", Mollusques: "Ml",
};

const DRINK_CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  vins: { bg: "#F5E6F0", fg: "#7B2D5F" },
  spiritueux: { bg: "#FFF3E0", fg: "#E65100" },
  biere: { bg: "#FFF9C4", fg: "#F9A825" },
  soft: { bg: "#E0F7FA", fg: "#00838F" },
  liqueurs: { bg: "#EDE7F6", fg: "#5E35B1" },
  cafeteria: { bg: "#EFEBE9", fg: "#5D4037" },
  sirops: { bg: "#FCE4EC", fg: "#C62828" },
};

/* ── PairingPicker ──────────────────────────────────────── */

function PairingPicker({ fiche, onAdd, onRemove }: {
  fiche: Fiche;
  onAdd: (item: PairingItem) => void;
  onRemove: (ingredientId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PairingItem[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function doSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/catalogue/fiches/pairings?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setSearching(false);
    }, 250);
  }

  const selectedIds = new Set(fiche.pairings.map((p) => p.id));

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>
        Accords Mets & Boissons
      </label>
      {fiche.pairings.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {fiche.pairings.map((p) => {
            const col = DRINK_CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" };
            return (
              <span key={p.id} style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 6, fontSize: 11,
                background: col.bg, color: col.fg, border: `1px solid ${col.fg}30`,
              }}>
                {p.name}
                <button onClick={() => onRemove(p.id)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: col.fg, fontSize: 13, fontWeight: 700, lineHeight: 1, padding: 0,
                }}>x</button>
              </span>
            );
          })}
        </div>
      )}
      <input type="text" value={search}
        onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
        placeholder="Rechercher un vin, spiritueux, biere, soft..."
        style={{ width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none", boxSizing: "border-box" }}
      />
      {(results.length > 0 || searching) && search.trim() && (
        <div style={{ marginTop: 2, border: "1px solid #e5ddd0", borderRadius: 8, background: "#fff", maxHeight: 180, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
          {searching ? <div style={{ padding: 10, fontSize: 12, color: "#999" }}>Recherche...</div> : results.map((r) => {
            const already = selectedIds.has(r.id);
            const col = DRINK_CAT_COLORS[r.category] ?? { bg: "#eee", fg: "#666" };
            return (
              <div key={r.id} onClick={() => { if (!already) { onAdd(r); setSearch(""); setResults([]); } }}
                style={{ padding: "8px 10px", fontSize: 12, cursor: already ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", opacity: already ? 0.4 : 1, borderBottom: "1px solid #f5f0e8" }}
                onMouseEnter={(e) => { if (!already) e.currentTarget.style.background = "#f9f6f0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
              >
                <span>{r.name}</span>
                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: col.bg, color: col.fg }}>{r.category}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── FicheCard ───────────────────────────────────────────── */

function FicheCard({ fiche, isOpen, onToggle, canEdit, onUpdate }: {
  fiche: Fiche; isOpen: boolean; onToggle: () => void; canEdit: boolean;
  onUpdate: (id: string, type: string, fields: Partial<Fiche>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [desc, setDesc] = useState(fiche.description_courte ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/catalogue/fiches/update", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fiche.id, type: fiche.type, description_courte: desc.trim() }) });
    onUpdate(fiche.id, fiche.type, { description_courte: desc.trim() || null });
    setSaving(false); setEditing(false);
  }

  async function addPairing(item: PairingItem) {
    await fetch("/api/catalogue/fiches/pairings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: fiche.id, recipe_type: fiche.type, ingredient_id: item.id }) });
    onUpdate(fiche.id, fiche.type, { pairings: [...fiche.pairings, item] });
  }

  async function removePairing(ingredientId: string) {
    await fetch("/api/catalogue/fiches/pairings", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: fiche.id, recipe_type: fiche.type, ingredient_id: ingredientId }) });
    onUpdate(fiche.id, fiche.type, { pairings: fiche.pairings.filter((p) => p.id !== ingredientId) });
  }

  async function toggleCatalogue() {
    const newVal = !fiche.in_catalogue;
    await fetch("/api/catalogue/fiches/update", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fiche.id, type: fiche.type, in_catalogue: newVal }) });
    onUpdate(fiche.id, fiche.type, { in_catalogue: newVal });
  }

  const col = CAT_COLORS[fiche.category] ?? { bg: "#eee", fg: "#666" };

  return (
    <div style={{ borderRadius: 12, border: "1px solid #e5ddd0", background: "#fff", overflow: "hidden", opacity: fiche.in_catalogue ? 1 : 0.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }} onClick={onToggle}>
        {fiche.photo_url ? (
          <img src={fiche.photo_url} alt={fiche.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 10, background: col.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22 }}>{fiche.type === "pizza" ? "\u{1F355}" : fiche.type === "cocktail" ? "\u{1F378}" : "\u{1F37D}"}</span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{fiche.name}</span>
            {!fiche.in_catalogue && <span style={{ fontSize: 9, fontWeight: 700, color: "#999", background: "#f0ebe0", padding: "1px 6px", borderRadius: 4 }}>MASQUE</span>}
          </div>
          {fiche.description_courte && !editing && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{fiche.description_courte}</div>}
          {fiche.allergens.length > 0 && (
            <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
              {fiche.allergens.map((a) => <span key={a} title={a} style={{ padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>{ALLERGEN_ICONS[a] ?? a}</span>)}
            </div>
          )}
        </div>
        {fiche.price_ttc != null && fiche.price_ttc > 0 && (
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>{fiche.price_ttc.toFixed(0)} \u20AC</div>
        )}
        <span style={{ fontSize: 14, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
      </div>

      {isOpen && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0ebe0" }}>
          {editing ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Description courte</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex: Veau cuit a basse temperature..." rows={2}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
              </div>
              <PairingPicker fiche={fiche} onAdd={addPairing} onRemove={removePairing} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={save} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#D4775A", color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "..." : "Enregistrer"}</button>
                <button onClick={() => { setEditing(false); setDesc(fiche.description_courte ?? ""); }} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer" }}>Annuler</button>
              </div>
            </div>
          ) : (
            <>
              {canEdit && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                  <button onClick={(e) => { e.stopPropagation(); toggleCatalogue(); }} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", background: fiche.in_catalogue ? "#FEF2F2" : "#E8F5E9", color: fiche.in_catalogue ? "#B91C1C" : "#2D6A4F", border: `1px solid ${fiche.in_catalogue ? "#FECACA" : "#A5D6A7"}` }}>
                    {fiche.in_catalogue ? "Retirer du catalogue" : "Ajouter au catalogue"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "#f9f6f0", color: "#D4775A", border: "1px solid #D4775A", cursor: "pointer" }}>Modifier</button>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Composition</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {fiche.ingredients.map((name, i) => <span key={i} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, background: "#f9f6f0", color: "#1a1a1a", border: "1px solid #e5ddd0" }}>{name}</span>)}
                </div>
              </div>
              {fiche.sub_recipes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Preparations & Sauces</div>
                  {fiche.sub_recipes.map((sr, i) => <div key={i} style={{ marginBottom: 6 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#D4775A" }}>{sr.name}</div><div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{sr.ingredients.join(", ")}</div></div>)}
                </div>
              )}
              {fiche.allergens.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Allergenes</div>
                  <div style={{ fontSize: 12, color: "#B91C1C" }}>{fiche.allergens.join(" \u00B7 ")}</div>
                </div>
              )}
              {(fiche.pairings.length > 0 || fiche.wine_pairing) && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Accords Mets & Boissons</div>
                  {fiche.pairings.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {fiche.pairings.map((p) => { const pcol = DRINK_CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" }; return <span key={p.id} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, background: pcol.bg, color: pcol.fg, border: `1px solid ${pcol.fg}30` }}>{p.name}</span>; })}
                    </div>
                  ) : fiche.wine_pairing ? <div style={{ fontSize: 12, color: "#6C3483", fontStyle: "italic" }}>{fiche.wine_pairing}</div> : null}
                </div>
              )}
              {!fiche.description_courte && !fiche.pairings.length && !fiche.wine_pairing && canEdit && (
                <p style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", marginTop: 12 }}>Aucune description ni accord — cliquez Modifier pour ajouter</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Exported content (used in /recettes tab + /catalogue/fiches) ── */

export function CatalogueSalleContent() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [showHidden, setShowHidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { role } = useProfile();
  const canEdit = role === "group_admin";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/catalogue/fiches");
    const data = await res.json();
    setFiches(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function handleUpdate(id: string, _type: string, fields: Partial<Fiche>) {
    setFiches((prev) => prev.map((f) => f.id === id ? { ...f, ...fields } : f));
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const res = await fetch("/api/catalogue/fiches/pdf");
      if (!res.ok) { alert("Erreur export PDF"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "catalogue-salle.pdf"; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  const visibleFiches = showHidden ? fiches : fiches.filter((f) => f.in_catalogue);
  const categories = [...new Set(visibleFiches.map((f) => f.category))];
  const hiddenCount = fiches.filter((f) => !f.in_catalogue).length;

  const filtered = visibleFiches.filter((f) => {
    if (filterCat !== "ALL" && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = new Map<string, Fiche[]>();
  for (const f of filtered) { const arr = grouped.get(f.category) ?? []; arr.push(f); grouped.set(f.category, arr); }

  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>
          Catalogue <span style={{ fontSize: 14, fontWeight: 500, color: "#999", letterSpacing: 0, textTransform: "none" }}>({visibleFiches.length}) — carte & accords</span>
        </h1>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none" }} />
        <button onClick={handleExportPdf} disabled={exporting}
          style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#D4775A", color: "#fff", border: "none", cursor: "pointer", opacity: exporting ? 0.6 : 1 }}>
          {exporting ? "Export..." : "Export PDF"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setFilterCat("ALL")} style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
          border: filterCat === "ALL" ? "2px solid #D4775A" : "1px solid #ddd6c8",
          background: filterCat === "ALL" ? "#FFF5F0" : "#fff", color: filterCat === "ALL" ? "#D4775A" : "#666",
        }}>Tout ({visibleFiches.length})</button>
        {categories.map((cat) => {
          const col = CAT_COLORS[cat] ?? { bg: "#eee", fg: "#666" };
          const count = visibleFiches.filter((f) => f.category === cat).length;
          return <button key={cat} onClick={() => setFilterCat(filterCat === cat ? "ALL" : cat)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: filterCat === cat ? `2px solid ${col.fg}` : "1px solid transparent", background: col.bg, color: col.fg,
          }}>{CAT_LABELS[cat] ?? cat} ({count})</button>;
        })}
        {canEdit && hiddenCount > 0 && (
          <button onClick={() => setShowHidden(!showHidden)} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: showHidden ? "2px solid #999" : "1px solid #ddd6c8", background: showHidden ? "#f0ebe0" : "#fff", color: "#999",
          }}>{showHidden ? "Masquer retires" : `+ ${hiddenCount} masque${hiddenCount > 1 ? "s" : ""}`}</button>
        )}
      </div>

      {loading ? <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p> : (
        [...grouped.entries()].map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontFamily: "'Oswald', sans-serif", color: CAT_COLORS[cat]?.fg ?? "#1a1a1a", margin: "0 0 12px", paddingBottom: 6, borderBottom: `2px solid ${CAT_COLORS[cat]?.bg ?? "#eee"}` }}>
              {CAT_LABELS[cat] ?? cat}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((f) => <FicheCard key={f.id} fiche={f} isOpen={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} canEdit={canEdit} onUpdate={handleUpdate} />)}
            </div>
          </div>
        ))
      )}

      {filtered.length === 0 && !loading && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucune fiche trouvee</p>}
    </main>
  );
}
