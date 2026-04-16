"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ────────────────────────────────────────────────────────────────

type ComboPresence = {
  id: string;
  combo_nom: string;
  equipe: string | null;
  employe_id: string | null;
  matched: boolean;
  heures_planifiees: number;
  heures_travaillees: number;
  heures_contrat: number;
  nb_repas: number;
  nb_jours_travailles: number;
  ecart_total: number;
  periode_debut: string;
  periode_fin: string;
};

type PeriodMode = "month" | "week";
type PeriodOption = { value: string; label: string; from: string; to: string };

// ── Helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekKey(d: Date): string {
  // ISO week: monday-based, year-week
  const t = new Date(d);
  t.setDate(t.getDate() + 4 - (t.getDay() || 7));
  const yearStart = new Date(t.getFullYear(), 0, 1);
  const w = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

function getWeekBounds(d: Date): { from: string; to: string; label: string } {
  const dow = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + 1); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const mDay = mon.getDate();
  const sDay = sun.getDate();
  const mMonth = mon.toLocaleDateString("fr-FR", { month: "short" });
  const sMonth = sun.toLocaleDateString("fr-FR", { month: "short" });
  const label = mon.getMonth() === sun.getMonth()
    ? `Sem. ${mDay}–${sDay} ${sMonth} ${sun.getFullYear()}`
    : `Sem. ${mDay} ${mMonth} – ${sDay} ${sMonth} ${sun.getFullYear()}`;
  return { from: toISO(mon), to: toISO(sun), label };
}

// ── Constants ────────────────────────────────────────────────────────────

const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 12 };
const KPI = { fontSize: 28, fontWeight: 700 as const, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" };
const LABEL = { fontSize: 10, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 };

function fmt(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtDec(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getMonthOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const last = new Date(y, m + 1, 0);
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
    opts.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label, from, to });
  }
  return opts;
}

function getWeekOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  // 12 weeks back including current
  for (let i = 0; i < 12; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    const { from, to, label } = getWeekBounds(d);
    const value = getWeekKey(d);
    if (!opts.find(o => o.value === value)) {
      opts.push({ value, label, from, to });
    }
  }
  return opts;
}

// ── Component ────────────────────────────────────────────────────────────

