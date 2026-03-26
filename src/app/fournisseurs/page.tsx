"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getSupplierColor } from "@/lib/supplierColors";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type SupplierRow = {
  id: string;
  name: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  notes: string | null;
  franco_minimum: number | null;
};

type SupplierStats = {
  refCount: number;
  lastImport: string | null;
  lastImportNumber: string | null;
};

type ModalForm = {
  contact_name: string;
  phone: string;
  email: string;
  franco_minimum: string;
  notes: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const labelStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "10px 12px",
  border: "1.5px solid #e5ddd0", borderRadius: 10, width: "100%",
  background: "#fff", color: "#1a1a1a", outline: "none",
};

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [stats, setStats] = useState<Map<string, SupplierStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const { current: etab } = useEtablissement();

  // Modal state
  const [modalSupplier, setModalSupplier] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<ModalForm>({ contact_name: "", phone: "", email: "", franco_minimum: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const supQuery = supabase.from("suppliers").select("id,name,is_active,email,phone,contact_name,notes,franco_minimum").order("name");
    if (etab) supQuery.eq("etablissement_id", etab.id);

    const invQuery = supabase.from("supplier_invoices")
        .select("supplier_id,created_at,invoice_number")
        .order("created_at", { ascending: false });
    if (etab) invQuery.eq("etablissement_id", etab.id);

    const [supRes, offRes, invRes] = await Promise.all([
      supQuery,
      supabase.from("v_latest_offers").select("supplier_id"),
      invQuery,
    ]);

    const rawRows = (supRes.data ?? []) as SupplierRow[];

    // Deduplicate by name (accent+case insensitive)
    const seen = new Map<string, { canonical: SupplierRow; aliasIds: string[] }>();
    for (const s of rawRows) {
      const key = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { canonical: s, aliasIds: [s.id] });
      } else {
        seen.get(key)!.aliasIds.push(s.id);
      }
    }
    const rows = Array.from(seen.values()).map((v) => v.canonical);
    setSuppliers(rows);

    // Ref counts from latest offers
    const offerCounts = new Map<string, number>();
    for (const o of (offRes.data ?? [])) {
      if (o.supplier_id) offerCounts.set(o.supplier_id, (offerCounts.get(o.supplier_id) ?? 0) + 1);
    }

    // Last import per supplier
    const lastImports = new Map<string, { created_at: string; invoice_number: string | null }>();
    for (const inv of (invRes.data ?? [])) {
      if (inv.supplier_id && !lastImports.has(inv.supplier_id)) {
        lastImports.set(inv.supplier_id, { created_at: inv.created_at, invoice_number: inv.invoice_number });
      }
    }

    // Merge stats across aliases
    const m = new Map<string, SupplierStats>();
    for (const { canonical, aliasIds } of seen.values()) {
      let refCount = 0;
      let lastImport: string | null = null;
      let lastImportNumber: string | null = null;
      for (const aid of aliasIds) {
        refCount += offerCounts.get(aid) ?? 0;
        const li = lastImports.get(aid);
        if (li && (!lastImport || li.created_at > lastImport)) {
          lastImport = li.created_at;
          lastImportNumber = li.invoice_number;
        }
      }
      m.set(canonical.id, { refCount, lastImport, lastImportNumber });
    }

    setStats(m);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etab?.id]);

  useEffect(() => { load(); }, [load]);

  function openModal(s: SupplierRow) {
    setModalSupplier(s);
    setForm({
      contact_name: s.contact_name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      franco_minimum: s.franco_minimum != null ? String(s.franco_minimum) : "",
      notes: s.notes ?? "",
    });
    setSaved(false);
  }

  function closeModal() {
    setModalSupplier(null);
  }

  async function saveModal() {
    if (!modalSupplier) return;
    setSaving(true);
    const francoVal = form.franco_minimum.trim();
    const { error } = await supabase.from("suppliers").update({
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contact_name: form.contact_name.trim() || null,
      notes: form.notes.trim() || null,
      franco_minimum: francoVal ? parseFloat(francoVal) : null,
    }).eq("id", modalSupplier.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSaved(true);
    // Update local state
    setSuppliers((prev) => prev.map((s) =>
      s.id === modalSupplier.id
        ? { ...s, contact_name: form.contact_name.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, franco_minimum: francoVal ? parseFloat(francoVal) : null, notes: form.notes.trim() || null }
        : s
    ));
    setTimeout(() => setSaved(false), 2000);
  }

  const active = suppliers.filter((s) => s.is_active);
  const inactive = suppliers.filter((s) => !s.is_active);

  function renderCard(s: SupplierRow) {
    const st = stats.get(s.id);
    const sColor = getSupplierColor(s.name);
    return (
      <div key={s.id} style={{
        border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        borderLeft: `4px solid ${sColor}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => openModal(s)}
                style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 15, color: sColor, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
              >
                {s.name}
              </button>
              {!s.is_active && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                  background: "rgba(0,0,0,0.08)", color: "#999",
                }}>inactif</span>
              )}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginTop: 4 }}>
              {s.contact_name || s.email || s.phone
                ? [s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")
                : "Coordonnees non renseignees"}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span><strong>{st?.refCount ?? 0}</strong> <span style={{ color: "#999" }}>ref.</span></span>
              <span style={{ color: "#999", fontSize: 12 }}>
                {st?.lastImport
                  ? `Import : ${fmtDate(st.lastImport)}${st.lastImportNumber ? ` · ${st.lastImportNumber}` : ""}`
                  : "Aucun import"}
              </span>
            </div>
          </div>

          <button
            onClick={() => openModal(s)}
            style={{
              fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
              background: "#D4775A", color: "#fff", borderRadius: 20, border: "none",
              padding: "7px 16px", cursor: "pointer", whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Fiche
          </button>
        </div>
      </div>
    );
  }

  const modalColor = modalSupplier ? getSupplierColor(modalSupplier.name) : "#D4775A";

  return (
    <RequireRole allowedRoles={["group_admin", "cuisine", "salle"]}>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 24,
          color: "#1a1a1a", margin: "0 0 20px", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          Fournisseurs
        </h1>

        {loading && <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>}

        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map(renderCard)}

            {inactive.length > 0 && (
              <>
                <div style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 700,
                  color: "#999", letterSpacing: "0.08em", textTransform: "uppercase",
                  marginTop: 16, marginBottom: 4,
                }}>
                  Inactifs
                </div>
                {inactive.map(renderCard)}
              </>
            )}

            {suppliers.length === 0 && (
              <p style={{ color: "#999", fontSize: 14, textAlign: "center" }}>Aucun fournisseur en base.</p>
            )}
          </div>
        )}
      </main>

      {/* ═══ MODALE FICHE FOURNISSEUR ═══ */}
      {modalSupplier && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
              borderLeft: `5px solid ${modalColor}`,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "18px 20px 12px",
            }}>
              <span style={{
                fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700,
                fontSize: 20, color: modalColor, textTransform: "uppercase",
              }}>
                {modalSupplier.name}
              </span>
              <button
                onClick={closeModal}
                style={{
                  width: 30, height: 30, borderRadius: 8, border: "none",
                  background: "rgba(0,0,0,0.06)", color: "#999", fontSize: 16,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Contact</div>
                  <input style={inputStyle} value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Prenom Nom" />
                </div>
                <div>
                  <div style={labelStyle}>Telephone</div>
                  <input style={inputStyle} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="06 xx xx xx xx" type="tel" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Email</div>
                  <input style={inputStyle} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="contact@fournisseur.fr" type="email" />
                </div>
                <div>
                  <div style={labelStyle}>Franco minimum (EUR HT)</div>
                  <input style={inputStyle} value={form.franco_minimum} onChange={(e) => setForm((f) => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 800" />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Notes</div>
                <textarea
                  style={{ ...inputStyle, resize: "vertical" }}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Delai de livraison, conditions..."
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={saveModal}
                  disabled={saving}
                  style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
                    background: modalColor, color: "#fff", border: "none", borderRadius: 20,
                    padding: "8px 20px", cursor: "pointer", opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "..." : saved ? "Enregistre !" : "Enregistrer"}
                </button>

                <Link
                  href={`/ingredients?supplier=${modalSupplier.id}`}
                  style={{
                    fontFamily: "DM Sans, sans-serif", fontSize: 12, color: modalColor,
                    textDecoration: "none", fontWeight: 600,
                  }}
                >
                  Voir les articles →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}
