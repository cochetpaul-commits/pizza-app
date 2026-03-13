"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { useEtablissement } from "@/lib/EtablissementContext";

// Mapping nom fournisseur → route import facture
const INVOICE_ROUTES: Record<string, string> = {
  "MAEL":             "/invoices/mael",
  "METRO":            "/invoices/metro",
  "VINOFLO":          "/invoices/vinoflo",
  "COZIGOU":          "/invoices/cozigou",
  "CARNIATO":         "/invoices/carniato",
  "BAR SPIRITS":      "/invoices/barspirits",
  "SUM":              "/invoices/sum",
  "ARMOR EMBALLAGES": "/invoices/armor",
  "ARMOR":            "/invoices/armor",
};

function getInvoiceRoute(name: string | null): string | null {
  if (!name) return null;
  return INVOICE_ROUTES[name.toUpperCase().trim()] ?? null;
}

type SupplierFull = {
  id: string;
  name: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  notes: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  source_file_name: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default function FournisseurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { current: etab } = useEtablissement();

  const [supplier, setSupplier] = useState<SupplierFull | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [refCount, setRefCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({ email: "", phone: "", contact_name: "", notes: "" });

  useEffect(() => {
    async function load() {
      setLoading(true);

      const supQuery = supabase.from("suppliers").select("*").eq("id", id);
      if (etab) supQuery.eq("etablissement_id", etab.id);

      const invQuery = supabase.from("supplier_invoices")
        .select("id,invoice_number,invoice_date,total_ht,source_file_name,created_at")
        .eq("supplier_id", id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (etab) invQuery.eq("etablissement_id", etab.id);

      const [supRes, invRes, offRes] = await Promise.all([
        supQuery.single(),
        invQuery,
        supabase.from("v_latest_offers")
          .select("supplier_id", { count: "exact", head: true })
          .eq("supplier_id", id),
      ]);

      if (supRes.data) {
        const s = supRes.data as SupplierFull;
        setSupplier(s);
        setForm({
          email:        s.email        ?? "",
          phone:        s.phone        ?? "",
          contact_name: s.contact_name ?? "",
          notes:        s.notes        ?? "",
        });
      }

      setInvoices((invRes.data ?? []) as Invoice[]);
      setRefCount(offRes.count ?? 0);
      setLoading(false);
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, etab?.id]);

  async function save() {
    if (!supplier) return;
    setSaving(true);
    const { error } = await supabase.from("suppliers").update({
      email:        form.email.trim()        || null,
      phone:        form.phone.trim()        || null,
      contact_name: form.contact_name.trim() || null,
      notes:        form.notes.trim()        || null,
    }).eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const invoiceRoute = supplier ? getInvoiceRoute(supplier.name) : null;

  if (loading) return (
    <>
      <NavBar backHref="/fournisseurs" backLabel="Fournisseurs" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <div className="muted">Chargement…</div>
      </main>
    </>
  );

  if (!supplier) return (
    <>
      <NavBar backHref="/fournisseurs" backLabel="Fournisseurs" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <div className="muted">Fournisseur introuvable.</div>
      </main>
    </>
  );

  return (
    <>
      <NavBar
        backHref="/fournisseurs"
        backLabel="Fournisseurs"
        right={<>
          {invoiceRoute && (
            <Link href={invoiceRoute} className="btn btnPrimary">Importer facture →</Link>
          )}
          <Link href={`/ingredients?supplier=${id}`} className="btn">Ingrédients</Link>
        </>}
      />

      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{supplier.name}</div>
            {!supplier.is_active && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: "rgba(0,0,0,0.08)", color: "#999",
              }}>Inactif</span>
            )}
          </div>
          <div className="muted" style={{ marginTop: 2 }}>Fiche fournisseur</div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>

          {/* ── Stats ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="card" style={{ padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#8B1A1A" }}>{refCount}</div>
              <div className="muted" style={{ fontSize: 12 }}>références actives</div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {invoices.length > 0 ? fmtDate(invoices[0].created_at) : "—"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>dernier import</div>
            </div>
          </div>

          {/* ── Coordonnées (éditable) ── */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 12 }}>Coordonnées</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Nom du contact</div>
                  <input
                    className="input"
                    value={form.contact_name}
                    onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                    placeholder="Prénom Nom"
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Téléphone</div>
                  <input
                    className="input"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="06 xx xx xx xx"
                    type="tel"
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Email</div>
                <input
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="contact@fournisseur.fr"
                  type="email"
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>Notes</div>
                <textarea
                  className="input"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Délai de livraison, conditions, remarques…"
                  rows={3}
                />
              </div>

              <div>
                <button className="btn btnPrimary" onClick={save} disabled={saving}>
                  {saving ? "Enregistrement…" : saved ? "✓ Enregistré" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Historique imports ── */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 12 }}>
              Derniers imports ({invoices.length})
            </div>

            {invoices.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Aucun import pour ce fournisseur.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {invoices.map((inv) => (
                  <div key={inv.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "rgba(255,255,255,0.5)",
                    borderRadius: 10, border: "1px solid rgba(0,0,0,0.07)",
                    gap: 10,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {inv.invoice_number ? `N° ${inv.invoice_number}` : "Sans numéro"}
                        {inv.invoice_date ? ` · ${inv.invoice_date}` : ""}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                        Importé le {fmtDate(inv.created_at)}
                        {inv.source_file_name ? ` · ${inv.source_file_name}` : ""}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, flexShrink: 0, color: "#2f3a33" }}>
                      {fmtMoney(inv.total_ht)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {invoiceRoute && (
              <div style={{ marginTop: 14 }}>
                <Link href={invoiceRoute} className="btn btnPrimary">
                  Importer une facture →
                </Link>
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  );
}
