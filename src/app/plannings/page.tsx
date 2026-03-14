"use client";

import { useEffect, useMemo, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { TopNav } from "@/components/TopNav";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────

type Shift = {
  id: string;
  employe_id: string;
  poste_id: string | null;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_minutes: number;
  statut: string;
  note: string | null;
};

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  contrat_type: string | null;
  equipe_access: string[];
};

type Poste = {
  id: string;
  nom: string;
  couleur: string;
  emoji: string | null;
  equipe: string;
};

type FilterEquipe = "Tous" | "Cuisine" | "Salle";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(t: string): string {
  return t.slice(0, 5);
}

function shiftDureeNette(debut: string, fin: string, pause: number): number {
  const [h1, m1] = debut.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, (minutes - pause) / 60);
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PlanningsPage() {
  const { canWrite } = useProfile();
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterEquipe>("Tous");

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekNum = getWeekNumber(monday);

  // Fetch data when week changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const dateDebut = fmtDate(monday);
      const dateFin = fmtDate(addDays(monday, 6));

      const [shiftsRes, employesRes, postesRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("id, employe_id, poste_id, date, heure_debut, heure_fin, pause_minutes, statut, note")
          .gte("date", dateDebut)
          .lte("date", dateFin)
          .order("heure_debut"),
        supabase
          .from("employes")
          .select("id, prenom, nom, initiales, contrat_type, equipe_access")
          .eq("actif", true)
          .order("nom"),
        supabase
          .from("postes")
          .select("id, nom, couleur, emoji, equipe")
          .eq("actif", true),
      ]);

      setShifts(shiftsRes.data ?? []);
      setEmployes(employesRes.data ?? []);
      setPostes(postesRes.data ?? []);
      setLoading(false);
    }
    fetchData();
  }, [monday]);

  // Filter employees by team
  const filteredEmployes = employes.filter((e) => {
    if (filter === "Tous") return true;
    return e.equipe_access?.includes(filter);
  });

  // Map postes by id
  const posteMap = useMemo(() => {
    const m = new Map<string, Poste>();
    for (const p of postes) m.set(p.id, p);
    return m;
  }, [postes]);

  // Group shifts by employe+date
  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.employe_id}__${s.date}`;
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [shifts]);

  // Calculate weekly totals per employee
  const weeklyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of shifts) {
      const cur = totals.get(s.employe_id) ?? 0;
      totals.set(s.employe_id, cur + shiftDureeNette(s.heure_debut, s.heure_fin, s.pause_minutes));
    }
    return totals;
  }, [shifts]);

  // Nav
  const prevWeek = () => setMonday(addDays(monday, -7));
  const nextWeek = () => setMonday(addDays(monday, 7));
  const goToday = () => setMonday(getMonday(new Date()));

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 40px" }}>
        <TopNav
          title="PLANNING"
          subtitle={`Semaine ${weekNum} — ${fmtDateShort(monday)} au ${fmtDateShort(addDays(monday, 6))}`}
          eyebrow="Plannings"
        />

        {/* Navigation semaine + filtres */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={prevWeek} style={navBtnStyle}>← Sem. préc.</button>
          <button type="button" onClick={goToday} style={{ ...navBtnStyle, fontWeight: 700, color: "#D4775A" }}>Aujourd&apos;hui</button>
          <button type="button" onClick={nextWeek} style={navBtnStyle}>Sem. suiv. →</button>

          <div style={{ flex: 1 }} />

          {(["Tous", "Cuisine", "Salle"] as FilterEquipe[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                border: filter === f ? "2px solid #D4775A" : "1px solid #ddd6c8",
                background: filter === f ? "rgba(212,119,90,0.08)" : "#fff",
                fontSize: 11,
                fontWeight: 700,
                color: filter === f ? "#D4775A" : "#666",
                cursor: "pointer",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#999", fontSize: 13 }}>
            Chargement...
          </div>
        ) : (
          /* Planning Grid */
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 130, textAlign: "left" }}>Collaborateur</th>
                  {days.map((d) => {
                    const isToday = fmtDate(d) === fmtDate(new Date());
                    return (
                      <th key={fmtDate(d)} style={{
                        ...thStyle,
                        minWidth: 100,
                        background: isToday ? "rgba(212,119,90,0.06)" : undefined,
                      }}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: "#999" }}>
                          {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? "#D4775A" : "#1a1a1a" }}>
                          {d.getDate()}
                        </div>
                      </th>
                    );
                  })}
                  <th style={{ ...thStyle, minWidth: 60 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployes.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
                      Aucun collaborateur dans cette équipe.
                    </td>
                  </tr>
                ) : (
                  filteredEmployes.map((emp) => {
                    const total = weeklyTotals.get(emp.id) ?? 0;
                    const isTNS = emp.contrat_type === "TNS";

                    return (
                      <tr key={emp.id}>
                        {/* Employee name */}
                        <td style={{
                          ...tdStyle,
                          position: "sticky",
                          left: 0,
                          background: "#fff",
                          zIndex: 2,
                          borderRight: "2px solid #ece6db",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: isTNS
                                ? "linear-gradient(135deg, #9B8EC4, #7B6FA4)"
                                : "linear-gradient(135deg, #D4775A, #C4674A)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#fff",
                              flexShrink: 0,
                              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                            }}>
                              {emp.initiales ?? (emp.prenom[0] + emp.nom[0]).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.2 }}>
                                {emp.prenom}
                              </div>
                              <div style={{ fontSize: 10, color: "#999" }}>
                                {emp.nom}
                                {isTNS && (
                                  <span style={{
                                    marginLeft: 4,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    padding: "1px 4px",
                                    borderRadius: 4,
                                    background: "rgba(155,142,196,0.15)",
                                    color: "#9B8EC4",
                                  }}>TNS</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Days */}
                        {days.map((d) => {
                          const dateStr = fmtDate(d);
                          const isToday = dateStr === fmtDate(new Date());
                          const dayShifts = shiftMap.get(`${emp.id}__${dateStr}`) ?? [];

                          return (
                            <td key={dateStr} style={{
                              ...tdStyle,
                              background: isToday ? "rgba(212,119,90,0.03)" : undefined,
                              verticalAlign: "top",
                            }}>
                              {dayShifts.length === 0 ? (
                                <div style={{ color: "#ddd", fontSize: 11, textAlign: "center" }}>—</div>
                              ) : (
                                <div style={{ display: "grid", gap: 3 }}>
                                  {dayShifts.map((s) => {
                                    const poste = s.poste_id ? posteMap.get(s.poste_id) : null;
                                    return (
                                      <ShiftCell key={s.id} shift={s} poste={poste} />
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Weekly total */}
                        <td style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 700,
                          fontSize: 13,
                          color: isTNS ? "#9B8EC4" : total > 0 ? "#1a1a1a" : "#ddd",
                          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        }}>
                          {total > 0 ? `${Math.round(total * 100) / 100}h` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

// ── ShiftCell ────────────────────────────────────────────────────────────────

function ShiftCell({ shift, poste }: { shift: Shift; poste: Poste | null | undefined }) {
  const bg = poste ? `${poste.couleur}18` : "rgba(0,0,0,0.04)";
  const border = poste ? `${poste.couleur}40` : "rgba(0,0,0,0.08)";
  const color = poste ? poste.couleur : "#666";

  return (
    <div style={{
      padding: "4px 6px",
      borderRadius: 6,
      background: bg,
      borderLeft: `3px solid ${border}`,
      fontSize: 10,
      lineHeight: 1.3,
    }}>
      <div style={{ fontWeight: 700, color }}>
        {poste?.emoji ? `${poste.emoji} ` : ""}{poste?.nom ?? "—"}
      </div>
      <div style={{ color: "#666" }}>
        {fmtTime(shift.heure_debut)}–{fmtTime(shift.heure_fin)}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 20,
  border: "1px solid #ddd6c8",
  background: "#fff",
  fontSize: 11,
  fontWeight: 600,
  color: "#666",
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  padding: "8px 6px",
  borderBottom: "2px solid #ddd6c8",
  textAlign: "center",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  fontWeight: 700,
  color: "#1a1a1a",
};

const tdStyle: React.CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid #f0ebe3",
};
