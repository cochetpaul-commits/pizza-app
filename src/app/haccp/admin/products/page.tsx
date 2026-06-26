"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  FormSection,
  HaccpPageShell,
  NumberStepper,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { fetchProducts, type Product } from "@/lib/haccp";
import { supabase } from "@/lib/supabaseClient";

interface FormState {
  id: string | null;
  name: string;
  supplier: string;
  barcode: string;
  shelf_life_days: number | null;
}

const empty = (): FormState => ({
  id: null,
  name: "",
  supplier: "",
  barcode: "",
  shelf_life_days: 3
});

export default function AdminProductsPage() {
  const { current } = useEtablissement();
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(empty());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    if (!current?.id) {
      setItems([]);
      return;
    }
    setItems(await fetchProducts(current.id));
  }, [current?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startNew() {
    setForm(empty());
    setEditing(true);
  }

  function startEdit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      supplier: p.supplier ?? "",
      barcode: p.barcode ?? "",
      shelf_life_days: p.shelf_life_days
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setForm(empty());
  }

  async function save() {
    if (!current?.id || !form.name) return;
    setBusy(true);
    try {
      const row = {
        etablissement_id: current.id,
        name: form.name,
        supplier: form.supplier || null,
        barcode: form.barcode || null,
        shelf_life_days: form.shelf_life_days ?? 3
      };
      if (form.id) {
        const { error } = await supabase
          .from("haccp_products")
          .update(row)
          .eq("id", form.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("haccp_products").insert(row);
        if (error) throw new Error(error.message);
      }
      await refresh();
      cancel();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("haccp_products").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  const filtered = query
    ? items.filter((p) =>
        [p.name, p.supplier, p.barcode]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(query.toLowerCase()))
      )
    : items;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <HaccpPageShell title="Produits référents" back="/haccp/admin">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour gérer ses produits.
          </StatusBanner>
        ) : (
          <>
            <FormSection
              title={`Catalogue (${items.length})`}
              right={
                !editing && (
                  <button
                    type="button"
                    onClick={startNew}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 800,
                      color: T.terracotta,
                      textDecoration: "underline",
                      cursor: "pointer"
                    }}
                  >
                    + Ajouter
                  </button>
                )
              }
            >
              {items.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <TextField
                    value={query}
                    onChange={setQuery}
                    placeholder="Rechercher (nom, fournisseur, code-barres)…"
                  />
                </div>
              )}
              {filtered.length === 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    color: T.muted,
                    background: "#fff",
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    padding: 14,
                    margin: 0
                  }}
                >
                  {query ? "Aucun résultat." : "Aucun produit. Importe ou ajoute-en un à la main."}
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    background: "#fff",
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    overflow: "hidden"
                  }}
                >
                  {filtered.map((p, idx) => (
                    <li
                      key={p.id}
                      style={{
                        padding: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        borderTop: idx === 0 ? "none" : `1px solid ${T.border}`
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: T.dark,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {p.name}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                          {p.supplier ?? "—"} · DLC {p.shelf_life_days} j
                          {p.barcode ? ` · ${p.barcode}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" onClick={() => startEdit(p)} style={btnSecondary}>
                          Éditer
                        </button>
                        <button type="button" onClick={() => remove(p.id)} style={btnDanger}>
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FormSection>

            {editing && (
              <>
                <FormSection title={form.id ? "Édition" : "Nouveau produit"}>
                  <TextField
                    value={form.name}
                    onChange={(v) => setForm({ ...form, name: v })}
                    placeholder="Nom du produit"
                  />
                </FormSection>

                <FormSection title="Fournisseur">
                  <TextField
                    value={form.supplier}
                    onChange={(v) => setForm({ ...form, supplier: v })}
                    placeholder="ex. Metro, Mael…"
                  />
                </FormSection>

                <FormSection title="Code-barres (EAN)">
                  <TextField
                    value={form.barcode}
                    onChange={(v) => setForm({ ...form, barcode: v })}
                    placeholder="optionnel"
                  />
                </FormSection>

                <FormSection title="Durée de conservation (jours)">
                  <NumberStepper
                    value={form.shelf_life_days}
                    onChange={(v) => setForm({ ...form, shelf_life_days: v })}
                    step={1}
                  />
                </FormSection>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={cancel} style={btnGhost}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !form.name}
                    style={{
                      ...btnPrimary,
                      opacity: busy || !form.name ? 0.4 : 1,
                      cursor: busy || !form.name ? "not-allowed" : "pointer"
                    }}
                  >
                    {busy ? "…" : form.id ? "Enregistrer" : "Créer"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </HaccpPageShell>
    </RequireRole>
  );
}

const btnPrimary = {
  flex: 1,
  background: T.dark,
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer"
} as const;

const btnGhost = {
  flex: 1,
  background: "#fff",
  color: T.dark,
  border: `1px solid ${T.border}`,
  borderRadius: 12,
  padding: "12px 16px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer"
} as const;

const btnSecondary = {
  background: "#fff",
  color: T.dark,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer"
} as const;

const btnDanger = {
  background: "#fff",
  color: T.terracotta,
  border: `1px solid ${T.terracotta}`,
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer"
} as const;
