"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";

type Ligne = {
  id: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  total_ht: number;
  position: number;
};

type FactureData = {
  id: string;
  numero: string;
  objet: string | null;
  status: string;
  total_ht: number;
  tva_rate: number;
  total_ttc: number;
  montant_paye: number;
  date_emission: string | null;
  date_echeance: string | null;
  conditions: string | null;
  notes: string | null;
  client_id: string | null;
  client: { id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  brouillon: { bg: "#e8e0d0", fg: "#999" },
  envoyee: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  payee: { bg: "#e8ede6", fg: "#4a6741" },
  en_retard: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
  annulee: { bg: "#f0f0f0", fg: "#bbb" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export default function FactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [facture, setFacture] = useState<FactureData | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("brouillon");
  const [objet, setObjet] = useState("");
  const [montantPaye, setMontantPaye] = useState(0);
  const [conditions, setConditions] = useState("");
  const [notes, setNotes] = useState("");
  const [editLignes, setEditLignes] = useState<Ligne[]>([]);
  const [tvaRate, setTvaRate] = useState(10);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase
        .from("factures")
        .select("*,client:clients(id,nom,prenom,email,telephone)")
        .eq("id", id)
        .single();
      if (!f) { setLoading(false); return; }
      setFacture(f as FactureData);
      setStatus(f.status);
      setObjet(f.objet ?? "");
      setMontantPaye(f.montant_paye ?? 0);
      setConditions(f.conditions ?? "");
      setNotes(f.notes ?? "");
      setTvaRate(f.tva_rate ?? 10);

      const { data: lines } = await supabase
        .from("facture_lignes")
        .select("*")
        .eq("facture_id", id)
        .order("position");
      const l = (lines ?? []) as Ligne[];
      setLignes(l);
      setEditLignes(l);
      setLoading(false);
    })();
  }, [id]);

  function updateEditLigne(idx: number, field: keyof Ligne, value: string | number) {
    setEditLignes((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [field]: value };
        updated.total_ht = updated.quantite * updated.prix_unitaire_ht;
        return updated;
      })
    );
  }

  function addEditLigne() {
    setEditLignes((p) => [...p, { id: crypto.randomUUID(), description: "", quantite: 1, unite: "unite", prix_unitaire_ht: 0, total_ht: 0, position: p.length }]);
  }

  function removeEditLigne(idx: number) {
    setEditLignes((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  }

  const editTotalHt = editLignes.reduce((s, l) => s + l.total_ht, 0);
  const editTotalTtc = editTotalHt * (1 + tvaRate / 100);

  async function handleSave() {
    setSaving(true);
    await supabase
      .from("factures")
      .update({
        objet: objet.trim() || null,
        status,
        montant_paye: montantPaye,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
        total_ht: editTotalHt,
        tva_rate: tvaRate,
        total_ttc: editTotalTtc,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    await supabase.from("facture_lignes").delete().eq("facture_id", id);
    const payload = editLignes
      .filter((l) => l.description.trim())
      .map((l, i) => ({
        facture_id: id,
        description: l.description.trim(),
        quantite: l.quantite,
        unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        total_ht: l.total_ht,
        position: i,
      }));
    if (payload.length > 0) {
      await supabase.from("facture_lignes").insert(payload);
    }

    setLignes(editLignes);
    if (facture) {
      setFacture({ ...facture, objet, status, montant_paye: montantPaye, conditions, notes, total_ht: editTotalHt, tva_rate: tvaRate, total_ttc: editTotalTtc });
    }
    setEditing(false);
    setSaving(false);
  }

  async function handlePdf() {
    if (!facture) return;
    setPdfLoading(true);
    try {
      const res = await fetchApi("/api/factures/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factureId: id }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${facture.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la generation du PDF.");
    }
    setPdfLoading(false);
  }

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p className="muted">Chargement...</p>
        </div>
      </RequireRole>
    );
  }

  if (!facture) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p className="muted">Facture introuvable.</p>
        </div>
      </RequireRole>
    );
  }

  const sc = STATUS_COLORS[facture.status] ?? STATUS_COLORS.brouillon;
  const resteADu = facture.total_ttc - (facture.montant_paye ?? 0);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={h1}>{facture.numero}</h1>
            <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: sc.bg, color: sc.fg }}>
              {STATUS_LABELS[facture.status] ?? facture.status}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!editing && (
              <>
                <button type="button" style={btnSecondary} onClick={() => setEditing(true)}>Modifier</button>
                <button type="button" style={btnPrimary} onClick={handlePdf} disabled={pdfLoading}>
                  {pdfLoading ? "..." : "PDF"}
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <>
            <section style={sectionStyle}>
              <label style={labelStyle}>Objet</label>
              <input style={inputStyle} value={objet} onChange={(e) => setObjet(e.target.value)} />
            </section>

            <section style={sectionStyle}>
              <label style={labelStyle}>Statut</label>
              <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </section>

            <section style={sectionStyle}>
              <label style={labelStyle}>Montant paye</label>
              <input type="number" style={{ ...inputStyle, width: 200 }} value={montantPaye} onChange={(e) => setMontantPaye(parseFloat(e.target.value) || 0)} min={0} step={0.01} />
            </section>

            <section style={sectionStyle}>
              <label style={labelStyle}>Lignes</label>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, width: 70 }}>Qte</th>
                    <th style={{ ...thStyle, width: 90 }}>Unite</th>
                    <th style={{ ...thStyle, width: 90 }}>PU HT</th>
                    <th style={{ ...thStyle, width: 90 }}>Total HT</th>
                    <th style={{ ...thStyle, width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {editLignes.map((l, i) => (
                    <tr key={l.id}>
                      <td style={tdStyle}><input style={{ ...inputStyle, fontSize: 13 }} value={l.description} onChange={(e) => updateEditLigne(i, "description", e.target.value)} /></td>
                      <td style={tdStyle}><input type="number" style={{ ...inputStyle, fontSize: 13 }} value={l.quantite} onChange={(e) => updateEditLigne(i, "quantite", parseFloat(e.target.value) || 0)} min={0} step={0.5} /></td>
                      <td style={tdStyle}><select style={{ ...inputStyle, fontSize: 13 }} value={l.unite} onChange={(e) => updateEditLigne(i, "unite", e.target.value)}><option value="unite">unite</option><option value="personne">personne</option><option value="forfait">forfait</option><option value="heure">heure</option><option value="kg">kg</option></select></td>
                      <td style={tdStyle}><input type="number" style={{ ...inputStyle, fontSize: 13 }} value={l.prix_unitaire_ht} onChange={(e) => updateEditLigne(i, "prix_unitaire_ht", parseFloat(e.target.value) || 0)} min={0} step={0.01} /></td>
                      <td style={{ ...tdStyle, fontWeight: 700, textAlign: "right" }}>{l.total_ht.toFixed(2)} €</td>
                      <td style={tdStyle}><button type="button" onClick={() => removeEditLigne(i)} style={{ background: "none", border: "none", color: "#ccc", fontSize: 18, cursor: "pointer" }}>&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" style={{ ...btnSecondary, marginTop: 8 }} onClick={addEditLigne}>+ Ajouter une ligne</button>
            </section>

            <section style={{ ...sectionStyle, background: "#faf7f2", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                <span>Total HT</span><span style={{ fontWeight: 700 }}>{editTotalHt.toFixed(2)} €</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                <span>TVA <input type="number" style={{ width: 50, ...inputStyle, fontSize: 13, display: "inline", padding: "2px 6px" }} value={tvaRate} onChange={(e) => setTvaRate(parseFloat(e.target.value) || 0)} />%</span>
                <span>{(editTotalTtc - editTotalHt).toFixed(2)} €</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid #ddd6c8", paddingTop: 8 }}>
                <span>Total TTC</span><span>{editTotalTtc.toFixed(2)} €</span>
              </div>
            </section>

            <section style={sectionStyle}>
              <label style={labelStyle}>Conditions</label>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </section>

            <section style={sectionStyle}>
              <label style={labelStyle}>Notes internes</label>
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </section>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" style={btnSecondary} onClick={() => setEditing(false)}>Annuler</button>
              <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>{saving ? "..." : "Sauvegarder"}</button>
            </div>
          </>
        ) : (
          <>
            <section style={sectionStyle}>
              <h2 style={h2}>{facture.objet ?? "Sans objet"}</h2>
              {facture.client && (
                <p style={{ fontSize: 14, color: "#2f3a33", margin: "8px 0" }}>
                  <strong>Client :</strong> {facture.client.nom}{facture.client.prenom ? ` ${facture.client.prenom}` : ""}
                  {facture.client.email ? ` · ${facture.client.email}` : ""}
                  {facture.client.telephone ? ` · ${facture.client.telephone}` : ""}
                </p>
              )}
              <p style={{ fontSize: 13, color: "#6f6a61", margin: "4px 0" }}>
                Emission : {fmtDate(facture.date_emission)} &middot; Echeance : {fmtDate(facture.date_echeance)}
              </p>
            </section>

            <section style={sectionStyle}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Description</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Qte</th>
                    <th style={thStyle}>Unite</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>PU HT</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      <td style={tdStyle}>{l.description}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{l.quantite}</td>
                      <td style={tdStyle}>{l.unite}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{l.prix_unitaire_ht.toFixed(2)} €</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{l.total_ht.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ ...sectionStyle, background: "#faf7f2", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                <span>Total HT</span><span style={{ fontWeight: 700 }}>{facture.total_ht.toFixed(2)} €</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                <span>TVA {facture.tva_rate}%</span><span>{(facture.total_ttc - facture.total_ht).toFixed(2)} €</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid #ddd6c8", paddingTop: 8 }}>
                <span>Total TTC</span><span>{facture.total_ttc.toFixed(2)} €</span>
              </div>
              {facture.montant_paye > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 8, color: "#4a6741" }}>
                    <span>Deja paye</span><span style={{ fontWeight: 700 }}>-{facture.montant_paye.toFixed(2)} €</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4, fontWeight: 800, color: resteADu > 0 ? "#DC2626" : "#4a6741" }}>
                    <span>Reste a payer</span><span>{resteADu.toFixed(2)} €</span>
                  </div>
                </>
              )}
            </section>

            {facture.conditions && (
              <section style={sectionStyle}>
                <label style={labelStyle}>Conditions</label>
                <p style={{ fontSize: 13, color: "#2f3a33", whiteSpace: "pre-wrap", margin: 0 }}>{facture.conditions}</p>
              </section>
            )}

            {facture.notes && (
              <section style={sectionStyle}>
                <label style={labelStyle}>Notes internes</label>
                <p style={{ fontSize: 13, color: "#999", whiteSpace: "pre-wrap", margin: 0 }}>{facture.notes}</p>
              </section>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}

const h1: React.CSSProperties = { fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1.5, textTransform: "uppercase", color: "#2f3a33", margin: "0 0 6px" };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#2f3a33", margin: "0 0 4px" };
const sectionStyle: React.CSSProperties = { marginBottom: 20 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#b0a894", borderBottom: "1px solid #ddd6c8" };
const tdStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid rgba(221,214,200,0.4)", fontSize: 13, color: "#1a1a1a" };
const btnPrimary: React.CSSProperties = { background: "#D4775A", color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#f2ede4", color: "#6f6a61", border: "1px solid #ddd6c8", borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
