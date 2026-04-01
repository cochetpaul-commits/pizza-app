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
  address: string | null; city: string | null; postal_code: string | null;
  siret: string | null; category: string | null; payment_terms: string | null;
  delivery_days: string[] | null; website: string | null; tva_intra: string | null;
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

  const [form, setForm] = useState({ email: "", phone: "", contact_name: "", notes: "", franco_minimum: "", address: "", city: "", postal_code: "", siret: "", category: "", payment_terms: "", delivery_days: "", website: "", tva_intra: "" });

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
          address: s.address ?? "", city: s.city ?? "", postal_code: s.postal_code ?? "",
          siret: s.siret ?? "", category: s.category ?? "", payment_terms: s.payment_terms ?? "",
          delivery_days: (s.delivery_days ?? []).join(", "), website: s.website ?? "", tva_intra: s.tva_intra ?? "",
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
    const deliveryArr = form.delivery_days.trim()
      ? form.delivery_days.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
      : null;
    const { error } = await supabase.from("suppliers").update({
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      contact_name: form.contact_name.trim() || null,
      notes: form.notes.trim() || null,
      franco_minimum: francoVal ? parseFloat(francoVal) : null,
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
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const CATEGORY_LABELS: Record<string, string> = {
    alimentaire_general: "Alimentaire général", cremerie_frais: "Crémerie / Frais", vins: "Vins",
    boissons_spiritueux: "Boissons / Spiritueux", spiritueux: "Spiritueux",
    viande_charcuterie: "Viande / Charcuterie", emballage: "Emballage", surgeles: "Surgelés",
    glaces: "Glaces", produits_fins: "Produits fins",
  };
  const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

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
            <div style={labelStyle}>Franco minimum (EUR HT)</div>
            <input style={inputStyle} value={form.franco_minimum} onChange={(e) => setForm((f) => ({ ...f, franco_minimum: e.target.value }))} placeholder="ex: 800" type="number" min="0" step="50" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={labelStyle}>Conditions paiement</div>
            <input style={inputStyle} value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} placeholder="30 jours fin de mois" />
          </div>
          <div>
            <div style={labelStyle}>Jours de livraison</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {JOURS.map((j) => {
                const selected = form.delivery_days.toLowerCase().includes(j);
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => {
                      const current = form.delivery_days.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
                      const next = selected ? current.filter(d => d !== j) : [...current, j];
                      const ordered = JOURS.filter(d => next.includes(d));
                      setForm((f) => ({ ...f, delivery_days: ordered.join(", ") }));
                    }}
                    style={{
                      fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 600,
                      padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                      border: selected ? "1.5px solid #D4775A" : "1.5px solid #ddd6c8",
                      background: selected ? "#D4775A18" : "#fff",
                      color: selected ? "#D4775A" : "#999",
                    }}
                  >
                    {j.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
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

        <button
          onClick={save}
          disabled={saving}
          style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
            background: "#D4775A", color: "#fff", border: "none", borderRadius: 20,
            padding: "8px 18px", cursor: "pointer", opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Enregistrement..." : saved ? "Enregistré" : "Enregistrer"}
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