export default function MasseSalarialePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const [presences, setPresences] = useState<ComboPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [caMonth, setCaMonth] = useState<number | null>(null);
  const [caHtMonth, setCaHtMonth] = useState<number | null>(null);
  const [couvertsMonth, setCouvertsMonth] = useState<number | null>(null);
  const [ticketsMonth, setTicketsMonth] = useState<number | null>(null);
  const [tauxHoraire, setTauxHoraire] = useState<number>(15);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const weekOptions = useMemo(() => getWeekOptions(), []);
  const options = periodMode === "month" ? monthOptions : weekOptions;
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value ?? "");
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[0]?.value ?? "");
  const selectedValue = periodMode === "month" ? selectedMonth : selectedWeek;
  const selected = options.find(o => o.value === selectedValue);
  const setSelectedValue = (v: string) => {
    if (periodMode === "month") setSelectedMonth(v); else setSelectedWeek(v);
  };
  const currentIdx = options.findIndex(o => o.value === selectedValue);
  const goPrev = () => { if (currentIdx < options.length - 1) setSelectedValue(options[currentIdx + 1].value); };
  const goNext = () => { if (currentIdx > 0) setSelectedValue(options[currentIdx - 1].value); };

  // Load presences for selected month
  const loadPresences = useCallback(async () => {
    if (!etab || !selected) return;
    setLoading(true);
    const { data } = await supabase
      .from("combo_presences")
      .select("id, combo_nom, equipe, employe_id, matched, heures_planifiees, heures_travaillees, heures_contrat, nb_repas, nb_jours_travailles, ecart_total, periode_debut, periode_fin")
      .eq("etablissement_id", etab.id)
      .gte("periode_debut", selected.from)
      .lte("periode_fin", selected.to)
      .order("combo_nom");
    setPresences((data ?? []) as ComboPresence[]);
    setLoading(false);
  }, [etab, selected]);

  // Load CA + stats for selected period
  const loadCA = useCallback(async () => {
    if (!etab || !selected) return;
    try {
      const res = await fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${selected.from}&to=${selected.to}`);
      const json = await res.json();
      const s = json.stats;
      setCaMonth(s?.ca_ttc ?? s?.total_ttc ?? null);
      setCaHtMonth(s?.ca_ht ?? s?.total_ht ?? null);
      setCouvertsMonth(s?.couverts ?? null);
      setTicketsMonth(s?.tickets ?? null);
    } catch {
      setCaMonth(null); setCaHtMonth(null); setCouvertsMonth(null); setTicketsMonth(null);
    }
  }, [etab, selected]);

  useEffect(() => { loadPresences(); loadCA(); }, [loadPresences, loadCA]); // eslint-disable-line react-hooks/set-state-in-effect

  // Aggregate by employee (merge multiple weeks)
  const aggregated = useMemo(() => {
    const map = new Map<string, { nom: string; equipe: string | null; matched: boolean; hPlan: number; hTrav: number; hContrat: number; repas: number; jours: number; ecart: number }>();
    for (const p of presences) {
      const key = p.combo_nom;
      const prev = map.get(key);
      if (prev) {
        prev.hPlan += p.heures_planifiees;
        prev.hTrav += p.heures_travaillees;
        prev.repas += p.nb_repas;
        prev.jours += p.nb_jours_travailles;
        prev.ecart += p.ecart_total;
      } else {
        map.set(key, {
          nom: p.combo_nom,
          equipe: p.equipe,
          matched: p.matched,
          hPlan: p.heures_planifiees,
          hTrav: p.heures_travaillees,
          hContrat: p.heures_contrat,
          repas: p.nb_repas,
          jours: p.nb_jours_travailles,
          ecart: p.ecart_total,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [presences]);

  const totals = useMemo(() => ({
    hPlan: aggregated.reduce((s, e) => s + e.hPlan, 0),
    hTrav: aggregated.reduce((s, e) => s + e.hTrav, 0),
    repas: aggregated.reduce((s, e) => s + e.repas, 0),
    jours: aggregated.reduce((s, e) => s + e.jours, 0),
  }), [aggregated]);

  // Masse salariale estimée (heures × taux horaire brut moyen configurable)
  // Charges patronales ~ 42% sur restauration
  const masseSalarialeBrute = totals.hTrav * tauxHoraire;
  const chargesPatronales = masseSalarialeBrute * 0.42;
  const masseSalarialeChargee = masseSalarialeBrute + chargesPatronales;
  const ratioCA = caMonth && caMonth > 0 ? (masseSalarialeChargee / caMonth) * 100 : null;
  const productivite = totals.hTrav > 0 && caMonth ? caMonth / totals.hTrav : null;
  const ticketMoyen = couvertsMonth && couvertsMonth > 0 && caMonth ? caMonth / couvertsMonth : null;
  const heuresSup = aggregated.reduce((s, e) => s + Math.max(0, e.ecart), 0);
  const heuresManquantes = aggregated.reduce((s, e) => s + Math.max(0, -e.ecart), 0);

  // Import handler
  const handleImport = async (file: File) => {
    if (!etab) return;
    setImporting(true);
    setImportMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", "commit");
    try {
      const auth = localStorage.getItem(Object.keys(localStorage).find(k => k.includes("auth-token")) ?? "");
      let token = "";
      if (auth) { try { const p = JSON.parse(auth); token = p?.access_token ?? p?.currentSession?.access_token ?? ""; } catch { /* */ } }
      const res = await fetchApi("/api/rh/combo-import", {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-etablissement-id": etab.id,
        },
        body: fd,
      });
      const json = await res.json();
      if (json.ok) {
        setImportMsg(`${json.nb_employes} employes importes (${json.periode.debut} → ${json.periode.fin})`);
        loadPresences();
      } else {
        setImportMsg("Erreur : " + (json.error ?? "inconnue"));
      }
    } catch (e) {
      setImportMsg("Erreur : " + String(e));
    }
    setImporting(false);
  };

  const etabColor = etab?.couleur ?? ACCENT;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 100px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: etabColor }} />
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, margin: 0, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Masse salariale
          </h1>
        </div>

        {/* Tabs: Reelle / TNS / Simulateur */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, marginBottom: 18, border: "1px solid #e8e0d0" }}>
          <button type="button" style={{
            flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
            background: "#fff", color: "#1a1a1a",
            fontSize: 12, fontWeight: 700, cursor: "default",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)", whiteSpace: "nowrap",
          }}>
            Masse salariale reelle
          </button>
          <button type="button" onClick={() => router.push("/ventes/simulation?tab=tns")} style={{
            flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
            background: "transparent", color: "#777",
            fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Statuts TNS
          </button>
          <button type="button" onClick={() => router.push("/ventes/simulation?tab=simulateur")} style={{
            flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
            background: "transparent", color: "#777",
            fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            Simulateur d&apos;embauche
          </button>
        </div>

        {/* Mode toggle Mois / Semaine — centré */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ display: "inline-flex", gap: 4, padding: 3, background: "#f0ebe2", borderRadius: 10, border: "1px solid #e8e0d0" }}>
            {(["month", "week"] as const).map(m => (
              <button key={m} type="button" onClick={() => setPeriodMode(m)} style={{
                padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: periodMode === m ? "#fff" : "transparent",
                color: periodMode === m ? ACCENT : "#777",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                boxShadow: periodMode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
                {m === "month" ? "Mois" : "Semaine"}
              </button>
            ))}
          </div>
        </div>

        {/* Period selector with arrows — centré */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 420 }}>
            <button type="button" onClick={goPrev} disabled={currentIdx >= options.length - 1} style={{
              width: 40, height: 40, borderRadius: 10, border: "none",
              background: currentIdx >= options.length - 1 ? "#f0ebe3" : ACCENT + "15",
              color: currentIdx >= options.length - 1 ? "#ccc" : ACCENT,
              fontSize: 16, fontWeight: 700,
              cursor: currentIdx >= options.length - 1 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>{"←"}</button>
            <select
              value={selectedValue}
              onChange={e => setSelectedValue(e.target.value)}
              style={{
                height: 40, borderRadius: 10, border: "1px solid #ddd6c8",
                padding: "0 14px", fontSize: 14, fontWeight: 600, background: "#fff",
                color: "#1a1a1a", cursor: "pointer", flex: 1, textAlign: "center",
              }}
            >
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button type="button" onClick={goNext} disabled={currentIdx <= 0} style={{
              width: 40, height: 40, borderRadius: 10, border: "none",
              background: currentIdx <= 0 ? "#f0ebe3" : ACCENT + "15",
              color: currentIdx <= 0 ? "#ccc" : ACCENT,
              fontSize: 16, fontWeight: 700,
              cursor: currentIdx <= 0 ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>{"→"}</button>
          </div>
        </div>

        {importMsg && <div style={{ fontSize: 12, color: ACCENT, marginBottom: 10 }}>{importMsg}</div>}

        {/* ── KPIs RH + Popina ── */}

        {/* Highlight card : Ratio masse / CA */}
        <div style={{
          ...CARD,
          background: `linear-gradient(135deg, ${etab?.couleur ?? ACCENT} 0%, ${etab?.couleur ?? ACCENT}dd 100%)`,
          border: "none", color: "#fff", marginBottom: 14,
        }}>
          <div style={{ ...LABEL, color: "rgba(255,255,255,0.75)" }}>Ratio masse salariale / CA</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 40, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", color: "#fff" }}>
              {ratioCA ? `${ratioCA.toFixed(1)}%` : "—"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
              cible &lt; 35% · {ratioCA && ratioCA < 35 ? "OK" : ratioCA && ratioCA < 45 ? "Vigilance" : ratioCA ? "Alerte" : ""}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 8 }}>
            {fmt(masseSalarialeChargee)}€ chargee · {caMonth ? `${fmt(caMonth)}€ CA TTC` : "CA non disponible"}
          </div>
        </div>

        {/* Row 1 — CA Popina */}
        <div style={{ ...LABEL, marginBottom: 8, marginTop: 4 }}>Chiffre d&apos;affaires</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={CARD}>
            <div style={LABEL}>CA TTC</div>
            <div style={KPI}>{caMonth ? `${fmt(caMonth)}€` : "—"}</div>
            {caHtMonth && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{fmt(caHtMonth)}€ HT</div>}
          </div>
          <div style={CARD}>
            <div style={LABEL}>Ticket moyen</div>
            <div style={KPI}>{ticketMoyen ? `${fmt(ticketMoyen)}€` : "—"}</div>
            {couvertsMonth && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{couvertsMonth} cvts · {ticketsMonth} tickets</div>}
          </div>
        </div>

        {/* Row 2 — Heures */}
        <div style={{ ...LABEL, marginBottom: 8 }}>Heures</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={CARD}>
            <div style={LABEL}>Travaillees</div>
            <div style={KPI}>{fmtDec(totals.hTrav)}h</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
              <span style={{ color: heuresSup > 0 ? GREEN : "#999" }}>+{fmtDec(heuresSup)}h sup.</span>
              {" · "}
              <span style={{ color: heuresManquantes > 0 ? "#DC2626" : "#999" }}>-{fmtDec(heuresManquantes)}h</span>
            </div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Productivite</div>
            <div style={KPI}>{productivite ? `${fmt(productivite)}€/h` : "—"}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>CA / heure travaillee</div>
          </div>
        </div>

        {/* Row 3 — Masse salariale */}
        <div style={{ ...LABEL, marginBottom: 8 }}>Masse salariale</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={CARD}>
            <div style={LABEL}>Brute estimee</div>
            <div style={KPI}>{fmt(masseSalarialeBrute)}€</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
              Taux:
              <input type="number" value={tauxHoraire} onChange={e => setTauxHoraire(Number(e.target.value) || 15)}
                style={{ width: 48, border: "1px solid #ddd6c8", borderRadius: 6, padding: "2px 6px", fontSize: 11, textAlign: "center" }} />€/h
            </div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Chargee (~42%)</div>
            <div style={KPI}>{fmt(masseSalarialeChargee)}€</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>+ {fmt(chargesPatronales)}€ charges</div>
          </div>
        </div>

        {/* Row 4 — Repas & Jours */}
        <div style={{ ...LABEL, marginBottom: 8 }}>Avantages</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <div style={CARD}>
            <div style={LABEL}>Repas</div>
            <div style={KPI}>{totals.repas}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>Avantage en nature</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Jours travailles</div>
            <div style={KPI}>{totals.jours}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{aggregated.length} collaborateur{aggregated.length > 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Employee table */}
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 12 }}>Detail par employe — {selected?.label ?? ""}</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
          ) : aggregated.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#bbb", fontSize: 13 }}>
              Aucune donnee Combo pour cette {periodMode === "week" ? "semaine" : "periode"}.
              <br />Importez une feuille de presence.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "8px 8px 8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Employe</th>
                    <th style={{ textAlign: "left", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Equipe</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>H. plan.</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>H. trav.</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Ecart</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Repas</th>
                    <th style={{ textAlign: "right", padding: "8px 0 8px 4px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Jours</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregated.map((e, i) => (
                    <tr key={e.nom} style={{ borderBottom: "1px solid #f0ebe3", background: i % 2 === 0 ? "#fff" : "#faf7f2" }}>
                      <td style={{ padding: "10px 8px 10px 0", fontWeight: 600 }}>
                        {e.nom}
                        {!e.matched && <span style={{ fontSize: 9, color: "#DC2626", marginLeft: 4 }}>?</span>}
                      </td>
                      <td style={{ padding: "10px 4px", color: "#777" }}>{e.equipe ?? "—"}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right" }}>{fmtDec(e.hPlan)}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 600 }}>{fmtDec(e.hTrav)}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", color: e.ecart >= 0 ? GREEN : "#DC2626", fontWeight: 600 }}>
                        {e.ecart >= 0 ? "+" : ""}{fmtDec(e.ecart)}
                      </td>
                      <td style={{ padding: "10px 4px", textAlign: "right" }}>{e.repas}</td>
                      <td style={{ padding: "10px 0 10px 4px", textAlign: "right" }}>{e.jours}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ borderTop: "2px solid #ddd6c8", fontWeight: 700 }}>
                    <td style={{ padding: "10px 8px 10px 0" }}>Total</td>
                    <td style={{ padding: "10px 4px" }}>{aggregated.length} emp.</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>{fmtDec(totals.hPlan)}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>{fmtDec(totals.hTrav)}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>{fmtDec(totals.hTrav - totals.hPlan)}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>{totals.repas}</td>
                    <td style={{ padding: "10px 0 10px 4px", textAlign: "right" }}>{totals.jours}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FAB Import Combo — centré */}
        <label style={{
          position: "fixed",
          bottom: "calc(92px + env(safe-area-inset-bottom, 0px))",
          left: "50%", transform: "translateX(-50%)",
          zIndex: 105,
          height: 48, padding: "0 22px",
          borderRadius: 24, border: "none",
          background: ACCENT, color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 4px 16px rgba(212,119,90,0.4), 0 2px 6px rgba(0,0,0,0.1)",
          fontFamily: "inherit",
          textTransform: "uppercase", letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}>
          <input type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = "";
          }} />
          <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 300 }}>+</span>
          {importing ? "Import..." : "Import Combo"}
        </label>
      </div>
    </RequireRole>
  );
}
