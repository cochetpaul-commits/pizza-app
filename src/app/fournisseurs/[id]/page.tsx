"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";

type SupplierFull = {
  id: string; name: string; is_active: boolean;
  email: string | null; phone: string | null; contact_name: string | null;
  notes: string | null; franco_minimum: number | null;
};

type Invoice = {
  id: string; invoice_number: string | null; invoice_date: string | null;
  total_ht: number | null; created_at: string;
};

const fmtMoney = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

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

  const [form, setForm] = useState({ email: "", phone: "", contact_name: "", notes: "", franco_minimum: "" });

  useEffect(() => {
    (async () => {
      setLoading(true);

      let invQuery = supabase.from("supplier_invoices")
        .select("id,invoice_number,invoice_date,total_ht,created_at")
        .eq("supplier_id", id);
      if (etabId) invQuery = invQuery.eq("etablissement_id", etabId);
      invQuery = invQuery.order("created_at", { ascending: false }).limit(5);

      const [supRes, invRes] = await Promise.all([
        supabase.from("suppliers").select("*").eq("id", id).single(),
        invQuery,
      ]);

      if (supRes.data) {
        const s = supRes.data as SupplierFull;
        setSupplier(s);
        setForm({
          email: s.email ?? "", phone: s.phone ?? "",
          contact_name: s.contact_name ?? "", notes: s.notes ?? "",
          franco_minimum: s.franco_minimum != null ? String(s.franco_minimum) : "",
        });
      }
      setInvoices((invRes.data ?? []) as Invoice[]);
      setLoading(false);
    })();
  }, [id, etabId]);

  async function save() {
    if (!supplier) return;
    setSaving(true);
    const francoVal = form.franco_minimum.trim();
    const { error } = await supabase.from("suppliers").update({
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contact_name: form.contact_name.trim() || null,
      notes: form.notes.trim() || null,
      franco_minimum: francoVal ? parseFloat(francoVal) : null,
    }).eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const labelStyle: React.CSSProperties = { fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    fontFamily: "DM Sans, sans-serif", fontSize: 14, padding: "10px 12px",
    border: "1px solid #ddd6c8", borderRadius: 8, width: "100%",
    background: "#fff", color: "#1a1a1a", outline: "none",
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
          onClick={() => router.push("/achats")}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13, color: "#999",
            background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8,
          }}
        >
          ← Retour aux achats
        </button>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a", margin: 0 }}>
          {supplier.name}
        </h1>
      </div>

      {/* Coordonnees */}
      <div style={{ border: "1px solid #ddd6c8", borderRadius: 10, padding: "16px 18px", marginBottom: 16, background: "#fff" }}>
        <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1a1a", marginBottom: 14 }}>
          Coordonnees
        </div>

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
            <input style={inputStyle} value={form.franco_minimum} onChange={(e) => setForm((f) => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 800" type="number" min="0" step="50" />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>Notes</div>
          <textarea
            style={{ ...inputStyle, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Delai de livraison, conditions..."
            rows={2}
          />
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
            background: "#e27f57", color: "#fff", border: "none", borderRadius: 20,
            padding: "8px 18px", cursor: "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Enregistrement..." : saved ? "Enregistre" : "Enregistrer"}
        </button>
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
