"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

type Category = {
  id: string;
  nom: string;
  slug: string;
  couleur: string;
  famille_id: string;
  sous_categories: string[];
  sort_order: number;
  establishments: string[] | null;
};

const FAMILLE_LABELS: Record<string, string> = {
  pizza: "Pizza", cuisine: "Cuisine", cocktail: "Cocktail",
  soft: "Soft", vin: "Vin", autre: "Autre",
};

const FAMILLE_OPTIONS = Object.entries(FAMILLE_LABELS);

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");
  const [editCouleur, setEditCouleur] = useState("#4a6741");
  const [editFamille, setEditFamille] = useState("cuisine");
  const [editSousCats, setEditSousCats] = useState("");
  const [editEstabs, setEditEstabs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newCouleur, setNewCouleur] = useState("#4a6741");
  const [newFamille, setNewFamille] = useState("cuisine");
  const [newEstabs, setNewEstabs] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .order("nom");
    setCategories((data ?? []) as Category[]);
    setLoading(false);
  }, []);

  // Load on mount
  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => { load(); }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  const reload = () => setLoadKey(k => k + 1);

  const handleSave = async () => {
    if (!editId) return;
    setSaving(true);
    const slug = editNom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    await supabase.from("categories").update({
      nom: editNom,
      slug,
      couleur: editCouleur,
      famille_id: editFamille,
      sous_categories: editSousCats.split(",").map(s => s.trim()).filter(Boolean),
      establishments: editEstabs.length > 0 ? editEstabs : null,
    }).eq("id", editId);
    setEditId(null);
    setSaving(false);
    reload();
  };

  const handleCreate = async () => {
    if (!newNom.trim()) return;
    setSaving(true);
    const slug = newNom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), 0);
    await supabase.from("categories").insert({
      nom: newNom.trim(),
      slug,
      couleur: newCouleur,
      famille_id: newFamille,
      sous_categories: [],
      sort_order: maxOrder + 1,
      establishments: newEstabs.length > 0 ? newEstabs : null,
    });
    setNewNom("");
    setShowNew(false);
    setSaving(false);
    reload();
  };

  const handleDelete = async (id: string, nom: string) => {
    if (!confirm(`Supprimer la categorie "${nom}" ? Les recettes de cette categorie ne seront pas supprimees.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { alert("Erreur : " + error.message); return; }
    reload();
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setCategories(reordered);
    // Persist order
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sort_order !== i) {
        await supabase.from("categories").update({ sort_order: i }).eq("id", reordered[i].id);
      }
    }
  };

  const openEdit = (c: Category) => {
    setEditId(c.id);
    setEditNom(c.nom);
    setEditCouleur(c.couleur);
    setEditFamille(c.famille_id);
    setEditSousCats((c.sous_categories ?? []).join(", "));
    setEditEstabs(c.establishments ?? []);
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 100px" }}>
        <a href="/settings" style={{ fontSize: 13, color: "#1a1a1a", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Parametres
        </a>

        <h1 style={{ fontSize: 22, fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px" }}>
          Categories
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: "0 0 20px" }}>
          Gerez les categories de recettes, cocktails et produits. L&apos;ordre et les noms sont utilises dans le catalogue et les fiches.
        </p>

        {/* Add button */}
        <button type="button" onClick={() => setShowNew(true)} style={{
          padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
          border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741",
          cursor: "pointer", marginBottom: 16,
        }}>
          + Nouvelle categorie
        </button>

        {/* New category form */}
        {showNew && (
          <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <input value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }} />
              <input type="color" value={newCouleur} onChange={e => setNewCouleur(e.target.value)} style={{ width: 40, height: 36, borderRadius: 8, border: "1px solid #ddd6c8", cursor: "pointer" }} />
              <select value={newFamille} onChange={e => setNewFamille(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
                {FAMILLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} disabled={saving || !newNom.trim()} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.5 : 1 }}>Creer</button>
              <button onClick={() => setShowNew(false)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", color: "#777", fontSize: 12, cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="categories-list">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {categories.map((c, idx) => (
                    <Draggable key={c.id} draggableId={c.id} index={idx}>
                      {(dragProvided, snap) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          style={{
                            ...dragProvided.draggableProps.style,
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "12px 14px", marginBottom: 6,
                            background: snap.isDragging ? "#f9f6f0" : "#fff",
                            border: snap.isDragging ? `2px solid ${c.couleur}` : "1px solid #ddd6c8",
                            borderRadius: 12,
                            boxShadow: snap.isDragging ? "0 6px 20px rgba(0,0,0,0.12)" : "none",
                          }}
                        >
                          {/* Drag handle */}
                          <div {...dragProvided.dragHandleProps} style={{ cursor: "grab", color: "#ccc", flexShrink: 0, touchAction: "none" }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="1.5"/><circle cx="16" cy="4" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="20" r="1.5"/><circle cx="16" cy="20" r="1.5"/></svg>
                          </div>

                          {/* Color dot */}
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.couleur, flexShrink: 0 }} />

                          {/* Edit mode */}
                          {editId === c.id ? (
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <input value={editNom} onChange={e => setEditNom(e.target.value)} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 13 }} />
                                <input type="color" value={editCouleur} onChange={e => setEditCouleur(e.target.value)} style={{ width: 36, height: 32, borderRadius: 6, border: "1px solid #ddd6c8", cursor: "pointer" }} />
                                <select value={editFamille} onChange={e => setEditFamille(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 12 }}>
                                  {FAMILLE_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                              </div>
                              <input value={editSousCats} onChange={e => setEditSousCats(e.target.value)} placeholder="Sous-categories (separees par des virgules)" style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 12 }} />
                              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12 }}>
                                <span style={{ color: "#999", fontWeight: 600 }}>Etabs :</span>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                  <input type="checkbox" checked={editEstabs.includes("bellomio")} onChange={e => setEditEstabs(prev => e.target.checked ? [...prev.filter(x => x !== "bellomio"), "bellomio"] : prev.filter(x => x !== "bellomio"))} style={{ accentColor: "#D4775A" }} />
                                  Bello Mio
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                  <input type="checkbox" checked={editEstabs.includes("piccola")} onChange={e => setEditEstabs(prev => e.target.checked ? [...prev.filter(x => x !== "piccola"), "piccola"] : prev.filter(x => x !== "piccola"))} style={{ accentColor: "#e6c428" }} />
                                  Piccola Mia
                                </label>
                                <span style={{ fontSize: 10, color: "#bbb" }}>(vide = tous)</span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={handleSave} disabled={saving} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Sauver</button>
                                <button onClick={() => setEditId(null)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", color: "#777", fontSize: 11, cursor: "pointer" }}>Annuler</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Name + info */}
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{c.nom}</div>
                                <div style={{ fontSize: 11, color: "#999", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                                  <span>{FAMILLE_LABELS[c.famille_id] ?? c.famille_id}</span>
                                  {c.sous_categories?.length > 0 && <span> · {c.sous_categories.join(", ")}</span>}
                                  {c.establishments && c.establishments.length > 0 && (
                                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: c.establishments.includes("bellomio") && !c.establishments.includes("piccola") ? "rgba(212,119,90,0.1)" : c.establishments.includes("piccola") && !c.establishments.includes("bellomio") ? "rgba(230,196,40,0.1)" : "rgba(0,0,0,0.04)", color: c.establishments.includes("bellomio") && !c.establishments.includes("piccola") ? "#D4775A" : c.establishments.includes("piccola") && !c.establishments.includes("bellomio") ? "#b5960f" : "#999" }}>
                                      {c.establishments.map(e => e === "bellomio" ? "BM" : "PM").join(" + ")}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Slug badge */}
                              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: c.couleur + "15", color: c.couleur, fontWeight: 700, flexShrink: 0 }}>
                                {c.slug}
                              </span>

                              {/* Actions */}
                              <button onClick={() => openEdit(c)} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 12, padding: 4 }} title="Modifier">
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              </button>
                              <button onClick={() => handleDelete(c.id, c.nom)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 12, padding: 4 }} title="Supprimer">
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </RequireRole>
  );
}
