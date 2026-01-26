"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Category =
  | "charcuterie"
  | "fromage"
  | "poisson"
  | "viande"
  | "legume"
  | "herbe"
  | "epicerie"
  | "alcool"
  | "autre";

type Ingredient = {
  id: string;
  name: string;
  category: Category;
  allergens: string | null;
  is_active: boolean;
  default_unit: string;

  purchase_price: number | null;
  purchase_unit: number | null;
  purchase_unit_label: string | null;
  purchase_unit_name: string | null;

  cost_per_unit: number | null; 

  density_g_per_ml: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;

  source_prep_recipe_id?: string | null;
  source_prep_recipe_name?: string | null;
};

type IngredientUpsert = {
  name: string;
  category: Category;
  allergens: string | null;
  is_active: boolean;
  default_unit: string;
  purchase_price: number | null;
  purchase_unit: number | null;
  purchase_unit_label: string | null;
  purchase_unit_name: string | null;
  density_g_per_ml: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;
  source_prep_recipe_id?: string | null;
  source_prep_recipe_name?: string | null;
};

const CATEGORIES: Category[] = [
  "charcuterie", "fromage", "poisson", "viande", "legume", "herbe", "epicerie", "alcool", "autre",
];

const CAT_COLORS: Record<Category, string> = {
  charcuterie: "#C2415C", fromage: "#F59E0B", poisson: "#2563EB", viande: "#B91C1C",
  legume: "#16A34A", herbe: "#22C55E", epicerie: "#6B7280", alcool: "#7C3AED", autre: "#111827",
};

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const v = Number(t.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPriceLine(x: Ingredient): { main: string; sub: string } {
  const cpu = x.cost_per_unit;
  const lbl = (x.purchase_unit_label ?? "").toLowerCase().trim();
  const unitName = (x.purchase_unit_name ?? "kg").toLowerCase();

  if (cpu != null && Number.isFinite(cpu)) {
    // Cas du KG ou du LITRE (On stocke tout en g ou ml internement)
    if (lbl === "g" || lbl === "ml") {
      const perBase = cpu * 1000;
      const displayUnit = unitName === "l" ? "L" : "kg";
      const sub = x.purchase_price != null ? `${fmtMoney(x.purchase_price)} € / ${displayUnit}` : "—";
      return { main: `${fmtMoney(perBase)} €/${displayUnit}`, sub: `base: ${sub}` };
    }

    // Cas de la PIÈCE
    if (lbl === "pc" || lbl === "pcs") {
      const sub = x.piece_weight_g ? `poids pièce: ${fmtMoney(x.piece_weight_g)} g` : "poids pièce: —";
      return { main: `${fmtMoney(cpu)} €/pc`, sub };
    }
  }

  return { main: "—", sub: "prix non renseigné" };
}

export default function IngredientsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // States Création
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("autre");
  const [newMode, setNewMode] = useState<"kg" | "l" | "pc">("kg");
  const [newPrice, setNewPrice] = useState("");
  const [newPieceWeightG, setNewPieceWeightG] = useState("");
  const [newDensity, setNewDensity] = useState("1.0");

  // States Edition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string;
    category: Category;
    is_active: boolean;
    mode: "kg" | "l" | "pc";
    price: string;
    pieceWeightG: string;
    density: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((x) => (x.name ?? "").toLowerCase().includes(qq));
  }, [items, q]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      alert(error.message);
    } else {
      setItems((data ?? []) as Ingredient[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addIngredient(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const price = parseNum(newPrice);
    if (!name || price == null || price <= 0) {
      alert("Nom et prix valides obligatoires.");
      return;
    }

    const payload: IngredientUpsert = {
      name,
      category: newCategory,
      allergens: null,
      is_active: true,
      default_unit: newMode === "l" ? "ml" : "g",
      purchase_price: price,
      purchase_unit: newMode === "pc" ? 1 : 1000,
      purchase_unit_label: newMode === "l" ? "ml" : (newMode === "kg" ? "g" : "pc"),
      purchase_unit_name: newMode,
      density_g_per_ml: newMode === "l" ? (parseNum(newDensity) || 1.0) : 1.0,
      piece_weight_g: newMode === "pc" ? parseNum(newPieceWeightG) : null,
      piece_volume_ml: null,
    };

    const { error } = await supabase.from("ingredients").insert(payload);
    if (error) alert(error.message);
    else {
      setNewName(""); setNewPrice(""); setNewPieceWeightG(""); setNewDensity("1.0");
      await load();
    }
  }

  function startEdit(x: Ingredient) {
    const uName = (x.purchase_unit_name ?? "kg").toLowerCase() as "kg" | "l" | "pc";
    setEditingId(x.id);
    setEdit({
      name: x.name,
      category: x.category,
      is_active: x.is_active,
      mode: uName,
      price: x.purchase_price?.toString() || "",
      pieceWeightG: x.piece_weight_g?.toString() || "",
      density: x.density_g_per_ml?.toString() || "1.0",
    });
  }

  async function saveEdit() {
    if (!editingId || !edit) return;
    const price = parseNum(edit.price);
    if (!edit.name.trim() || price == null) return;

    const payload: Partial<IngredientUpsert> = {
      name: edit.name.trim(),
      category: edit.category,
      is_active: edit.is_active,
      purchase_price: price,
      purchase_unit: edit.mode === "pc" ? 1 : 1000,
      purchase_unit_label: edit.mode === "l" ? "ml" : (edit.mode === "kg" ? "g" : "pc"),
      purchase_unit_name: edit.mode,
      density_g_per_ml: edit.mode === "l" ? parseNum(edit.density) : 1.0,
      piece_weight_g: edit.mode === "pc" ? parseNum(edit.pieceWeightG) : null,
    };

    const { error } = await supabase.from("ingredients").update(payload).eq("id", editingId);
    if (error) alert(error.message);
    else {
      setEditingId(null);
      await load();
    }
  }

  async function del(id: string, name: string) {
    if (window.confirm(`Supprimer ${name} ?`)) {
      await supabase.from("ingredients").delete().eq("id", id);
      await load();
    }
  }

  // UI Styles
  const cardPad: React.CSSProperties = { padding: 16 };
  const label: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 6 };
  const input: React.CSSProperties = { width: "100%", height: 44, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", padding: "0 12px", fontSize: 16, background: "rgba(255,255,255,0.65)" };
  const select: React.CSSProperties = { ...input, paddingRight: 34 };

  return (
    <main className="container">
      <div className="rowBetween" style={{ marginTop: 12 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Index ingrédients</h1>
          <p className="muted">Gérez vos coûts au kg, au litre ou à la pièce.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn" href="/">Dashboard</Link>
          <button className="btn" onClick={load}>Rafraîchir</button>
        </div>
      </div>

      {/* CREATION */}
      <div className="card" style={{ ...cardPad, marginTop: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>Créer un ingrédient</div>
        <form onSubmit={addIngredient} style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <div style={label}>Ingrédient</div>
              <input style={input} placeholder="Ex: Huile d'olive" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <div style={label}>Catégorie</div>
              <select style={select} value={newCategory} onChange={(e) => setNewCategory(e.target.value as Category)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <div>
              <div style={label}>Mode d'achat & Prix</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <select style={select} value={newMode} onChange={(e) => setNewMode(e.target.value as any)}>
                  <option value="kg">Kilo (kg)</option>
                  <option value="l">Litre (L)</option>
                  <option value="pc">Pièce (pc)</option>
                </select>
                <input style={input} placeholder="Prix" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
              </div>
            </div>
            <button className="btn btnPrimary" type="submit" style={{ height: 44 }}>Ajouter</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {newMode === "l" && (
              <div>
                <div style={label}>Densité (kg/L) - Ex: 0.92 pour l'huile</div>
                <input style={input} value={newDensity} onChange={(e) => setNewDensity(e.target.value)} />
              </div>
            )}
            {newMode === "pc" && (
              <div>
                <div style={label}>Poids d'une pièce (g)</div>
                <input style={input} placeholder="Ex: 125" value={newPieceWeightG} onChange={(e) => setNewPieceWeightG(e.target.value)} />
              </div>
            )}
          </div>
        </form>
      </div>

      {/* RECHERCHE */}
      <input style={{ ...input, marginTop: 12 }} placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} />

      {/* LISTE */}
      <div className="card" style={{ ...cardPad, marginTop: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((x) => {
            const isEditing = editingId === x.id;
            const price = fmtPriceLine(x);
            return (
              <div key={x.id} style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: CAT_COLORS[x.category] }}>{x.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {x.source_prep_recipe_name ? `Pivot: ${x.source_prep_recipe_name}` : x.category}
                    </div>
                  </div>
                  <div>
                    <div style={label}>Densité / Poids</div>
                    <div style={{ fontWeight: 600 }}>
                      {x.purchase_unit_name === "l" ? `${x.density_g_per_ml} kg/L` : x.piece_weight_g ? `${x.piece_weight_g} g/pc` : "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 950, fontSize: 18 }}>{price.main}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{price.sub}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {!isEditing ? (
                      <button className="btn btnPrimary" onClick={() => startEdit(x)}>Modifier</button>
                    ) : (
                      <button className="btn btnPrimary" onClick={saveEdit}>OK</button>
                    )}
                    <button className="btn btnDanger" onClick={() => del(x.id, x.name)}>X</button>
                  </div>
                </div>

                {isEditing && edit && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee", display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <input style={input} value={edit.name} onChange={e => setEdit({...edit, name: e.target.value})} />
                      <input style={input} placeholder="Prix" value={edit.price} onChange={e => setEdit({...edit, price: e.target.value})} />
                      <select style={select} value={edit.mode} onChange={e => setEdit({...edit, mode: e.target.value as any})}>
                        <option value="kg">kg</option>
                        <option value="l">L</option>
                        <option value="pc">pc</option>
                      </select>
                    </div>
                    {edit.mode === "l" && <input style={input} placeholder="Densité" value={edit.density} onChange={e => setEdit({...edit, density: e.target.value})} />}
                    {edit.mode === "pc" && <input style={input} placeholder="Poids pièce (g)" value={edit.pieceWeightG} onChange={e => setEdit({...edit, pieceWeightG: e.target.value})} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
