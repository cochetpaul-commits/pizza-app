"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Client = { id: string; nom: string; prenom: string | null };
type Ligne = { id: string; description: string; quantite: number; unite: string; prix_unitaire_ht: number; total_ht: number };

const CONDITIONS_DEFAUT = `Paiement a reception de la facture.\nEn cas de retard, penalite de 3x le taux d'interet legal + indemnite forfaitaire de 40 EUR.`;

function newLigne(): Ligne {
  return { id: crypto.randomUUID(), description: "", quantite: 1, unite: "unite", prix_unitaire_ht: 0, total_ht: 0 };
}

export default function NouvelleFacturePageWrapper() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}><p className="muted">Chargement...</p></div>}>
      <NouvelleFacturePage />
    </Suspense>
  );
}

function NouvelleFacturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current: etab } = useEtablissement();
  const devisId = searchParams.get("devis_id");

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [eventId, setEventId] = useState<string>("");
  const [linkedDevisId] = useState<string>(devisId ?? "");
  const [objet, setObjet] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([newLigne()]);
  const [tvaRate, setTvaRate] = useState(10);
  const [conditions, setConditions] = useState(CONDITIONS_DEFAUT);
  const [notes, setNotes] = useState("");
  const [montantPaye, setMontantPaye] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingDevis, setLoadingDevis] = useState(!!devisId);

  useEffect(() => {
    supabase.from("clients").select("id,nom,prenom").order("nom").then(({ data }) => {
      setClients((data ?? []) as Client[]);
    });
  }, []);

  // Pre-fill from devis
  useEffect(() => {
    if (!devisId) return;
    (async () => {
      const { data: d } = await supabase.from("devis").select("*").eq("id", devisId).single();
      if (d) {
        setClientId(d.client_id ?? "");
        setEventId(d.event_id ?? "");
        setObjet(d.objet ?? "");
        setTvaRate(d.tva_rate ?? 10);
      }
      const { data: dl } = await supabase.from("devis_lignes").select("*").eq("devis_id", devisId).order("position");
      if (dl && dl.length > 0) {
        setLignes(dl.map((l: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          description: l.description as string,
          quantite: l.quantite as number,
          unite: l.unite as string,
          prix_unitaire_ht: l.prix_unitaire_ht as number,
          total_ht: l.total_ht as number,
        })));
      }
      setLoadingDevis(false);
    })();
  }, [devisId]);

  const totalHt = lignes.reduce((s, l) => s + l.total_ht, 0);
  const totalTtc = totalHt * (1 + tvaRate / 100);

  function updateLigne(id: string, field: keyof Ligne, value: string | number) {
    setLignes((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        updated.total_ht = updated.quantite * updated.prix_unitaire_ht;
        return updated;
      })
    );
  }

  function removeLigne(id: string) {
    setLignes((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  async function handleSave() {
    if (!objet.trim()) return alert("L'objet de la facture est requis.");
    setSaving(true);

    const { data: numData } = await supabase.rpc("next_facture_numero", { etab_id: etab?.id ?? null });
    const numero = numData ?? `FAC-${new Date().getFullYear()}-001`;

    const dateEcheance = new Date();
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const { data: factureData, error } = await supabase
      .from("factures")
      .insert({
        numero,
        etablissement_id: etab?.id ?? null,
        client_id: clientId || null,
        event_id: eventId || null,
        devis_id: linkedDevisId || null,
        objet: objet.trim(),
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
        total_ht: totalHt,
        tva_rate: tvaRate,
        total_ttc: totalTtc,
        montant_paye: montantPaye,
        date_echeance: dateEcheance.toISOString().slice(0, 10),
        status: "brouillon",
      })
      .select("id")
      .single();

    if (error || !factureData) {
      console.error("facture insert error:", error);
      setSaving(false);
      return alert("Erreur lors de la sauvegarde.");
    }

    const lignesPayload = lignes
      .filter((l) => l.description.trim())
      .map((l, i) => ({
        facture_id: factureData.id,
        description: l.description.trim(),
        quantite: l.quantite,
        unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        total_ht: l.total_ht,
        position: i,
      }));

    if (lignesPayload.length > 0) {
      await supabase.from("facture_lignes").insert(lignesPayload);
    }

    setSaving(false);
    router.push(`/clients/factures/${factureData.id}`);
  }

  if (loadingDevis) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p className="muted">Chargement du devis...</p>
        </div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <h1 style={h1}>Nouvelle facture</h1>
        {devisId && (
          <p style={{ fontSize: 12, color: "#4a6741", background: "#e8ede6", padding: "6px 12px", borderRadius: 8, marginBottom: 16 }}>
            Creee depuis le devis
          </p>
        )}

        {/* Client */}
        <section style={section}>
          <label style={labelStyle}>Client</label>
          <select style={{ ...inputStyle, flex: 1 }} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">-- Selectionner un client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}{c.prenom ? ` ${c.prenom}` : ""}</option>
            ))}
          </select>
        </section>

        {/* Objet */}
        <section style={section}>
          <label style={labelStyle}>Objet *</label>
          <input style={inputStyle} placeholder="Ex: Mariage Fantino - 55 couverts" value={objet} onChange={(e) => setObjet(e.target.value)} />
        </section>

        {/* Lignes */}
        <section style={section}>
          <label style={labelStyle}>Lignes</label>
          <div style={{ overflowX: "auto" }}>
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
                {lignes.map((l) => (
                  <tr key={l.id}>
                    <td style={tdStyle}>
                      <input style={{ ...inputStyle, fontSize: 13 }} value={l.description} onChange={(e) => updateLigne(l.id, "description", e.target.value)} placeholder="Description..." />
                    </td>
                    <td style={tdStyle}>
                      <input type="number" style={{ ...inputStyle, fontSize: 13, width: "100%" }} value={l.quantite} onChange={(e) => updateLigne(l.id, "quantite", parseFloat(e.target.value) || 0)} min={0} step={0.5} />
                    </td>
                    <td style={tdStyle}>
                      <select style={{ ...inputStyle, fontSize: 13 }} value={l.unite} onChange={(e) => updateLigne(l.id, "unite", e.target.value)}>
                        <option value="unite">unite</option>
                        <option value="personne">personne</option>
                        <option value="forfait">forfait</option>
                        <option value="heure">heure</option>
                        <option value="kg">kg</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input type="number" style={{ ...inputStyle, fontSize: 13, width: "100%" }} value={l.prix_unitaire_ht} onChange={(e) => updateLigne(l.id, "prix_unitaire_ht", parseFloat(e.target.value) || 0)} min={0} step={0.01} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, textAlign: "right" }}>{l.total_ht.toFixed(2)} \u20ac</td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => removeLigne(l.id)} style={{ background: "none", border: "none", color: "#ccc", fontSize: 18, cursor: "pointer" }}>&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" style={{ ...btnSecondary, marginTop: 8 }} onClick={() => setLignes((p) => [...p, newLigne()])}>
            + Ajouter une ligne
          </button>
        </section>

        {/* Totaux */}
        <section style={{ ...section, background: "#faf7f2", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
            <span>Total HT</span>
            <span style={{ fontWeight: 700 }}>{totalHt.toFixed(2)} \u20ac</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: 8 }}>
            <span>TVA <input type="number" style={{ width: 50, ...inputStyle, fontSize: 13, display: "inline", padding: "2px 6px" }} value={tvaRate} onChange={(e) => setTvaRate(parseFloat(e.target.value) || 0)} />%</span>
            <span>{(totalTtc - totalHt).toFixed(2)} \u20ac</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid #ddd6c8", paddingTop: 8 }}>
            <span>Total TTC</span>
            <span>{totalTtc.toFixed(2)} \u20ac</span>
          </div>
        </section>

        {/* Montant paye */}
        <section style={section}>
          <label style={labelStyle}>Montant deja paye</label>
          <input type="number" style={{ ...inputStyle, width: 200 }} value={montantPaye} onChange={(e) => setMontantPaye(parseFloat(e.target.value) || 0)} min={0} step={0.01} />
        </section>

        {/* Conditions & Notes */}
        <section style={section}>
          <label style={labelStyle}>Conditions de paiement</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </section>

        <section style={section}>
          <label style={labelStyle}>Notes internes</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" style={btnSecondary} onClick={() => router.back()}>Annuler</button>
          <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    </RequireRole>
  );
}

const h1: React.CSSProperties = { fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1.5, textTransform: "uppercase", color: "#2f3a33", margin: "0 0 20px" };
const section: React.CSSProperties = { marginBottom: 20 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#b0a894", borderBottom: "1px solid #ddd6c8" };
const tdStyle: React.CSSProperties = { padding: "6px", borderBottom: "1px solid rgba(221,214,200,0.4)" };
const btnPrimary: React.CSSProperties = { background: "#D4775A", color: "#fff", border: "none", borderRadius: 20, padding: "8px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#f2ede4", color: "#6f6a61", border: "1px solid #ddd6c8", borderRadius: 20, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
