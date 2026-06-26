"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  ChipGroup,
  FormSection,
  HaccpPageShell,
  NumberStepper,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { fetchEquipments, type Equipment } from "@/lib/haccp";
import { supabase } from "@/lib/supabaseClient";

type Kind = "fridge" | "freezer" | "coldroom" | "display";

const KIND_LABEL: Record<Kind, string> = {
  fridge:   "Frigo",
  freezer:  "Congélateur",
  coldroom: "Chambre froide",
  display:  "Vitrine"
};

const KIND_DEFAULT: Record<Kind, { min_c: number; max_c: number; default_c: number }> = {
  fridge:   { min_c: 0,   max_c: 4,   default_c: 3 },
  freezer:  { min_c: -25, max_c: -18, default_c: -18 },
  coldroom: { min_c: 0,   max_c: 4,   default_c: 3 },
  display:  { min_c: 0,   max_c: 4,   default_c: 3 }
};

interface FormState {
  id: string | null;
  name: string;
  zone: string;
  kind: Kind;
  min_c: number | null;
  max_c: number | null;
  default_c: number | null;
}

const empty = (): FormState => ({
  id: null, name: "", zone: "", kind: "fridge",
  ...KIND_DEFAULT.fridge
});

export default function AdminEquipmentsPage() {
  const { current } = useEtablissement();
  const [items, setItems] = useState<Equipment[]>([]);
  const [form, setForm] = useState<FormState>(empty());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!current?.id) {
      setItems([]);
      return;
    }
    setItems(await fetchEquipments(current.id));
  }, [current?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startNew() {
    setForm(empty());
    setEditing(true);
  }

  function startEdit(e: Equipment) {
    setForm({
      id: e.id,
      name: e.name,
      zone: e.zone,
      kind: e.kind,
      min_c: e.min_c,
      max_c: e.max_c,
      default_c: e.default_c
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setForm(empty());
  }

  function onKindChange(k: Kind) {
    setForm((f) => ({
      ...f,
      kind: k,
      // Pré-remplir min/max si l'utilisateur n'a pas encore saisi de valeurs custom.
      min_c: f.min_c == null ? KIND_DEFAULT[k].min_c : f.min_c,
      max_c: f.max_c == null ? KIND_DEFAULT[k].max_c : f.max_c,
      default_c: f.default_c == null ? KIND_DEFAULT[k].default_c : f.default_c
    }));
  }

  async function save() {
    if (!current?.id) return;
    if (!form.name || !form.zone || form.min_c == null || form.max_c == null) return;
    setBusy(true);
    try {
      const row = {
        etablissement_id: current.id,
        name: form.name,
        zone: form.zone,
        kind: form.kind,
        min_c: form.min_c,
        max_c: form.max_c,
        default_c: form.default_c ?? form.min_c
      };
      if (form.id) {
        const { error } = await supabase
          .from("haccp_equipments")
          .update(row)
          .eq("id", form.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("haccp_equipments").insert(row);
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
    if (!confirm("Supprimer cet équipement ? Les relevés associés seront conservés.")) return;
    const { error } = await supabase.from("haccp_equipments").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <HaccpPageShell title="Équipements" back="/haccp/admin">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour gérer ses équipements.
          </StatusBanner>
        ) : (
          <>
            <FormSection
              title={`Liste (${items.length})`}
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
              {items.length === 0 ? (
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
                  Aucun équipement. Ajoute frigos, congélateurs, vitrines…
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
                  {items.map((e, idx) => (
                    <li
                      key={e.id}
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
                          {e.name}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                          {KIND_LABEL[e.kind as Kind]} · {e.zone} ·{" "}
                          {fmtRange(e.kind, e.min_c, e.max_c)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => startEdit(e)}
                          style={btnSecondary}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          style={btnDanger}
                        >
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
                <FormSection title={form.id ? "Édition" : "Nouvel équipement"}>
                  <TextField
                    value={form.name}
                    onChange={(v) => setForm({ ...form, name: v })}
                    placeholder="Nom (ex. Frigo bar 1)"
                  />
                </FormSection>

                <FormSection title="Zone">
                  <TextField
                    value={form.zone}
                    onChange={(v) => setForm({ ...form, zone: v })}
                    placeholder="ex. Cuisine, Bar, Réserve"
                  />
                </FormSection>

                <FormSection title="Type">
                  <ChipGroup<Kind>
                    options={[
                      { value: "fridge",   label: "Frigo" },
                      { value: "freezer",  label: "Congélateur" },
                      { value: "coldroom", label: "Chambre froide" },
                      { value: "display",  label: "Vitrine" }
                    ]}
                    value={form.kind}
                    onChange={(v) => onKindChange(v as Kind)}
                  />
                </FormSection>

                <FormSection title="Température min (°C)">
                  <NumberStepper
                    value={form.min_c}
                    onChange={(v) => setForm({ ...form, min_c: v })}
                    unit="°C"
                  />
                </FormSection>

                <FormSection title="Température max (°C)">
                  <NumberStepper
                    value={form.max_c}
                    onChange={(v) => setForm({ ...form, max_c: v })}
                    unit="°C"
                  />
                </FormSection>

                <FormSection title="Cible / défaut (°C)">
                  <NumberStepper
                    value={form.default_c}
                    onChange={(v) => setForm({ ...form, default_c: v })}
                    unit="°C"
                  />
                </FormSection>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={cancel} style={btnGhost}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !form.name || !form.zone}
                    style={{
                      ...btnPrimary,
                      opacity: busy || !form.name || !form.zone ? 0.4 : 1,
                      cursor: busy || !form.name || !form.zone ? "not-allowed" : "pointer"
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

function fmtRange(kind: string, min: number, max: number): string {
  if (kind === "freezer") return `≤ ${fmtC(max)}`;
  return `${fmtC(min)} → ${fmtC(max)}`;
}
function fmtC(v: number) {
  return `${v > 0 ? "+" : ""}${Number(v).toFixed(1).replace(".", ",")} °C`;
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
