"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Client = { id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null };
type Ligne = { id: string; description: string; quantite: number; unite: string; prix_unitaire_ht: number; total_ht: number };

const CONDITIONS_DEFAUT = `Acompte de 30% a la signature du devis.\nSolde a reception de la facture.\nDevis valable 30 jours.`;

function newLigne(): Ligne {
  return { id: crypto.randomUUID(), description: "", quantite: 1, unite: "unite", prix_unitaire_ht: 0, total_ht: 0 };
}

export default function NouveauDevisPageWrapper() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}><p className="muted">Chargement...</p></div>}>
      <NouveauDevisPage />
    </Suspense>
  );
}

function NouveauDevisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current: etab } = useEtablissement();

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [eventId] = useState<string>(searchParams.get("event_id") ?? "");
  const [objet, setObjet] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([newLigne()]);
  const [tvaRate, setTvaRate] = useState(10);
  const [acomptePct, setAcomptePct] = useState(30);
  const [conditions, setConditions] = useState(CONDITIONS_DEFAUT);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Quick client creation
  const [showNewClient, setShowNewClient] = useState(false);
  const [newNom, setNewNom] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTel, setNewTel] = useState("");

  useEffect(() => {
    supabase.from("clients").select("id,nom,prenom,email,telephone").order("nom").then(({ data }) => {
      setClients((data ?? []) as Client[]);
    });
  }, []);

  // Calculs
  const totalHt = lignes.reduce((s, l) => s + l.total_ht, 0);
  const totalTtc = totalHt * (1 + tvaRate / 100);
  const acompte = totalTtc * (acomptePct / 100);

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

  async function createClient() {
    if (!newNom.trim()) return;
    const { data, error } = await supabase
      .from("clients")
      .insert({ nom: newNom.trim(), prenom: newPrenom.trim() || null, email: newEmail.trim() || null, telephone: newTel.trim() || null })
      .select("id,nom,prenom,email,telephone")
      .single();
    if (error || !data) return;
    setClients((prev) => [...prev, data as Client]);
    setClientId(data.id);
    setShowNewClient(false);
    setNewNom(""); setNewPrenom(""); setNewEmail(""); setNewTel("");
  }

  async function handleSave() {
    if (!objet.trim()) return alert("L'objet du devis est requis.");
    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? null;

    // Get next numero
    const { data: numData, error: numErr } = await supabase.rpc("next_devis_numero", { etab_id: etab?.id ?? null });
    if (numErr) console.error("next_devis_numero error:", numErr);
    const numero = numData ?? `DEV-${new Date().getFullYear()}-001`;

    const dateValidite = new Date();
    dateValidite.setDate(dateValidite.getDate() + 30);

    const { data: devisData, error } = await supabase
      .from("devis")
      .insert({
        numero,
        etablissement_id: etab?.id ?? null,
        client_id: clientId || null,
        event_id: eventId || null,
        objet: objet.trim(),
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
        total_ht: totalHt,
        tva_rate: tvaRate,
        total_ttc: totalTtc,
        acompte_pct: acomptePct,
        date_validite: dateValidite.toISOString().slice(0, 10),
        status: "brouillon",
        user_id: uid,
      })
      .select("id")
      .single();

    if (error || !devisData) {
      console.error("devis insert error:", error);
      setSaving(false);
      return alert(`Erreur lors de la sauvegarde : ${error?.message ?? "inconnu"}`);
    }

    // Insert lignes
    const lignesPayload = lignes
      .filter((l) => l.description.trim())
      .map((l, i) => ({
        devis_id: devisData.id,
        description: l.description.trim(),
        quantite: l.quantite,
        unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        total_ht: l.total_ht,
        position: i,
      }));

    if (lignesPayload.length > 0) {
      await supabase.from("devis_lignes").insert(lignesPayload);
    }

    setSaving(false);
    router.push(`/devis/${devisData.id}`);
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <h1 style={h1}>Nouveau devis</h1>

        {/* Client */}
        <section style={section}>
          <label style={labelStyle}>Client</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              style={{ ...inputStyle, flex: 1 }}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">-- Selectionner un client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}{c.prenom ? ` ${c.prenom}` : ""}
                </option>
              ))}
            </select>
            <button type="button" style={btnSecondary} onClick={() => setShowNewClient(!showNewClient)}>
              + Nouveau
            </button>
          </div>

          {showNewClient && (
            <div style={{ marginTop: 12, padding: 16, background: "#faf7f2", borderRadius: 10, border: "1px solid #ddd6c8" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={labelSmall}>Nom *</label>
                  <input style={inputStyle} value={newNom} onChange={(e) => setNewNom(e.target.value)} />
                </div>
                <div>
                  <label style={labelSmall}>Prenom</label>
                  <input style={inputStyle} value={newPrenom} onChange={(e) => setNewPrenom(e.target.value)} />
                </div>
                <div>
                  <label style={labelSmall}>Email</label>
                  <input style={inputStyle} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" />
                </div>
                <div>
                  <label style={labelSmall}>Telephone</label>
                  <input style={inputStyle} value={newTel} onChange={(e) => setNewTel(e.target.value)} type="tel" />
                </div>
              </div>
              <button type="button" style={{ ...btnPrimary, marginTop: 10 }} onClick={createClient} disabled={!newNom.trim()}>
                Creer le client
              </button>
            </div>
          )}
        </section>

        {/* Objet */}
        <section style={section}>
          <label style={labelStyle}>Objet du devis *</label>
          <input
            style={inputStyle}
            placeholder="Ex: Mariage Fantino - 55 couverts"
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
          />
        </section>

        {/* Lignes */}
        <section style={section}>
          <label style={labelStyle}>Lignes du devis</label>
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
                      <input
                        style={{ ...inputStyle, fontSize: 13 }}
                        value={l.description}
                        onChange={(e) => updateLigne(l.id, "description", e.target.value)}
                        placeholder="Description..."
                      />
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        style={{ ...inputStyle, fontSize: 13, width: "100%" }}
                        value={l.quantite}
                        onChange={(e) => updateLigne(l.id, "quantite", parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.5}
                      />
                    </td>
                    <td style={tdStyle}>
                      <select
                        style={{ ...inputStyle, fontSize: 13 }}
                        value={l.unite}
                        onChange={(e) => updateLigne(l.id, "unite", e.target.value)}
                      >
                        <option value="unite">unite</option>
                        <option value="personne">personne</option>
                        <option value="forfait">forfait</option>
                        <option value="heure">heure</option>
                        <option value="kg">kg</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input
                        type="number"
                        style={{ ...inputStyle, fontSize: 13, width: "100%" }}
                        value={l.prix_unitaire_ht}
                        onChange={(e) => updateLigne(l.id, "prix_unitaire_ht", parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, textAlign: "right" }}>
                      {l.total_ht.toFixed(2)} €
                    </td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => removeLigne(l.id)}
                        style={{ background: "none", border: "none", color: "#ccc", fontSize: 18, cursor: "pointer" }}
                      >
                        &times;
                      </button>
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
            <span style={{ fontWeight: 700 }}>{totalHt.toFixed(2)} €</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, marginBottom: 8 }}>
            <span>
              TVA{" "}
              <input
                type="number"
                style={{ width: 50, ...inputStyle, fontSize: 13, display: "inline", padding: "2px 6px" }}
                value={tvaRate}
                onChange={(e) => setTvaRate(parseFloat(e.target.value) || 0)}
                min={0}
                max={30}
                step={0.5}
              />
              %
            </span>
            <span>{(totalTtc - totalHt).toFixed(2)} €</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid #ddd6c8", paddingTop: 8 }}>
            <span>Total TTC</span>
            <span>{totalTtc.toFixed(2)} €</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginTop: 8, color: "#6f6a61" }}>
            <span>
              Acompte{" "}
              <input
                type="number"
                style={{ width: 50, ...inputStyle, fontSize: 13, display: "inline", padding: "2px 6px" }}
                value={acomptePct}
                onChange={(e) => setAcomptePct(parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
              />
              %
            </span>
            <span style={{ fontWeight: 700 }}>{acompte.toFixed(2)} €</span>
          </div>
        </section>

        {/* Conditions & Notes */}
        <section style={section}>
          <label style={labelStyle}>Conditions generales</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          />
        </section>

        <section style={section}>
          <label style={labelStyle}>Notes internes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" style={btnSecondary} onClick={() => router.back()}>
            Annuler
          </button>
          <button type="button" style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Sauvegarder"}
          </button>
        </div>
      </div>
    </RequireRole>
  );
}

const h1: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "#2f3a33",
  margin: "0 0 20px",
};

const section: React.CSSProperties = { marginBottom: 20 };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#6f6a61",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const labelSmall: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  color: "#999",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 6px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#b0a894",
  borderBottom: "1px solid #ddd6c8",
};

const tdStyle: React.CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid rgba(221,214,200,0.4)",
};

const btnPrimary: React.CSSProperties = {
  background: "#D4775A",
  color: "#fff",
  border: "none",
  borderRadius: 20,
  padding: "8px 24px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "#f2ede4",
  color: "#6f6a61",
  border: "1px solid #ddd6c8",
  borderRadius: 20,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
