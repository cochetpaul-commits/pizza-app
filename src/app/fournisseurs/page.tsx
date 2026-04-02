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
  franco_obligatoire: boolean | null;
  mercuriale_only: boolean | null;
  delivery_schedule: { day: string; cutoff: string; delivery_day: string }[] | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  siret: string | null;
  category: string | null;
  payment_terms: string | null;
  delivery_days: string[] | null;
  website: string | null;
  tva_intra: string | null;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  send_orders: boolean;
  _isNew?: boolean;
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
  franco_obligatoire: boolean;
  mercuriale_only: boolean;
  notes: string;
  address: string;
  city: string;
  postal_code: string;
  siret: string;
  category: string;
  payment_terms: string;
  delivery_days: string;
  website: string;
  tva_intra: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const CATEGORY_LABELS: Record<string, string> = {
  alimentaire_general: "Alimentaire général",
  cremerie_frais: "Crémerie / Frais",
  vins: "Vins",
  boissons_spiritueux: "Boissons / Spiritueux",
  spiritueux: "Spiritueux",
  viande_charcuterie: "Viande / Charcuterie",
  emballage: "Emballage",
  surgeles: "Surgelés",
  glaces: "Glaces",
  produits_fins: "Produits fins",
};

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const JOURS_FULL = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

function makeEmptyContact(): Contact {
  return { id: crypto.randomUUID(), name: "", email: "", phone: "", role: "", send_orders: false, _isNew: true };
}

const labelStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "10px 12px",
  border: "1.5px solid #e5ddd0", borderRadius: 10, width: "100%",
  background: "#fff", color: "#1a1a1a", outline: "none",
};
const readonlyBadge: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 600,
  padding: "2px 8px", borderRadius: 6, display: "inline-block",
};

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [stats, setStats] = useState<Map<string, SupplierStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const { current: etab } = useEtablissement();

  // Modal state
  const [modalSupplier, setModalSupplier] = useState<SupplierRow | null>(null);
  const [form, setForm] = useState<ModalForm>({ contact_name: "", phone: "", email: "", franco_minimum: "", franco_obligatoire: false, mercuriale_only: false, notes: "", address: "", city: "", postal_code: "", siret: "", category: "", payment_terms: "", delivery_days: "", website: "", tva_intra: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [schedule, setSchedule] = useState<{day:string;cutoff:string;delivery_day:string}[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deletedContactIds, setDeletedContactIds] = useState<string[]>([]);
  const [originalContactIds, setOriginalContactIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);

    const supQuery = supabase.from("suppliers").select("id,name,is_active,email,phone,contact_name,notes,franco_minimum,franco_obligatoire,mercuriale_only,delivery_schedule,address,city,postal_code,siret,category,payment_terms,delivery_days,website,tva_intra").order("name");
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

  async function openModal(s: SupplierRow) {
    setModalSupplier(s);
    setForm({
      contact_name: s.contact_name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      franco_minimum: s.franco_minimum != null ? String(s.franco_minimum) : "",
      franco_obligatoire: s.franco_obligatoire ?? false,
      mercuriale_only: s.mercuriale_only ?? false,
      notes: s.notes ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      postal_code: s.postal_code ?? "",
      siret: s.siret ?? "",
      category: s.category ?? "",
      payment_terms: s.payment_terms ?? "",
      delivery_days: (s.delivery_days ?? []).join(", "),
      website: s.website ?? "",
      tva_intra: s.tva_intra ?? "",
    });
    setSchedule(Array.isArray(s.delivery_schedule) ? s.delivery_schedule : []);
    setSaved(false);
    setDeletedContactIds([]);

    // Load contacts
    const { data: contactsData } = await supabase
      .from("supplier_contacts")
      .select("*")
      .eq("supplier_id", s.id)
      .order("created_at", { ascending: true });

    const dbContacts = (contactsData ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: (c.name as string) ?? "",
      email: (c.email as string) ?? "",
      phone: (c.phone as string) ?? "",
      role: (c.role as string) ?? "",
      send_orders: (c.send_orders as boolean) ?? false,
    }));
    setContacts(dbContacts);
    setOriginalContactIds(new Set(dbContacts.map((c: Contact) => c.id)));
  }

  function closeModal() {
    setModalSupplier(null);
  }

  function updateContact(idx: number, field: keyof Contact, value: string | boolean) {
    setContacts((prev) => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function addContact() {
    setContacts((prev) => [...prev, makeEmptyContact()]);
  }

  function removeContact(idx: number) {
    const c = contacts[idx];
    if (originalContactIds.has(c.id)) {
      setDeletedContactIds((prev) => [...prev, c.id]);
    }
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveModal() {
    if (!modalSupplier) return;
    setSaving(true);
    const francoVal = form.franco_minimum.trim();
    const deliveryArr = form.delivery_days.trim()
      ? form.delivery_days.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
      : null;
    const updates = {
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contact_name: form.contact_name.trim() || null,
      notes: form.notes.trim() || null,
      franco_minimum: francoVal ? parseFloat(francoVal) : null,
      franco_obligatoire: form.franco_obligatoire,
      mercuriale_only: form.mercuriale_only,
      delivery_schedule: schedule.length > 0 ? schedule : null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      siret: form.siret.trim() || null,
      category: form.category.trim() || null,
      payment_terms: form.payment_terms.trim() || null,
      delivery_days: deliveryArr,
      website: form.website.trim() || null,
      tva_intra: form.tva_intra.trim() || null,
    };

    // 1) Save supplier
    const { error } = await supabase.from("suppliers").update(updates).eq("id", modalSupplier.id);
    if (error) { setSaving(false); alert(error.message); return; }

    // 2) Delete removed contacts
    if (deletedContactIds.length > 0) {
      const { error: delErr } = await supabase
        .from("supplier_contacts")
        .delete()
        .in("id", deletedContactIds);
      if (delErr) { setSaving(false); alert(delErr.message); return; }
    }

    // 3) Upsert contacts (only those with a name)
    const validContacts = contacts.filter((c) => c.name.trim());
    if (validContacts.length > 0) {
      const toUpsert = validContacts.map((c) => ({
        id: c._isNew ? undefined : c.id,
        supplier_id: modalSupplier.id,
        name: c.name.trim(),
        email: c.email.trim() || null,
        phone: c.phone.trim() || null,
        role: c.role.trim() || null,
        send_orders: c.send_orders,
      }));

      const toInsert = toUpsert.filter((c) => !c.id);
      const toUpdate = toUpsert.filter((c) => c.id);

      if (toInsert.length > 0) {
        const inserts = toInsert.map(({ id: _id, ...rest }) => rest);
        const { error: insErr } = await supabase.from("supplier_contacts").insert(inserts);
        if (insErr) { setSaving(false); alert(insErr.message); return; }
      }

      for (const row of toUpdate) {
        const { id: contactId, ...rest } = row;
        const { error: updErr } = await supabase
          .from("supplier_contacts")
          .update(rest)
          .eq("id", contactId!);
        if (updErr) { setSaving(false); alert(updErr.message); return; }
      }
    }

    setSaving(false);
    setSuppliers((prev) => prev.map((s) =>
      s.id === modalSupplier.id
        ? { ...s, ...updates }
        : s
    ));
    closeModal();
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

            {/* Category + delivery badges */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {s.category && (
                <span style={{ ...readonlyBadge, background: `${sColor}18`, color: sColor }}>
                  {CATEGORY_LABELS[s.category] ?? s.category}
                </span>
              )}
              {s.city && (
                <span style={{ ...readonlyBadge, background: "#f0ede6", color: "#999" }}>
                  {s.city}{s.postal_code ? ` (${s.postal_code})` : ""}
                </span>
              )}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginTop: 4 }}>
              {s.contact_name || s.email || s.phone
                ? [s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")
                : "Coordonnees non renseignees"}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span><strong>{st?.refCount ?? 0}</strong> <span style={{ color: "#999" }}>ref.</span></span>
              {s.delivery_days && s.delivery_days.length > 0 && (
                <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                  Livr. {s.delivery_days.map(d => d.slice(0, 3)).join(", ")}
                </span>
              )}
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
    <RequireRole allowedRoles={["group_admin", "equipier"]}>
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
              {/* Section: Coordonnées */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Coordonnées
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Contact</div>
                  <input style={inputStyle} value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Prénom Nom" />
                </div>
                <div>
                  <div style={labelStyle}>Téléphone</div>
                  <input style={inputStyle} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="06 xx xx xx xx" type="tel" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Email</div>
                  <input style={inputStyle} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="contact@fournisseur.fr" type="email" />
                </div>
                <div>
                  <div style={labelStyle}>Site web</div>
                  <input style={inputStyle} value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="fournisseur.fr" />
                </div>
              </div>

              {/* Section: Adresse */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
                Adresse
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={labelStyle}>Adresse</div>
                <input style={inputStyle} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Rue, numéro" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Code postal</div>
                  <input style={inputStyle} value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} placeholder="35400" />
                </div>
                <div>
                  <div style={labelStyle}>Ville</div>
                  <input style={inputStyle} value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Saint-Malo" />
                </div>
              </div>

              {/* Section: Infos commerciales */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
                Infos commerciales
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>Categorie</div>
                  <select
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    <option value="">—</option>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={labelStyle}>Conditions paiement</div>
                  <input style={inputStyle} value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} placeholder="30 jours fin de mois" />
                </div>
              </div>

              {/* Section: Franco & Livraison */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
                Franco & Livraison
              </div>
              <div style={{ background: "#fff", border: "1.5px solid #e5ddd0", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                {/* Franco row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <div style={labelStyle}>Franco de port (EUR HT)</div>
                    <input style={{ ...inputStyle, width: 110 }} value={form.franco_minimum} onChange={(e) => setForm((f) => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 200" type="number" min="0" step="10" />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", paddingTop: 14 }}>
                    <input type="checkbox" checked={form.mercuriale_only} onChange={(e) => setForm((f) => ({ ...f, mercuriale_only: e.target.checked }))} style={{ accentColor: modalColor }} />
                    <span style={{ fontSize: 11, color: "#666" }}>Mercuriale uniquement</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", paddingTop: 14 }}>
                    <input type="checkbox" checked={form.franco_obligatoire} onChange={(e) => setForm((f) => ({ ...f, franco_obligatoire: e.target.checked }))} style={{ accentColor: modalColor }} />
                    <span style={{ fontSize: 11, color: "#666" }}>Franco obligatoire</span>
                  </label>
                </div>

                {/* Schedule table */}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Planning commande → livraison
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 3 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "3px 6px" }}>Jour cde</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "3px 6px" }}>Heure lim.</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "3px 6px" }}>Jour livr.</div>
                </div>
                {JOURS_FULL.map((jour) => {
                  const rule = schedule.find(r => r.day === jour);
                  return (
                    <div key={jour} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, marginBottom: 1 }}>
                      <div style={{ padding: "6px", fontSize: 12, color: rule ? "#1a1a1a" : "#ccc", fontWeight: rule ? 600 : 400, background: rule ? "#faf8f4" : "transparent", borderRadius: 5 }}>
                        {jour.charAt(0).toUpperCase() + jour.slice(1)}
                      </div>
                      <input
                        style={{ ...inputStyle, padding: "5px 6px", fontSize: 12, background: rule ? "#faf8f4" : "#fff" }}
                        value={rule?.cutoff ?? ""}
                        placeholder="hh:mm"
                        onChange={(e) => {
                          const val = e.target.value;
                          setSchedule(prev => {
                            const existing = prev.find(r => r.day === jour);
                            if (existing) return prev.map(r => r.day === jour ? { ...r, cutoff: val } : r);
                            if (val) return [...prev, { day: jour, cutoff: val, delivery_day: "" }];
                            return prev;
                          });
                        }}
                      />
                      <select
                        style={{ ...inputStyle, padding: "5px 6px", fontSize: 12, cursor: "pointer", background: rule ? "#faf8f4" : "#fff" }}
                        value={rule?.delivery_day ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSchedule(prev => {
                            const existing = prev.find(r => r.day === jour);
                            if (existing) return prev.map(r => r.day === jour ? { ...r, delivery_day: val } : r);
                            if (val) return [...prev, { day: jour, cutoff: "", delivery_day: val }];
                            return prev;
                          });
                        }}
                      >
                        <option value="">—</option>
                        {JOURS_FULL.map(j => (
                          <option key={j} value={j}>{j.charAt(0).toUpperCase() + j.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Section: Admin */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
                Administratif
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={labelStyle}>SIRET</div>
                  <input style={inputStyle} value={form.siret} onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))} placeholder="123 456 789 00012" />
                </div>
                <div>
                  <div style={labelStyle}>N° TVA intra.</div>
                  <input style={inputStyle} value={form.tva_intra} onChange={(e) => setForm((f) => ({ ...f, tva_intra: e.target.value }))} placeholder="FR12345678901" />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Notes</div>
                <textarea
                  style={{ ...inputStyle, resize: "vertical" }}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Informations complementaires..."
                  rows={2}
                />
              </div>

              {/* Section: Contacts / Destinataires */}
              <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16 }}>
                Contacts / Destinataires
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {contacts.map((c, idx) => (
                  <div
                    key={c.id}
                    style={{
                      border: "1px solid #ddd6c8", borderRadius: 8, padding: "8px 10px",
                      background: "#faf8f4", position: "relative",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => removeContact(idx)}
                      title="Supprimer"
                      style={{
                        position: "absolute", top: 4, right: 6,
                        fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
                        color: "#c44", background: "none", border: "none", cursor: "pointer",
                        padding: "0 4px", lineHeight: 1,
                      }}
                    >
                      X
                    </button>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Nom</div>
                        <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} value={c.name} onChange={(e) => updateContact(idx, "name", e.target.value)} placeholder="Prenom Nom" />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Role</div>
                        <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} value={c.role} onChange={(e) => updateContact(idx, "role", e.target.value)} placeholder="Commercial..." />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, alignItems: "end" }}>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Email</div>
                        <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} value={c.email} onChange={(e) => updateContact(idx, "email", e.target.value)} placeholder="email@fournisseur.fr" type="email" />
                      </div>
                      <div>
                        <div style={{ ...labelStyle, marginBottom: 2 }}>Tel</div>
                        <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }} value={c.phone} onChange={(e) => updateContact(idx, "phone", e.target.value)} placeholder="06 xx xx xx xx" type="tel" />
                      </div>
                      <label style={{
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                        fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#666",
                        paddingBottom: 8, cursor: "pointer",
                      }}>
                        <input
                          type="checkbox"
                          checked={c.send_orders}
                          onChange={(e) => updateContact(idx, "send_orders", e.target.checked)}
                          style={{ accentColor: modalColor }}
                        />
                        Cdes
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addContact}
                style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 600,
                  color: modalColor, background: "none", border: `1.5px solid ${modalColor}`,
                  borderRadius: 20, padding: "5px 12px", cursor: "pointer", marginBottom: 16,
                }}
              >
                + Ajouter un contact
              </button>

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
                  {saving ? "..." : "Enregistrer"}
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
