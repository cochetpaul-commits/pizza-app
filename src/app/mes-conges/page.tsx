"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Mes congés — l'espace congés de chaque employé :
 * ses compteurs, l'historique (app + Combo), et la demande de congé.
 * La demande part en attente ; un manager la valide dans /rh/conges,
 * puis elle est saisie dans Combo (source de vérité des congés validés).
 */

type Absence = {
  id: string;
  date_debut: string;
  date_fin: string;
  type: string;
  nb_jours: number | null;
  statut: string;
  note: string | null;
  source: string;
  motif_refus: string | null;
};

const TYPES: { id: string; label: string }[] = [
  { id: "CP", label: "Congé payé" },
  { id: "sans_solde", label: "Sans solde" },
  { id: "evenement_familial", label: "Événement familial" },
  { id: "conge_special", label: "Autre / congé spécial" },
];

const TYPE_LABELS: Record<string, string> = {
  CP: "Congé payé", conge_paye: "Congé payé", maladie: "Maladie", RTT: "RTT", rtt: "RTT",
  conge_special: "Congé spécial",
  sans_solde: "Sans solde", evenement_familial: "Événement familial",
  ferie: "Jour férié", accident_travail: "Accident du travail",
  maternite: "Maternité / Paternité", repos_compensateur: "Repos compensateur",
  formation: "Formation", absence_injustifiee: "Absence injustifiée", autre: "Autre",
};

const card: React.CSSProperties = {
  background: "#fff", borderRadius: 14, padding: 18,
  border: "1px solid #ddd6c8", marginBottom: 14,
};
const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61",
  marginBottom: 3, letterSpacing: 0.3,
};

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function MesCongesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [stats, setStats] = useState<{ prisCP: number; enAttente: number; annee: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fType, setFType] = useState("CP");
  const [fDebut, setFDebut] = useState("");
  const [fFin, setFFin] = useState("");
  const [fNote, setFNote] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) { setErr("Non connecté"); setLoading(false); return; }
    const res = await fetch("/api/conges", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) setErr(json.error ?? "Erreur");
    else {
      setAbsences(json.absences);
      setStats(json.stats);
      setErr("");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!fDebut || !fFin) { setMsg("Choisis les dates"); return; }
    setSending(true); setMsg("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/conges", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ type: fType, date_debut: fDebut, date_fin: fFin, note: fNote }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Erreur");
    else {
      setMsg("Demande envoyée — un responsable va la traiter");
      setShowForm(false); setFDebut(""); setFFin(""); setFNote("");
      load();
    }
    setSending(false);
    setTimeout(() => setMsg(""), 5000);
  };

  const cancel = async (id: string) => {
    if (!confirm("Annuler cette demande ?")) return;
    const { data: sess } = await supabase.auth.getSession();
    await fetch("/api/conges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ id }),
    });
    load();
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a", margin: 0,
        }}>
          Mes congés
        </h1>
        <button type="button" onClick={() => setShowForm(v => !v)} style={{
          padding: "9px 16px", borderRadius: 10, border: "none", background: "#D4775A",
          color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          {showForm ? "Fermer" : "+ Demander un congé"}
        </button>
      </div>

      {loading && <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>}
      {!loading && err && (
        <div style={{ ...card, textAlign: "center", color: "#999", fontSize: 13 }}>
          {err === "Aucune fiche employé liée"
            ? "Ton compte n'est pas encore relié à une fiche employé — vois avec un responsable."
            : err}
        </div>
      )}

      {msg && (
        <div style={{ ...card, padding: 12, fontSize: 13, fontWeight: 600, color: msg.startsWith("Demande envoyée") ? "#2D6A4F" : "#DC2626" }}>
          {msg}
        </div>
      )}

      {/* Formulaire de demande */}
      {showForm && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Nouvelle demande
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Type</label>
            <select style={inputSt} value={fType} onChange={e => setFType(e.target.value)}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelSt}>Du</label>
              <input type="date" style={inputSt} value={fDebut} onChange={e => setFDebut(e.target.value)} />
            </div>
            <div>
              <label style={labelSt}>Au (inclus)</label>
              <input type="date" style={inputSt} value={fFin} onChange={e => setFFin(e.target.value)} min={fDebut || undefined} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Message (facultatif)</label>
            <input style={inputSt} value={fNote} onChange={e => setFNote(e.target.value)} placeholder="ex. mariage de ma sœur" />
          </div>
          <button type="button" onClick={submit} disabled={sending} style={{
            width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
            background: "#4a6741", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", opacity: sending ? 0.6 : 1,
          }}>
            Envoyer la demande
          </button>
        </div>
      )}

      {/* Compteurs */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ ...card, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CP pris en {stats.annee}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", color: "#1a1a1a" }}>
              {stats.prisCP} j
            </div>
          </div>
          <div style={{ ...card, marginBottom: 0, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>En attente</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", color: stats.enAttente > 0 ? "#b45309" : "#1a1a1a" }}>
              {stats.enAttente}
            </div>
          </div>
        </div>
      )}

      {/* Historique */}
      {!loading && !err && (
        <div style={{ ...card, padding: "6px 18px" }}>
          {absences.length === 0 && (
            <p style={{ fontSize: 13, color: "#999", textAlign: "center", padding: 16 }}>Aucun congé enregistré</p>
          )}
          {absences.map((a, i) => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 0",
              borderBottom: i < absences.length - 1 ? "1px solid #f0ebe3" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1a1a1a" }}>
                  {fmtDate(a.date_debut)}{a.date_fin !== a.date_debut ? ` → ${fmtDate(a.date_fin)}` : ""}
                  {a.nb_jours != null && <span style={{ color: "#999", fontWeight: 500 }}> · {a.nb_jours} j</span>}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3, alignItems: "center" }}>
                  <span className="pastille-cadre">{TYPE_LABELS[a.type] ?? a.type}</span>
                  {a.source === "combo" && (
                    <span className="pastille" style={{ "--pastille-c": "#2563eb" } as React.CSSProperties}>Combo</span>
                  )}
                  {a.note && <span style={{ fontSize: 10.5, color: "#999" }}>{a.note}</span>}
                  {a.statut === "refuse" && a.motif_refus && (
                    <span style={{ fontSize: 10.5, color: "#DC2626" }}>{a.motif_refus}</span>
                  )}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, flexShrink: 0,
                background: a.statut === "valide" ? "rgba(45,106,79,0.10)" : a.statut === "refuse" ? "rgba(220,38,38,0.10)" : "rgba(180,83,9,0.10)",
                color: a.statut === "valide" ? "#2D6A4F" : a.statut === "refuse" ? "#DC2626" : "#b45309",
              }}>
                {a.statut === "valide" ? "Approuvé" : a.statut === "refuse" ? "Refusé" : "En attente"}
              </span>
              {a.statut === "en_attente" && (
                <button type="button" onClick={() => cancel(a.id)} title="Annuler la demande" style={{
                  width: 24, height: 24, borderRadius: 6, border: "none", flexShrink: 0,
                  background: "rgba(220,38,38,0.08)", color: "#DC2626", fontSize: 12, cursor: "pointer",
                }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
        Les congés validés viennent de Combo (synchronisés chaque nuit). Une demande faite ici est
        d&apos;abord validée par un responsable, puis enregistrée dans Combo.
      </p>
    </div>
  );
}
