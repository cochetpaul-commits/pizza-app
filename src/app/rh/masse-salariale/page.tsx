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

type MonthOption = { value: string; label: string; from: string; to: string };

// ── Constants ────────────────────────────────────────────────────────────

const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 12 };
const KPI = { fontSize: 28, fontWeight: 700 as const, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" };
const LABEL = { fontSize: 10, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 };

function fmt(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtDec(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getMonthOptions(): MonthOption[] {
  const opts: MonthOption[] = [];
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

// ── Component ────────────────────────────────────────────────────────────

export default function MasseSalarialePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const [presences, setPresences] = useState<ComboPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [caMonth, setCaMonth] = useState<number | null>(null);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value ?? "");
  const selected = monthOptions.find(m => m.value === selectedMonth);

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

  // Load CA for selected month
  const loadCA = useCallback(async () => {
    if (!etab || !selected) return;
    try {
      const res = await fetch(`/api/ventes/stats?etablissement_id=${etab.id}&from=${selected.from}&to=${selected.to}`);
      const json = await res.json();
      if (json.stats?.total_ttc) {
        setCaMonth(json.stats.total_ttc);
      } else if (json.stats?.semaine?.totalSales) {
        setCaMonth(json.stats.semaine.totalSales);
      } else {
        setCaMonth(null);
      }
    } catch { setCaMonth(null); }
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

  // Masse salariale estimée (heures × taux moyen)
  // TODO: utiliser les vrais taux depuis contrats
  const masseSalarialeEstimee = totals.hTrav * 15; // placeholder 15€/h brut moyen
  const ratioCA = caMonth && caMonth > 0 ? (masseSalarialeEstimee / caMonth) * 100 : null;

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

        {/* Month selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{
              height: 40, borderRadius: 10, border: "1px solid #ddd6c8",
              padding: "0 14px", fontSize: 14, fontWeight: 600, background: "#fff",
              color: "#1a1a1a", cursor: "pointer", flex: 1,
            }}
          >
            {monthOptions.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {importMsg && <div style={{ fontSize: 12, color: ACCENT, marginBottom: 10 }}>{importMsg}</div>}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={CARD}>
            <div style={LABEL}>Heures travaillees</div>
            <div style={KPI}>{fmtDec(totals.hTrav)}h</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{fmtDec(totals.hPlan)}h planifiees</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>CA du mois</div>
            <div style={KPI}>{caMonth ? `${fmt(caMonth)}€` : "—"}</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Masse salariale est.</div>
            <div style={KPI}>{fmt(masseSalarialeEstimee)}€</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>Base 15€/h brut moy.</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Ratio masse / CA</div>
            <div style={{ ...KPI, color: ratioCA && ratioCA < 35 ? GREEN : ratioCA && ratioCA < 45 ? "#D97706" : "#DC2626" }}>
              {ratioCA ? `${ratioCA.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Repas + Jours */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
          <div style={CARD}>
            <div style={LABEL}>Repas</div>
            <div style={KPI}>{totals.repas}</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Jours travailles</div>
            <div style={KPI}>{totals.jours}</div>
          </div>
        </div>

        {/* Employee table */}
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 12 }}>Detail par employe — {selected?.label ?? ""}</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
          ) : aggregated.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#bbb", fontSize: 13 }}>
              Aucune donnee Combo pour ce mois.
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

        {/* FAB Import Combo */}
        <label style={{
          position: "fixed",
          bottom: "calc(92px + env(safe-area-inset-bottom, 0px))",
          right: 16, zIndex: 105,
          height: 44, padding: "0 20px",
          borderRadius: 22, border: "none",
          background: ACCENT, color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(212,119,90,0.35), 0 2px 6px rgba(0,0,0,0.1)",
          fontFamily: "inherit",
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
