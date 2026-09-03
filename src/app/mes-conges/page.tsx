"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

/**
 * Mes congés — l'espace congés de chaque employé :
 * le planning d'équipe (qui est absent quand), la demande directement
 * sur le calendrier, ses compteurs et son historique.
 * La demande part en attente ; un manager la valide dans /rh/conges,
 * puis elle est saisie dans Combo (source de vérité des congés validés).
 * Les règles d'absences simultanées (max d'absents par équipe) sont
 * vérifiées à l'envoi — le calendrier prévient avant.
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

type PlanningEntry = {
  id: string;
  employe_id: string;
  prenom: string;
  initiales: string;
  equipes: string[];
  type: string;
  statut: string;
  date_debut: string;
  date_fin: string;
  mien: boolean;
};

type Regle = { etablissement_id: string; equipe: string; max_absents: number };

type Periode = {
  id: string;
  type: "bloque" | "fermeture";
  libelle: string;
  date_debut: string;
  date_fin: string;
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

const TYPE_COLORS: Record<string, string> = {
  CP: "#2E7D32", conge_paye: "#2E7D32", RTT: "#1565C0", rtt: "#1565C0",
  maladie: "#c62828", accident_travail: "#c62828",
};
const typeColor = (t: string) => TYPE_COLORS[t] ?? "#7B1FA2";

const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function fmtCourt(d: string): string {
  return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

type DayCell = { date: Date; iso: string; isCurrentMonth: boolean };

function getMonthDays(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  // Lundi = début de semaine
  const startOffset = (first.getDay() + 6) % 7;
  const cells: DayCell[] = [];
  const start = new Date(year, month, 1 - startOffset);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, iso: toISO(d), isCurrentMonth: d.getMonth() === month });
  }
  return cells;
}

export default function MesCongesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [planning, setPlanning] = useState<PlanningEntry[]>([]);
  const [regles, setRegles] = useState<Regle[]>([]);
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [mesEquipes, setMesEquipes] = useState<string[]>([]);
  const [stats, setStats] = useState<{ prisCP: number; enAttente: number; annee: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Calendrier + sélection de dates (façon Airbnb : départ puis fin)
  const [nowStable] = useState(() => new Date());
  const [calYear, setCalYear] = useState(nowStable.getFullYear());
  const [calMonth, setCalMonth] = useState(nowStable.getMonth());
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);

  const [fType, setFType] = useState("CP");
  const [fNote, setFNote] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const today = toISO(nowStable);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) { setErr("Non connecté"); setLoading(false); return; }
    const res = await fetchApi("/api/conges", { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) setErr(json.error ?? "Erreur");
    else {
      setAbsences(json.absences);
      setPlanning(json.planning ?? []);
      setRegles(json.regles ?? []);
      setPeriodes(json.periodes ?? []);
      setMesEquipes(json.equipes ?? []);
      setStats(json.stats);
      setErr("");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  /* ── Calendrier ─────────────────────────────────────────────── */

  const monthDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth]);

  const absentsDuJour = useCallback((iso: string) => {
    return planning.filter(p => p.date_debut <= iso && p.date_fin >= iso);
  }, [planning]);

  const periodeDuJour = useCallback((iso: string): Periode | null => {
    // La fermeture prime sur le blocage si les deux se chevauchent
    const duJour = periodes.filter(p => p.date_debut <= iso && p.date_fin >= iso);
    return duJour.find(p => p.type === "fermeture") ?? duJour[0] ?? null;
  }, [periodes]);

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  };

  const handleDayClick = (iso: string) => {
    if (iso < today) return; // pas de demande dans le passé
    if (!selStart || (selStart && selEnd)) { setSelStart(iso); setSelEnd(null); }
    else if (iso < selStart) { setSelStart(iso); }
    else setSelEnd(iso);
  };

  const range = useMemo(
    () => (selStart ? { lo: selStart, hi: selEnd ?? selStart } : null),
    [selStart, selEnd],
  );
  const nbJoursDemandes = range
    ? Math.round((new Date(range.hi).getTime() - new Date(range.lo).getTime()) / 86400000) + 1
    : 0;

  /* ── Avertissement périodes bloquées / fermetures ───────────── */

  const avertissementPeriode = useMemo(() => {
    if (!range) return null;
    const touchees = periodes.filter(p => p.date_debut <= range.hi && p.date_fin >= range.lo);
    const fermeture = touchees.find(p => p.type === "fermeture");
    if (fermeture) {
      return `Le restaurant est fermé du ${fmtCourt(fermeture.date_debut)} au ${fmtCourt(fermeture.date_fin)} (${fermeture.libelle}) — tout le monde est en congé, pas besoin de faire de demande.`;
    }
    const bloque = touchees.find(p => p.type === "bloque");
    if (bloque) {
      return `Période bloquée du ${fmtCourt(bloque.date_debut)} au ${fmtCourt(bloque.date_fin)} (${bloque.libelle}) — pas de congé possible sur ces dates.`;
    }
    return null;
  }, [range, periodes]);

  /* ── Avertissement règles (avant envoi) ─────────────────────── */

  const avertissementRegle = useMemo(() => {
    if (!range || mesEquipes.length === 0 || regles.length === 0) return null;
    const jours: string[] = [];
    let equipeEnCause = "";
    let maxEnCause = 0;
    for (let i = 0; i < nbJoursDemandes && i < 366; i++) {
      const d = new Date(range.lo + "T12:00:00");
      d.setDate(d.getDate() + i);
      const iso = toISO(d);
      for (const regle of regles) {
        if (!mesEquipes.includes(regle.equipe)) continue;
        const absents = absentsDuJour(iso).filter(p => !p.mien && p.equipes.includes(regle.equipe));
        if (absents.length + 1 > regle.max_absents) {
          jours.push(iso);
          equipeEnCause = regle.equipe;
          maxEnCause = regle.max_absents;
          break;
        }
      }
    }
    if (jours.length === 0) return null;
    const listeJours = jours.slice(0, 4).map(fmtCourt).join(", ") + (jours.length > 4 ? "…" : "");
    return `Équipe ${equipeEnCause} : le maximum de ${maxEnCause} absent${maxEnCause > 1 ? "s" : ""} simultané${maxEnCause > 1 ? "s" : ""} est déjà atteint le ${listeJours}. La demande sera refusée — choisis d'autres dates.`;
  }, [range, nbJoursDemandes, mesEquipes, regles, absentsDuJour]);

  /* ── Actions ────────────────────────────────────────────────── */

  const clearSelection = () => { setSelStart(null); setSelEnd(null); setFNote(""); };

  const submit = async () => {
    if (!range) { setMsg("Choisis tes dates sur le calendrier"); return; }
    setSending(true); setMsg("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetchApi("/api/conges", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ type: fType, date_debut: range.lo, date_fin: range.hi, note: fNote }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Erreur");
    else {
      setMsg("Demande envoyée — un responsable va la traiter");
      clearSelection();
      load();
    }
    setSending(false);
    setTimeout(() => setMsg(""), 8000);
  };

  const cancel = async (id: string) => {
    if (!confirm("Annuler cette demande ?")) return;
    const { data: sess } = await supabase.auth.getSession();
    await fetchApi("/api/conges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ id }),
    });
    load();
  };

  /* ── Rendu ──────────────────────────────────────────────────── */

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px" }}>
      <h1 style={{
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a", margin: "0 0 4px",
      }}>
        Mes congés
      </h1>
      <p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>
        Choisis tes dates sur le planning — tu vois qui est déjà absent.
      </p>

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

      {/* ── Planning d'équipe + sélection ── */}
      {!loading && !err && (
        <div style={{ ...card, padding: 14 }}>
          {/* Navigation mois */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button type="button" onClick={prevMonth} style={{
              background: "none", border: "1px solid #ddd6c8", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 15, color: "#1a1a1a",
            }}>‹</button>
            <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
              {MONTH_LABELS[calMonth]} {calYear}
            </span>
            <button type="button" onClick={nextMonth} style={{
              background: "none", border: "1px solid #ddd6c8", borderRadius: 8,
              width: 32, height: 32, cursor: "pointer", fontSize: 15, color: "#1a1a1a",
            }}>›</button>
          </div>

          {/* Grille */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{
                textAlign: "center", fontSize: 10, fontWeight: 700, color: "#999",
                padding: "4px 0", textTransform: "uppercase", letterSpacing: 0.5,
              }}>{d}</div>
            ))}
            {monthDays.map(cell => {
              const abs = cell.isCurrentMonth ? absentsDuJour(cell.iso) : [];
              const periode = cell.isCurrentMonth ? periodeDuJour(cell.iso) : null;
              const isToday = cell.iso === today;
              const isPast = cell.iso < today;
              const isStart = cell.iso === selStart;
              const isEnd = cell.iso === (selEnd ?? selStart);
              const inRange = !!(range && cell.iso >= range.lo && cell.iso <= range.hi);
              const isEndpoint = isStart || (selEnd != null && isEnd);
              const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;

              let bg = "transparent";
              if (isWeekend && cell.isCurrentMonth) bg = "rgba(0,0,0,0.02)";
              if (periode) bg = periode.type === "fermeture" ? "rgba(0,0,0,0.08)" : "rgba(220,38,38,0.07)";
              if (inRange && !isEndpoint) bg = "rgba(212,119,90,0.12)";
              if (isEndpoint) bg = "#D4775A";

              return (
                <div
                  key={cell.iso}
                  onClick={() => cell.isCurrentMonth && handleDayClick(cell.iso)}
                  title={periode ? `${periode.libelle} (${periode.type === "fermeture" ? "fermeture" : "période bloquée"})` : undefined}
                  style={{
                    minHeight: 52, padding: "3px 2px 2px",
                    border: isToday ? "2px solid #1565C0" : "1px solid #eee7db",
                    background: bg,
                    cursor: cell.isCurrentMonth && !isPast ? "pointer" : "default",
                    opacity: !cell.isCurrentMonth ? 0.35 : isPast ? 0.5 : 1,
                    borderRadius: isStart && !selEnd ? 8 : isStart ? "8px 0 0 8px" : isEnd && selEnd ? "0 8px 8px 0" : 0,
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 400, textAlign: "right", paddingRight: 2,
                    color: isEndpoint ? "#fff" : isWeekend ? "#bbb" : "#1a1a1a", marginBottom: 1,
                  }}>
                    {periode && (
                      <span style={{ float: "left", fontSize: 8.5, lineHeight: "13px" }}>
                        {periode.type === "fermeture" ? "🔒" : "⛔"}
                      </span>
                    )}
                    {cell.date.getDate()}
                  </div>
                  {abs.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 1, overflow: "hidden", maxHeight: 30 }}>
                      {abs.slice(0, 3).map(p => (
                        <div
                          key={p.id}
                          title={`${p.prenom} — ${TYPE_LABELS[p.type] ?? p.type}${p.statut === "en_attente" ? " (en attente)" : ""}`}
                          style={{
                            width: 14, height: 14, borderRadius: "50%",
                            background: p.mien ? "#D4775A" : typeColor(p.type),
                            opacity: p.statut === "en_attente" ? 0.45 : 1,
                            color: "#fff", fontSize: 6.5, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            lineHeight: 1, flexShrink: 0,
                          }}
                        >
                          {p.initiales}
                        </div>
                      ))}
                      {abs.length > 3 && (
                        <span style={{ fontSize: 8, color: isEndpoint ? "#fff" : "#999", fontWeight: 600 }}>+{abs.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Légende */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 10.5, color: "#666" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4775A", display: "inline-block" }} /> Moi
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E7D32", display: "inline-block" }} /> Congé validé
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2E7D32", opacity: 0.45, display: "inline-block" }} /> En attente
            </span>
            {periodes.some(p => p.type === "fermeture") && <span>🔒 Fermeture</span>}
            {periodes.some(p => p.type === "bloque") && <span>⛔ Période bloquée</span>}
          </div>
        </div>
      )}

      {/* ── Formulaire (dès qu'une date est choisie) ── */}
      {!loading && !err && selStart && (
        <div style={{ ...card, border: "2px solid #D4775A" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Nouvelle demande
              </div>
              <div style={{ fontSize: 13.5, color: "#1a1a1a", marginTop: 3 }}>
                {selEnd ? (
                  <>Du <strong style={{ color: "#D4775A" }}>{fmtDate(range!.lo)}</strong> au <strong style={{ color: "#D4775A" }}>{fmtDate(range!.hi)}</strong>
                    <span style={{ color: "#999" }}> · {nbJoursDemandes} j</span></>
                ) : (
                  <>Début : <strong style={{ color: "#D4775A" }}>{fmtDate(selStart)}</strong>
                    <span style={{ color: "#999", fontSize: 12 }}> — touche la date de fin</span></>
                )}
              </div>
            </div>
            <button type="button" onClick={clearSelection} style={{
              background: "none", border: "none", fontSize: 18, color: "#999", cursor: "pointer", padding: 2,
            }}>✕</button>
          </div>

          {(avertissementPeriode ?? avertissementRegle) && (
            <div style={{
              padding: "10px 12px", borderRadius: 10, marginBottom: 10,
              background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.25)",
              fontSize: 12.5, color: "#b3261e", fontWeight: 600,
            }}>
              {avertissementPeriode ?? avertissementRegle}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Type</label>
            <select style={inputSt} value={fType} onChange={e => setFType(e.target.value)}>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Message (facultatif)</label>
            <input style={inputSt} value={fNote} onChange={e => setFNote(e.target.value)} placeholder="ex. mariage de ma sœur" />
          </div>
          {(() => {
            const bloque = !!(avertissementPeriode ?? avertissementRegle);
            return (
              <button type="button" onClick={submit} disabled={sending || !selEnd || bloque} style={{
                width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
                background: bloque ? "#bbb" : "#4a6741", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: bloque ? "not-allowed" : "pointer", opacity: sending || !selEnd ? 0.6 : 1,
              }}>
                {sending ? "Envoi…" : "Envoyer la demande"}
              </button>
            );
          })()}
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
