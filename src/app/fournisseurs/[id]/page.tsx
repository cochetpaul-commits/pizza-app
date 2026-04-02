/*
-- SQL: table supplier_contacts
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  send_orders BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
*/
"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";

/**
 * SQL to add new columns:
 * ALTER TABLE suppliers
 *   ADD COLUMN IF NOT EXISTS franco_obligatoire BOOLEAN DEFAULT false,
 *   ADD COLUMN IF NOT EXISTS mercuriale_only BOOLEAN DEFAULT false,
 *   ADD COLUMN IF NOT EXISTS delivery_schedule JSONB;
 */

type DeliveryRule = { day: string; cutoff: string; delivery_day: string };

type SupplierFull = {
  id: string; name: string; is_active: boolean;
  email: string | null; phone: string | null; contact_name: string | null;
  notes: string | null; franco_minimum: number | null;
  franco_obligatoire: boolean | null; mercuriale_only: boolean | null;
  delivery_schedule: DeliveryRule[] | null;
  address: string | null; city: string | null; postal_code: string | null;
  siret: string | null; category: string | null; payment_terms: string | null;
  delivery_days: string[] | null; website: string | null; tva_intra: string | null;
};

type Invoice = {
  id: string; invoice_number: string | null; invoice_date: string | null;
  total_ht: number | null; created_at: string;
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

const fmtMoney = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function makeEmptyContact(): Contact {
  return { id: crypto.randomUUID(), name: "", email: "", phone: "", role: "", send_orders: false, _isNew: true };
}

export default function FournisseurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? null;

  const [supplier, setSupplier] = useState<SupplierFull | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    email: "", phone: "", contact_name: "", notes: "", franco_minimum: "",
    franco_obligatoire: false, mercuriale_only: false,
    address: "", city: "", postal_code: "", siret: "", category: "",
    payment_terms: "", delivery_days: "", website: "", tva_intra: "",
  });
  const [schedule, setSchedule] = useState<DeliveryRule[]>([]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deletedContactIds, setDeletedContactIds] = useState<string[]>([]);
  // Track original DB contact ids so we know which are truly new
  const [originalContactIds, setOriginalContactIds] = useState<Set<string>>(new Set());

  const prefillContactsFromInvoices = useCallback(async (supplierId: string, sup: SupplierFull) => {
    const suggestions: Contact[] = [];

    // 1) Check supplier table fields first
    if (sup.contact_name || sup.email || sup.phone) {
      suggestions.push({
        id: crypto.randomUUID(),
        name: sup.contact_name ?? "",
        email: sup.email ?? "",
        phone: sup.phone ?? "",
        role: "Principal",
        send_orders: true,
        _isNew: true,
      });
    }

    // 2) Try to extract from parsed_json in supplier_invoices
    const { data: invData } = await supabase
      .from("supplier_invoices")
      .select("parsed_json")
      .eq("supplier_id", supplierId)
      .not("parsed_json", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (invData) {
      for (const row of invData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pj = row.parsed_json as any;
        const info = pj?.supplier_info || pj?.fournisseur || pj?.supplier;
        if (!info) continue;
        const cName = info.name || info.nom || "";
        const cEmail = info.email || "";
        const cPhone = info.phone || info.telephone || "";
        if (!cName && !cEmail && !cPhone) continue;
        // Avoid duplicating what we already suggested from supplier fields
        const isDupe = suggestions.some(
          (s) => (s.email && s.email === cEmail) || (s.name && s.name === cName)
        );
        if (!isDupe) {
          suggestions.push({
            id: crypto.randomUUID(),
            name: cName,
            email: cEmail,
            phone: cPhone,
            role: "",
            send_orders: false,
            _isNew: true,
          });
        }
      }
    }

    if (suggestions.length > 0) {
      setContacts(suggestions);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);

      let invQuery = supabase.from("supplier_invoices")
        .select("id,invoice_number,invoice_date,total_ht,created_at")
        .eq("supplier_id", id);
      if (etabId) invQuery = invQuery.eq("etablissement_id", etabId);
      invQuery = invQuery.order("created_at", { ascending: false }).limit(5);

      const [supRes, invRes, contactsRes] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        invQuery,
        supabase.from("supplier_contacts").select("*").eq("supplier_id", id).order("created_at", { ascending: true }),
      ]);

      if (supRes.data) {
        const s = supRes.data as SupplierFull;
        setSupplier(s);
        setForm({
          email: s.email ?? "", phone: s.phone ?? "",
          contact_name: s.contact_name ?? "", notes: s.notes ?? "",
          franco_minimum: s.franco_minimum != null ? String(s.franco_minimum) : "",
          franco_obligatoire: s.franco_obligatoire ?? false,
          mercuriale_only: s.mercuriale_only ?? false,
          address: s.address ?? "", city: s.city ?? "", postal_code: s.postal_code ?? "",
          siret: s.siret ?? "", category: s.category ?? "", payment_terms: s.payment_terms ?? "",
          delivery_days: (s.delivery_days ?? []).join(", "), website: s.website ?? "", tva_intra: s.tva_intra ?? "",
        });
        setSchedule(Array.isArray(s.delivery_schedule) ? s.delivery_schedule : []);

        // Load contacts
        const dbContacts = (contactsRes.data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          name: (c.name as string) ?? "",
          email: (c.email as string) ?? "",
          phone: (c.phone as string) ?? "",
          role: (c.role as string) ?? "",
          send_orders: (c.send_orders as boolean) ?? false,
        }));

        if (dbContacts.length > 0) {
          setContacts(dbContacts);
          setOriginalContactIds(new Set(dbContacts.map((c: Contact) => c.id)));
        } else {
          // No contacts yet: try to pre-fill
          await prefillContactsFromInvoices(id, s);
        }
      }
      setInvoices((invRes.data ?? []) as Invoice[]);
      setLoading(false);
    })();
  }, [id, etabId, prefillContactsFromInvoices]);

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

  async function save() {
    if (!supplier) return;
    setSaving(true);
    const francoVal = form.franco_minimum.trim();
    const deliveryArr = form.delivery_days.trim()
      ? form.delivery_days.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
      : null;

    // 1) Save supplier
    const { error } = await supabase.from("suppliers").update({
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
    }).eq("id", id);

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
        supplier_id: id,
        name: c.name.trim(),
        email: c.email.trim() || null,
        phone: c.phone.trim() || null,
        role: c.role.trim() || null,
        send_orders: c.send_orders,
      }));

      // Split into inserts and updates
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
    setSaved(true);
    setTimeout(() => {
      router.back();
    }, 400);
  }

  const CATEGORY_LABELS: Record<string, string> = {
    alimentaire_general: "Alimentaire général", cremerie_frais: "Crémerie / Frais", vins: "Vins",
    boissons_spiritueux: "Boissons / Spiritueux", spiritueux: "Spiritueux",
    viande_charcuterie: "Viande / Charcuterie", emballage: "Emballage", surgeles: "Surgelés",
    glaces: "Glaces", produits_fins: "Produits fins",
  };
  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const JOURS_FULL = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

  const labelStyle: React.CSSProperties = { fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "10px 12px",
    border: "1px solid #ddd6c8", borderRadius: 8, width: "100%",
    background: "#fff", color: "#1a1a1a", outline: "none",
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 700, color: "#999",
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: 16,
  };

  if (loading) return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ color: "#999", fontSize: 14 }}>Chargement...</p>
    </div>
  );

  if (!supplier) return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <p style={{ color: "#999", fontSize: 14 }}>Fournisseur introuvable.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
      {/* Back + title */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push("/fournisseurs")}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "#999",
            background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8,
          }}
        >
          ← Retour aux fournisseurs
        </button>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a", margin: 0 }}>
          {supplier.name}
        </h1>
      </div>

      {/* Coordonnées */}
      <div style={{ border: "1px solid #ddd6c8", borderRadius: 10, padding: "16px 18px", marginBottom: 16, background: "#fff" }}>
        <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1a1a", marginBottom: 14 }}>
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

        {/* Adresse */}
        <div style={sectionTitle}>Adresse</div>
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

        {/* Infos commerciales */}
        <div style={sectionTitle}>Infos commerciales</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={labelStyle}>Catégorie</div>
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
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

        {/* ─── FRANCO & LIVRAISON ─── */}
        <div style={sectionTitle}>Franco & Livraison</div>
        <div style={{ background: "#fff", border: "1.5px solid #e5ddd0", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          {/* Franco row */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={labelStyle}>Franco de port (EUR HT)</div>
              <input style={{ ...inputStyle, width: 120 }} value={form.franco_minimum} onChange={(e) => setForm((f) => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 200" type="number" min="0" step="10" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingTop: 16 }}>
              <input type="checkbox" checked={form.mercuriale_only} onChange={(e) => setForm((f) => ({ ...f, mercuriale_only: e.target.checked }))} />
              <span style={{ fontSize: 12, color: "#666" }}>Produits en mercuriale uniquement</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", paddingTop: 16 }}>
              <input type="checkbox" checked={form.franco_obligatoire} onChange={(e) => setForm((f) => ({ ...f, franco_obligatoire: e.target.checked }))} />
              <span style={{ fontSize: 12, color: "#666" }}>Franco obligatoire</span>
            </label>
          </div>

          {/* Schedule table */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Planning commande → livraison
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "4px 8px" }}>Jour de commande</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "4px 8px" }}>Heure limite</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", padding: "4px 8px" }}>Jour de livraison</div>
          </div>
          {JOURS_FULL.map((jour) => {
            const rule = schedule.find(r => r.day === jour);
            return (
              <div key={jour} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 2 }}>
                <div style={{ padding: "8px", fontSize: 13, color: rule ? "#1a1a1a" : "#ccc", fontWeight: rule ? 600 : 400, background: rule ? "#faf8f4" : "transparent", borderRadius: 6 }}>
                  {jour.charAt(0).toUpperCase() + jour.slice(1)}
                </div>
                <input
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, background: rule ? "#faf8f4" : "#fff" }}
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
                  style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, cursor: "pointer", background: rule ? "#faf8f4" : "#fff" }}
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

        {/* Administratif */}
        <div style={sectionTitle}>Administratif</div>
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

        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>Notes</div>
          <textarea
            style={{ ...inputStyle, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Informations complémentaires..."
            rows={2}
          />
        </div>

        {/* Contacts / Destinataires */}
        <div style={sectionTitle}>Contacts / Destinataires</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {contacts.map((c, idx) => (
            <div
              key={c.id}
              style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                border: "1px solid #ddd6c8", borderRadius: 10, padding: "10px 12px",
                background: "#faf8f4",
              }}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Nom</div>
                    <input
                      style={inputStyle}
                      value={c.name}
                      onChange={(e) => updateContact(idx, "name", e.target.value)}
                      placeholder="Prenom Nom"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Role</div>
                    <input
                      style={inputStyle}
                      value={c.role}
                      onChange={(e) => updateContact(idx, "role", e.target.value)}
                      placeholder="Commercial, comptable..."
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Email</div>
                    <input
                      style={inputStyle}
                      value={c.email}
                      onChange={(e) => updateContact(idx, "email", e.target.value)}
                      placeholder="email@fournisseur.fr"
                      type="email"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>Telephone</div>
                    <input
                      style={inputStyle}
                      value={c.phone}
                      onChange={(e) => updateContact(idx, "phone", e.target.value)}
                      placeholder="06 xx xx xx xx"
                      type="tel"
                    />
                  </div>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                    fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#666",
                    paddingBottom: 10, cursor: "pointer",
                  }}>
                    <input
                      type="checkbox"
                      checked={c.send_orders}
                      onChange={(e) => updateContact(idx, "send_orders", e.target.checked)}
                      style={{ accentColor: "#D4775A" }}
                    />
                    Commandes
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeContact(idx)}
                title="Supprimer ce contact"
                style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 700,
                  color: "#c44", background: "none", border: "none", cursor: "pointer",
                  padding: "2px 6px", lineHeight: 1, marginTop: 2, borderRadius: 4,
                }}
              >
                X
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addContact}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
            color: "#D4775A", background: "none", border: "1.5px solid #D4775A",
            borderRadius: 20, padding: "6px 14px", cursor: "pointer", marginBottom: 16,
          }}
        >
          + Ajouter un contact
        </button>

        <div>
          <button
            onClick={save}
            disabled={saving}
            style={{
              fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
              background: "#D4775A", color: "#fff", border: "none", borderRadius: 20,
              padding: "8px 18px", cursor: "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Enregistrement..." : saved ? "Enregistre" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Derniers imports */}
      {invoices.length > 0 && (
        <div style={{ border: "1px solid #ddd6c8", borderRadius: 10, padding: "16px 18px", background: "#fff" }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1a1a", marginBottom: 12 }}>
            Derniers imports
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invoices.map((inv) => (
              <div key={inv.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 12px", background: "#f6eedf", borderRadius: 8, fontSize: 13,
                fontFamily: "DM Sans, sans-serif",
              }}>
                <span>
                  {inv.invoice_number ? `N° ${inv.invoice_number}` : "—"}
                  {inv.invoice_date ? ` · ${inv.invoice_date}` : ""}
                </span>
                <span style={{ fontWeight: 600 }}>{fmtMoney(inv.total_ht)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lien ingredients */}
      <div style={{ marginTop: 16 }}>
        <Link
          href={`/ingredients?supplier=${id}`}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "#D4775A",
            textDecoration: "none", fontWeight: 600,
          }}
        >
          Voir les articles de ce fournisseur →
        </Link>
      </div>
    </div>
  );
}
