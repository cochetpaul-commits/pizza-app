"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Ingredient = {
  id: string;
  name: string;
  category: string;
  allergens: string | null;
  is_active: boolean;
  default_unit: string;

  purchase_price: number | null; // ex: 22.95
  purchase_unit: number | null; // ex: 1000
  purchase_unit_label: string | null; // ex: "g"
  purchase_unit_name: string; // ex: "kg"

  cost_per_unit: number | null; // GENERATED ALWAYS => lecture seule (€/g si unit_label="g")

  density_g_per_ml: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;
};

const CATEGORIES = [
  "charcuterie",
  "fromage",
  "poisson",
  "viande",
  "legume",
  "herbe",
  "epicerie",
  "alcool",
  "autre",
];

function nfmt(v: number | null | undefined, digits = 3) {
  if (v == null || !Number.isFinite(v)) return "—";
  return Number(v).toFixed(digits);
}

function parseNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const v = Number(t.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export default function IngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);

  // Recherche
  const [q, setQ] = useState("");

  // Ajout
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("epicerie");
  const [newPricePerKg, setNewPricePerKg] = useState(""); // € / kg

  // Edition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    name: string;
    category: string;
    allergens: string;
    is_active: boolean;
    default_unit: string;

    purchase_price: string;
    purchase_unit: string;
    purchase_unit_label: string;
    purchase_unit_name: string;

    density_g_per_ml: string;
    piece_weight_g: string;
    piece_volume_ml: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((x) => x.name.toLowerCase().includes(qq));
  }, [items, q]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ingredients")
      .select(
        [
          "id",
          "name",
          "category",
          "allergens",
          "is_active",
          "default_unit",
          "purchase_price",
          "purchase_unit",
          "purchase_unit_label",
          "purchase_unit_name",
          "cost_per_unit",
          "density_g_per_ml",
          "piece_weight_g",
          "piece_volume_ml",
        ].join(",")
      )
      .order("name", { ascending: true });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setItems(((data ?? []) as unknown) as Ingredient[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addIngredient(e: React.FormEvent) {
    e.preventDefault();

    const name = newName.trim();
    if (!name) return;

    const pricePerKg = parseNum(newPricePerKg);
    // Si prix/kg est renseigné -> on stocke purchase_price=prix et purchase_unit=1000g
    // La DB calcule cost_per_unit = purchase_price / purchase_unit => €/g
    const payload: any = {
      name,
      category: newCategory,
      is_active: true,
      default_unit: "g",
      purchase_unit_name: "kg", // NOT NULL dans ta DB
    };

    if (pricePerKg != null) {
      payload.purchase_price = pricePerKg;
      payload.purchase_unit = 1000;
      payload.purchase_unit_label = "g";
      payload.purchase_unit_name = "kg";
    }

    // IMPORTANT: on n’envoie JAMAIS cost_per_unit (GENERATED ALWAYS)
    const { error } = await supabase.from("ingredients").insert(payload);
    if (error) {
      alert(error.message);
      return;
    }

    setNewName("");
    setNewPricePerKg("");
    await load();
  }

  function startEdit(x: Ingredient) {
    setEditingId(x.id);
    setEdit({
      name: x.name ?? "",
      category: x.category ?? "epicerie",
      allergens: x.allergens ?? "",
      is_active: !!x.is_active,
      default_unit: x.default_unit ?? "g",

      purchase_price: x.purchase_price == null ? "" : String(x.purchase_price),
      purchase_unit: x.purchase_unit == null ? "" : String(x.purchase_unit),
      purchase_unit_label: x.purchase_unit_label ?? "g",
      purchase_unit_name: x.purchase_unit_name ?? "kg",

      density_g_per_ml: x.density_g_per_ml == null ? "" : String(x.density_g_per_ml),
      piece_weight_g: x.piece_weight_g == null ? "" : String(x.piece_weight_g),
      piece_volume_ml: x.piece_volume_ml == null ? "" : String(x.piece_volume_ml),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit() {
    if (!editingId || !edit) return;

    const payload: any = {
      name: edit.name.trim(),
      category: edit.category,
      allergens: edit.allergens.trim() === "" ? null : edit.allergens.trim(),
      is_active: edit.is_active,
      default_unit: edit.default_unit,

      purchase_price: parseNum(edit.purchase_price),
      purchase_unit: parseNum(edit.purchase_unit),
      purchase_unit_label: edit.purchase_unit_label.trim() === "" ? null : edit.purchase_unit_label.trim(),
      purchase_unit_name: (edit.purchase_unit_name.trim() || "kg"),

      density_g_per_ml: parseNum(edit.density_g_per_ml),
      piece_weight_g: parseNum(edit.piece_weight_g),
      piece_volume_ml: parseNum(edit.piece_volume_ml),
    };

    // IMPORTANT : cost_per_unit = GENERATED ALWAYS => ne jamais l'envoyer !
    const { error } = await supabase.from("ingredients").update(payload).eq("id", editingId);
    if (error) {
      alert(error.message);
      return;
    }

    cancelEdit();
    await load();
  }

  async function del(id: string, name: string) {
    const ok = window.confirm(`Supprimer cet ingrédient ?\n\n${name}`);
    if (!ok) return;

    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
  }

  return (
    <main className="container">
      <div className="rowBetween" style={{ marginTop: 12 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Index ingrédients</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Le coût affiché vient de <b>cost_per_unit</b> (calculé automatiquement) = <b>purchase_price / purchase_unit</b>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn" href="/">Dashboard</Link>
          <button className="btn" type="button" onClick={load}>Rafraîchir</button>
        </div>
      </div>

      {/* AJOUT */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardTitle">Ajouter un ingrédient</div>

        <form onSubmit={addIngredient} style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
            <input
              className="input"
              placeholder="Nom (ex: Basilic)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />

            <select className="input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <input
              className="input"
              placeholder="Prix en €/kg (→ calc €/g) ex: 18,50"
              inputMode="decimal"
              value={newPricePerKg}
              onChange={(e) => setNewPricePerKg(e.target.value)}
            />

            <button className="btn btnPrimary" type="submit">
              Ajouter
            </button>
          </div>

          <p className="muted" style={{ margin: 0 }}>
            Exemple : si tu mets <b>18,50 €/kg</b>, on stocke purchase_unit=1000g et la DB calcule automatiquement <b>0,0185 €/g</b>.
          </p>
        </form>
      </div>

      {/* RECHERCHE */}
      <div style={{ marginTop: 12 }}>
        <input
          className="input"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* LISTE */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="muted" style={{ marginBottom: 10 }}>
          {loading ? "Chargement…" : `${filtered.length} ingrédient(s)`}
        </div>

        {filtered.length === 0 && !loading ? (
          <p className="muted" style={{ margin: 0 }}>Aucun ingrédient.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((x) => {
              const isEditing = editingId === x.id;

              return (
                <div key={x.id} className="listRow" style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{x.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {x.category} • {x.is_active ? "actif" : "inactif"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", minWidth: 180 }}>
                        <div style={{ fontWeight: 800 }}>
                          {x.cost_per_unit == null ? "—" : `${nfmt(x.cost_per_unit, 6)} €/g`}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          purchase: {x.purchase_price ?? "—"} / {x.purchase_unit ?? "—"} {x.purchase_unit_label ?? ""} ({x.purchase_unit_name})
                        </div>
                      </div>
                    </div>

                    {isEditing && edit ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
                          <input
                            className="input"
                            value={edit.name}
                            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                            placeholder="Nom"
                          />
                          <select
                            className="input"
                            value={edit.category}
                            onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                          <input
                            className="input"
                            value={edit.allergens}
                            onChange={(e) => setEdit({ ...edit, allergens: e.target.value })}
                            placeholder="Allergènes (optionnel)"
                          />
                          <select
                            className="input"
                            value={edit.is_active ? "true" : "false"}
                            onChange={(e) => setEdit({ ...edit, is_active: e.target.value === "true" })}
                          >
                            <option value="true">Actif</option>
                            <option value="false">Inactif</option>
                          </select>
                        </div>

                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                          <input
                            className="input"
                            value={edit.purchase_price}
                            onChange={(e) => setEdit({ ...edit, purchase_price: e.target.value })}
                            placeholder="purchase_price (ex: 22.95)"
                            inputMode="decimal"
                          />
                          <input
                            className="input"
                            value={edit.purchase_unit}
                            onChange={(e) => setEdit({ ...edit, purchase_unit: e.target.value })}
                            placeholder="purchase_unit (ex: 1000)"
                            inputMode="decimal"
                          />
                          <input
                            className="input"
                            value={edit.purchase_unit_label}
                            onChange={(e) => setEdit({ ...edit, purchase_unit_label: e.target.value })}
                            placeholder="unit label (ex: g)"
                          />
                          <input
                            className="input"
                            value={edit.purchase_unit_name}
                            onChange={(e) => setEdit({ ...edit, purchase_unit_name: e.target.value })}
                            placeholder="unit name (ex: kg)"
                          />
                        </div>

                        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
                          <input
                            className="input"
                            value={edit.density_g_per_ml}
                            onChange={(e) => setEdit({ ...edit, density_g_per_ml: e.target.value })}
                            placeholder="densité g/ml (optionnel)"
                            inputMode="decimal"
                          />
                          <input
                            className="input"
                            value={edit.piece_weight_g}
                            onChange={(e) => setEdit({ ...edit, piece_weight_g: e.target.value })}
                            placeholder="poids pièce g (optionnel)"
                            inputMode="decimal"
                          />
                          <input
                            className="input"
                            value={edit.piece_volume_ml}
                            onChange={(e) => setEdit({ ...edit, piece_volume_ml: e.target.value })}
                            placeholder="volume pièce ml (optionnel)"
                            inputMode="decimal"
                          />
                        </div>

                        <p className="muted" style={{ margin: 0 }}>
                          Note : <b>cost_per_unit</b> est calculé par la DB, donc tu modifies seulement <b>purchase_price</b> et <b>purchase_unit</b>.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isEditing ? (
                      <>
                        <button className="btn btnPrimary" type="button" onClick={saveEdit}>
                          Sauvegarder
                        </button>
                        <button className="btn" type="button" onClick={cancelEdit}>
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btnPrimary" type="button" onClick={() => startEdit(x)}>
                          Modifier
                        </button>
                        <button className="btn btnDanger" type="button" onClick={() => del(x.id, x.name)}>
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}