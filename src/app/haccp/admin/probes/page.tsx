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
import { fetchEquipments, type Equipment } from "@/lib/haccp";
import { supabase } from "@/lib/supabaseClient";

// Mapping deveui → équipement, utilisé par l'Edge Function lorawan-webhook
// pour insérer un Reading source='probe' avec calcul de conformité.

interface ProbeMapping {
  dev_eui: string;
  etablissement_id: string;
  equipment_id: string | null;
  label: string | null;
  vendor: string | null;
  model: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface FormState {
  isEdit: boolean;
  originalDevEui: string | null;
  dev_eui: string;
  equipment_id: string;
  label: string;
  vendor: string;
  model: string;
  active: boolean;
}

const empty = (): FormState => ({
  isEdit: false,
  originalDevEui: null,
  dev_eui: "",
  equipment_id: "",
  label: "",
  vendor: "Dragino",
  model: "LHT65N",
  active: true
});

export default function AdminProbesPage() {
  const { current } = useEtablissement();
  const [items, setItems] = useState<ProbeMapping[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [form, setForm] = useState<FormState>(empty());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!current?.id) {
      setItems([]);
      setEquipments([]);
      return;
    }
    const [mappings, eqs] = await Promise.all([
      supabase
        .from("haccp_probe_mappings")
        .select("*")
        .eq("etablissement_id", current.id)
        .order("dev_eui"),
      fetchEquipments(current.id)
    ]);
    setItems((mappings.data as ProbeMapping[]) ?? []);
    setEquipments(eqs);
  }, [current?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function startNew() {
    setForm(empty());
    setEditing(true);
  }

  function startEdit(m: ProbeMapping) {
    setForm({
      isEdit: true,
      originalDevEui: m.dev_eui,
      dev_eui: m.dev_eui,
      equipment_id: m.equipment_id ?? "",
      label: m.label ?? "",
      vendor: m.vendor ?? "",
      model: m.model ?? "",
      active: m.active
    });
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setForm(empty());
  }

  async function save() {
    if (!current?.id) return;
    const dev_eui = form.dev_eui.trim().toLowerCase();
    if (!dev_eui) return;
    setBusy(true);
    try {
      const row = {
        dev_eui,
        etablissement_id: current.id,
        equipment_id: form.equipment_id || null,
        label: form.label || null,
        vendor: form.vendor || null,
        model: form.model || null,
        active: form.active
      };
      if (form.isEdit && form.originalDevEui) {
        const { error } = await supabase
          .from("haccp_probe_mappings")
          .update(row)
          .eq("dev_eui", form.originalDevEui)
          .eq("etablissement_id", current.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("haccp_probe_mappings").insert(row);
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

  async function remove(devEui: string) {
    if (!current?.id) return;
    if (!confirm(`Supprimer la sonde ${devEui} ?`)) return;
    const { error } = await supabase
      .from("haccp_probe_mappings")
      .delete()
      .eq("dev_eui", devEui)
      .eq("etablissement_id", current.id);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <HaccpPageShell title="Sondes LoRaWAN" back="/haccp/admin">
        {!current?.id ? (
          <StatusBanner tone="info">
            Choisis un établissement pour gérer ses sondes.
          </StatusBanner>
        ) : (
          <>
            <FormSection
              title={`Mapping deveui (${items.length})`}
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
                  Aucune sonde. Ajoute le DevEUI imprimé sur la Dragino LHT65N et associe-la à un équipement.
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
                  {items.map((m, idx) => {
                    const eq = equipments.find((e) => e.id === m.equipment_id);
                    return (
                      <li
                        key={m.dev_eui}
                        style={{
                          padding: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          borderTop: idx === 0 ? "none" : `1px solid ${T.border}`,
                          opacity: m.active ? 1 : 0.55
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: T.dark,
                              fontFamily: "ui-monospace, SF Mono, Menlo, monospace"
                            }}
                          >
                            {m.dev_eui}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                            {eq ? `→ ${eq.name}` : "non associée"}
                            {m.label ? ` · ${m.label}` : ""}
                            {m.vendor || m.model
                              ? ` · ${[m.vendor, m.model].filter(Boolean).join(" ")}`
                              : ""}
                            {!m.active ? " · désactivée" : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => startEdit(m)} style={btnSecondary}>
                            Éditer
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(m.dev_eui)}
                            style={btnDanger}
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FormSection>

            {editing && (
              <>
                <FormSection title={form.isEdit ? "Édition" : "Nouvelle sonde"}>
                  <TextField
                    value={form.dev_eui}
                    onChange={(v) => setForm({ ...form, dev_eui: v })}
                    placeholder="DevEUI (ex. a840411b8189a4d2)"
                  />
                </FormSection>

                <FormSection title="Équipement associé">
                  {equipments.length === 0 ? (
                    <StatusBanner tone="warn">
                      Aucun équipement créé. Crée-en un d&apos;abord, puis associe la sonde.
                    </StatusBanner>
                  ) : (
                    <select
                      value={form.equipment_id}
                      onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}
                      style={{
                        width: "100%",
                        background: "#fff",
                        border: `1px solid ${T.border}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontSize: 14,
                        fontWeight: 700,
                        color: T.dark,
                        fontFamily: "inherit"
                      }}
                    >
                      <option value="">— Non associée —</option>
                      {equipments.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} ({e.zone})
                        </option>
                      ))}
                    </select>
                  )}
                </FormSection>

                <FormSection title="Étiquette (optionnel)">
                  <TextField
                    value={form.label}
                    onChange={(v) => setForm({ ...form, label: v })}
                    placeholder="ex. Frigo desserts"
                  />
                </FormSection>

                <FormSection title="Vendeur">
                  <TextField
                    value={form.vendor}
                    onChange={(v) => setForm({ ...form, vendor: v })}
                    placeholder="Dragino"
                  />
                </FormSection>

                <FormSection title="Modèle">
                  <TextField
                    value={form.model}
                    onChange={(v) => setForm({ ...form, model: v })}
                    placeholder="LHT65N"
                  />
                </FormSection>

                <FormSection title="État">
                  <ChipGroup<"on" | "off">
                    options={[
                      { value: "on", label: "Active" },
                      { value: "off", label: "Désactivée" }
                    ]}
                    value={form.active ? "on" : "off"}
                    onChange={(v) => setForm({ ...form, active: v === "on" })}
                  />
                </FormSection>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" onClick={cancel} style={btnGhost}>
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !form.dev_eui.trim()}
                    style={{
                      ...btnPrimary,
                      opacity: busy || !form.dev_eui.trim() ? 0.4 : 1,
                      cursor: busy || !form.dev_eui.trim() ? "not-allowed" : "pointer"
                    }}
                  >
                    {busy ? "…" : form.isEdit ? "Enregistrer" : "Créer"}
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
