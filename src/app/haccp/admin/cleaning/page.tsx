"use client";

import { useCallback, useEffect, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";
import {
  ChipGroup,
  FormSection,
  HaccpPageShell,
  StatusBanner,
  TextField
} from "@/components/haccp/FormBlocks";
import { fetchCleaningTasks, type CleaningTask } from "@/lib/haccp";
import { supabase } from "@/lib/supabaseClient";

type Frequency = "day" | "week" | "month";

const FREQ_LABEL: Record<Frequency, string> = {
  day:   "Quotidien",
  week:  "Hebdo",
  month: "Mensuel"
};

const FREQ_COLOR: Record<Frequency, string> = {
  day:   "#E2603B",
  week:  "#E8B23A",
  month: "#3E7BFB"
};

interface FormState {
  id: string | null;
  label: string;
  zone: string;
  detail: string;
  frequency: Frequency;
}

const empty = (): FormState => ({
  id: null, label: "", zone: "", detail: "", frequency: "day"
});

export default function AdminCleaningPage() {
  const { current } = useEtablissement();
  const [items, setItems] = useState<CleaningTask[]>([]);
  const [form, setForm] = useState<FormState>(empty());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!current?.id) {
      setItems([]);
      return;
    }
    setItems(await fetchCleaningTasks(current.id));
  }, [current?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startNew() {
    setForm(empty());
    setEditing(true);
  }

  function startEdit(t: CleaningTask) {
    setForm({
      id: t.id,
      label: t.label,
      zone: t.zone,
      detail: t.detail ?? "",
      frequency: t.frequency
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setForm(empty());
  }

  async function save() {
    if (!current?.id || !form.label || !form.zone) return;
    setBusy(true);
    try {
      const row = {
        etablissement_id: current.id,
        label: form.label,
        zone: form.zone,
        detail: form.detail || null,
        frequency: form.frequency
      };
      if (form.id) {
        const { error } = await supabase
          .from("haccp_cleaning_tasks")
          .update(row)
          .eq("id", form.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("haccp_cleaning_tasks").insert(row);
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
    if (!confirm("Supprimer cette tâche ? Les relevés associés seront conservés.")) return;
    const { error } = await supabase.from("haccp_cleaning_tasks").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  const grouped: Record<Frequency, CleaningTask[]> = {
    day:   items.filter((t) => t.frequency === "day"),
    week:  items.filter((t) => t.frequency === "week"),
    month: items.filter((t) => t.frequency === "month")
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <HaccpPageShell title="Tâches de nettoyage" back="/haccp/admin">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour gérer ses tâches.
          </StatusBanner>
        ) : (
          <>
            <FormSection
              title={`Plan de nettoyage (${items.length})`}
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
                  Aucune tâche. Construis ton plan quotidien / hebdo / mensuel.
                </p>
              ) : (
                (["day", "week", "month"] as const).map((freq) => {
                  if (grouped[freq].length === 0) return null;
                  return (
                    <div key={freq} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 6
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: FREQ_COLOR[freq]
                          }}
                        />
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.muted, letterSpacing: 1, textTransform: "uppercase" }}>
                          {FREQ_LABEL[freq]} ({grouped[freq].length})
                        </span>
                      </div>
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
                        {grouped[freq].map((t, idx) => (
                          <li
                            key={t.id}
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
                              <div style={{ fontSize: 14, fontWeight: 800, color: T.dark }}>
                                {t.label}
                              </div>
                              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                                {t.zone}
                                {t.detail ? ` · ${t.detail}` : ""}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="button" onClick={() => startEdit(t)} style={btnSecondary}>
                                Éditer
                              </button>
                              <button type="button" onClick={() => remove(t.id)} style={btnDanger}>
                                ✕
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </FormSection>

            {editing && (
              <>
                <FormSection title={form.id ? "Édition" : "Nouvelle tâche"}>
                  <TextField
                    value={form.label}
                    onChange={(v) => setForm({ ...form, label: v })}
                    placeholder="ex. Nettoyer les plans de travail"
                  />
                </FormSection>

                <FormSection title="Zone">
                  <TextField
                    value={form.zone}
                    onChange={(v) => setForm({ ...form, zone: v })}
                    placeholder="ex. Cuisine, Bar, Salle"
                  />
                </FormSection>

                <FormSection title="Détail (méthode, produit)">
                  <TextField
                    value={form.detail}
                    onChange={(v) => setForm({ ...form, detail: v })}
                    multiline
                    placeholder="Optionnel — produit utilisé, méthode, temps de contact…"
                  />
                </FormSection>

                <FormSection title="Fréquence">
                  <ChipGroup<Frequency>
                    options={[
                      { value: "day",   label: "Quotidien" },
                      { value: "week",  label: "Hebdo" },
                      { value: "month", label: "Mensuel" }
                    ]}
                    value={form.frequency}
                    onChange={(v) => setForm({ ...form, frequency: v as Frequency })}
                  />
                </FormSection>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={cancel} style={btnGhost}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !form.label || !form.zone}
                    style={{
                      ...btnPrimary,
                      opacity: busy || !form.label || !form.zone ? 0.4 : 1,
                      cursor: busy || !form.label || !form.zone ? "not-allowed" : "pointer"
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
