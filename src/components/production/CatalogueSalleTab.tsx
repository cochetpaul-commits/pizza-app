"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { BottomSheet } from "@/components/layout/BottomSheet";

type PairingItem = { id: string; name: string; category: string };

type Fiche = {
  id: string;
  type: "pizza" | "cuisine" | "cocktail";
  name: string;
  category: string;
  description_courte: string | null;
  wine_pairing: string | null;
  accord: string | null;
  resume_salle: string | null;
  pairings: PairingItem[];
  in_catalogue: boolean;
  photo_url: string | null;
  price_ttc: number | null;
  allergens: string[];
  ingredients: string[];
  sub_recipes: { name: string; ingredients: string[] }[];
};

const CAT_LABELS: Record<string, string> = {
  pizza: "Pizze", entree: "Antipasti", plat_cuisine: "Cucina",
  dessert: "Dolci", cocktail: "Cocktails",
};

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  pizza: { bg: "#FDEBD0", fg: "#A0522D" },
  entree: { bg: "#FAD7A0", fg: "#8B6914" },
  plat_cuisine: { bg: "#D4EFDF", fg: "#1B7A3D" },
  dessert: { bg: "#F5CBA7", fg: "#A0522D" },
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fiche.photo_url} alt={fiche.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 10, background: col.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: col.fg }}>{(fiche.name || "?").charAt(0).toUpperCase()}</span>
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
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>{fiche.price_ttc.toFixed(0)} {"\u20AC"}</div>
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
              {fiche.resume_salle && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>En cuisine</div>
                  <div style={{ fontSize: 12, color: "#666", fontStyle: "italic" }}>{fiche.resume_salle}</div>
                </div>
              )}
              {fiche.accord && !fiche.pairings.length && !fiche.wine_pairing && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Accord conseille</div>
                  <div style={{ fontSize: 12, color: "#6C3483", fontStyle: "italic" }}>{fiche.accord}</div>
                </div>
              )}
              {!fiche.description_courte && !fiche.pairings.length && !fiche.wine_pairing && !fiche.accord && !fiche.resume_salle && canEdit && (
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
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [catOrder, setCatOrder] = useState<string[]>([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const { role } = useProfile();
  const { current: etab } = useEtablissement();

  // Load saved category order
  useEffect(() => {
    try { const s = localStorage.getItem("catalogue-salle-cat-order"); if (s) setCatOrder(JSON.parse(s)); } catch { /* */ }
  }, []);
  const canEdit = role === "group_admin";

  const load = useCallback(async () => {
    setLoading(true);
    const etabParam = etab?.slug ? `?etab=${etab.slug}` : "";
    const res = await fetch(`/api/catalogue/fiches${etabParam}`);
    const data = await res.json();
    setFiches(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [etab]);

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

  const orderedGroups = useMemo(() => {
    const map = new Map<string, Fiche[]>();
    for (const f of filtered) { const arr = map.get(f.category) ?? []; arr.push(f); map.set(f.category, arr); }
    const entries = [...map.entries()];
    if (catOrder.length > 0) {
      const orderMap = new Map(catOrder.map((k, i) => [k, i]));
      entries.sort((a, b) => (orderMap.get(a[0]) ?? 999) - (orderMap.get(b[0]) ?? 999));
    }
    return entries;
  }, [filtered, catOrder]);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const keys = orderedGroups.map(([k]) => k);
    const [moved] = keys.splice(result.source.index, 1);
    keys.splice(result.destination.index, 0, moved);
    setCatOrder(keys);
    try { localStorage.setItem("catalogue-salle-cat-order", JSON.stringify(keys)); } catch { /* */ }
  }, [orderedGroups]);

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
        {canEdit && (
          <button onClick={() => setShowNewCat(true)}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741", cursor: "pointer" }}>
            + Categorie
          </button>
        )}
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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="catalogue-salle-cats">
            {(droppableProvided) => (
              <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
        {orderedGroups.map(([cat, items], idx) => {
          const col = CAT_COLORS[cat] ?? { bg: "#eee", fg: "#666" };
          const isOpen = openCats.has(cat);
          return (
            <Draggable key={cat} draggableId={cat} index={idx}>
              {(provided, snapshot) => (
            <div ref={provided.innerRef} {...provided.draggableProps} style={{ ...provided.draggableProps.style, marginBottom: 10 }}>
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 14px", background: snapshot.isDragging ? "#f9f6f0" : "#fff", borderRadius: 12,
                  border: snapshot.isDragging ? `2px solid ${col.fg}` : "1px solid #ede6d9",
                  boxShadow: snapshot.isDragging
                    ? `inset 4px 0 0 ${col.fg}, 0 8px 24px rgba(0,0,0,0.15)`
                    : `inset 4px 0 0 ${col.fg}, 0 1px 3px rgba(0,0,0,0.04)`,
                  boxSizing: "border-box",
                }}
              >
                <div {...provided.dragHandleProps} style={{
                  cursor: "grab", color: "#b0a894", flexShrink: 0, touchAction: "none",
                  padding: "10px 6px", display: "flex", alignItems: "center",
                  WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none",
                }} title="Glisser pour reordonner">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>
                </div>
                <div onClick={() => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                  style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: col.fg }}>
                    {CAT_LABELS[cat] ?? cat}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 12, background: col.bg, color: col.fg }}>
                    {items.length}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isOpen ? "rotate(0)" : "rotate(-90deg)" }}>
                    ▼
                  </span>
                </div>
              </div>
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {items.map((f) => <FicheCard key={f.id} fiche={f} isOpen={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} canEdit={canEdit} onUpdate={handleUpdate} />)}
                </div>
              )}
            </div>
              )}
            </Draggable>
          );
        })}
        {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {filtered.length === 0 && !loading && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucune fiche trouvee</p>}

      {/* Nouvelle catégorie */}
      <BottomSheet open={showNewCat} onClose={() => { setShowNewCat(false); setNewCatName(""); }} title="Nouvelle categorie">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nom de la categorie (ex: Brunch, Aperitivo...)"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd6c8", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          <button type="button" disabled={!newCatName.trim()}
            onClick={async () => {
              if (!etab || !newCatName.trim()) return;
              const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]+/g, "_").replace(/^_|_$/g, "");
              const estabSlug = etab.slug?.includes("piccola") ? "piccola" : "bello_mio";
              await supabase.from("kitchen_recipes").insert({
                name: `Nouvelle recette ${newCatName.trim()}`,
                category: slug,
                establishments: [estabSlug],
                is_active: true,
                in_catalogue: true,
              });
              setNewCatName(""); setShowNewCat(false);
              void load();
            }}
            style={{
              padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: newCatName.trim() ? "#4a6741" : "#ccc",
              color: "#fff", border: "none", cursor: newCatName.trim() ? "pointer" : "not-allowed",
            }}>
            Creer la categorie
          </button>
        </div>
      </BottomSheet>
    </main>
  );
}
