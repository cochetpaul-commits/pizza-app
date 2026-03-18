"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
};

type Shift = {
  employe_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
};

/* ── Styles ────────────────────────────────────────────────────── */

const h1Style: React.CSSProperties = {
  fontFamily: "var(--font-oswald), Oswald, sans-serif",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 16,
  color: "#1a1a1a",
};

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ── Helpers ───────────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  return `${formatShortDate(monday)} - ${formatShortDate(sunday)}`;
}

function hoursFromTimes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // overnight shift
  return diff / 60;
}

/* ── Constants ─────────────────────────────────────────────────── */

const OVERTIME_DAILY_THRESHOLD = 10; // hours — red text
const OVERTIME_WEEKLY_THRESHOLD = 43; // hours — HCR alert, red row

/* ── Component ─────────────────────────────────────────────────── */

export default function EmargementPage() {
  const { current: etab } = useEtablissement();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [loading, setLoading] = useState(true);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [monday]);

  const weekISOs = useMemo(() => weekDates.map(toISO), [weekDates]);

  // Track which employees have shifts scheduled on which days
  const scheduledDays = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of shifts) {
      if (!map.has(s.employe_id)) map.set(s.employe_id, new Set());
      map.get(s.employe_id)!.add(s.date);
    }
    return map;
  }, [shifts]);

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    const startISO = weekISOs[0];
    const endISO = weekISOs[6];

    (async () => {
      setLoading(true);
      const [empRes, shiftRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("nom"),
        supabase
          .from("shifts")
          .select("employe_id, date, heure_debut, heure_fin")
          .eq("etablissement_id", etab.id)
          .gte("date", startISO)
          .lte("date", endISO),
      ]);

      if (cancelled) return;
      setEmployes(empRes.data ?? []);
      setShifts(shiftRes.data ?? []);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab, weekISOs]);

  // Build hours grid: employeId -> dayISO -> totalHours
  const grid = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of shifts) {
      if (!map.has(s.employe_id)) map.set(s.employe_id, new Map());
      const dayMap = map.get(s.employe_id)!;
      const h = hoursFromTimes(s.heure_debut, s.heure_fin);
      dayMap.set(s.date, (dayMap.get(s.date) ?? 0) + h);
    }
    return map;
  }, [shifts]);

  const getHours = (empId: string, dayISO: string): number => {
    return grid.get(empId)?.get(dayISO) ?? 0;
  };

  const getWeekTotal = (empId: string): number => {
    return weekISOs.reduce((sum, d) => sum + getHours(empId, d), 0);
  };

  const hasShiftScheduled = (empId: string, dayISO: string): boolean => {
    return scheduledDays.get(empId)?.has(dayISO) ?? false;
  };

  const prevWeek = () => setMonday((m) => addDays(m, -7));
  const nextWeek = () => setMonday((m) => addDays(m, 7));
  const thisWeek = () => setMonday(getMonday(new Date()));

  const grandTotal = employes.reduce((sum, e) => sum + getWeekTotal(e.id), 0);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ ...h1Style, marginBottom: 0 }}>Feuille d&apos;emargement</h1>
        </div>

        {/* Week navigator */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f6eedf",
            borderRadius: 12,
            padding: "10px 16px",
            marginBottom: 20,
          }}
        >
          <button
            onClick={prevWeek}
            style={{
              border: "1px solid #ddd6c8",
              borderRadius: 8,
              background: "#fff",
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
              color: "#1a1a1a",
              fontWeight: 600,
            }}
          >
            &larr; Sem. prec.
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>
              Semaine du {formatWeekRange(monday)}
            </div>
            <button
              onClick={thisWeek}
              style={{
                border: "none",
                background: "transparent",
                color: "#e27f57",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                marginTop: 2,
              }}
            >
              Semaine actuelle
            </button>
          </div>
          <button
            onClick={nextWeek}
            style={{
              border: "1px solid #ddd6c8",
              borderRadius: 8,
              background: "#fff",
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
              color: "#1a1a1a",
              fontWeight: 600,
            }}
          >
            Sem. suiv. &rarr;
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : !etab ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Selectionnez un etablissement
          </p>
        ) : employes.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Aucun employe actif</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 8px",
                        fontSize: 12,
                        color: "#999",
                        fontWeight: 600,
                        minWidth: 140,
                        position: "sticky",
                        left: 0,
                        background: "#fff",
                      }}
                    >
                      Employe
                    </th>
                    {weekDates.map((d, i) => {
                      const isToday = toISO(d) === toISO(new Date());
                      return (
                        <th
                          key={i}
                          style={{
                            textAlign: "center",
                            padding: "10px 4px",
                            fontSize: 12,
                            color: isToday ? "#e27f57" : "#999",
                            fontWeight: 600,
                            minWidth: 60,
                          }}
                        >
                          <div>{DAY_LABELS[i]}</div>
                          <div style={{ fontSize: 11, fontWeight: 400 }}>
                            {d.getDate()}/{d.getMonth() + 1}
                          </div>
                        </th>
                      );
                    })}
                    <th
                      style={{
                        textAlign: "center",
                        padding: "10px 8px",
                        fontSize: 12,
                        color: "#1a1a1a",
                        fontWeight: 700,
                        minWidth: 60,
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employes.map((emp) => {
                    const total = getWeekTotal(emp.id);
                    const isOverWeek = total > OVERTIME_WEEKLY_THRESHOLD;
                    return (
                      <tr
                        key={emp.id}
                        style={{
                          borderBottom: "1px solid #ddd6c8",
                          transition: "background 0.15s",
                          background: isOverWeek ? "rgba(198,40,40,0.06)" : undefined,
                        }}
                        onMouseEnter={(e) => {
                          if (!isOverWeek) e.currentTarget.style.background = "#f5f0e8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isOverWeek ? "rgba(198,40,40,0.06)" : "transparent";
                        }}
                      >
                        <td
                          style={{
                            padding: "10px 8px",
                            fontSize: 13,
                            fontWeight: 500,
                            position: "sticky",
                            left: 0,
                            background: "inherit",
                          }}
                        >
                          {emp.prenom} {emp.nom}
                          {isOverWeek && (
                            <span
                              style={{
                                display: "inline-block",
                                marginLeft: 6,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#c62828",
                                background: "#fce4e4",
                                borderRadius: 4,
                                padding: "1px 5px",
                                verticalAlign: "middle",
                              }}
                            >
                              &gt;43h
                            </span>
                          )}
                        </td>
                        {weekISOs.map((dayISO, i) => {
                          const h = getHours(emp.id, dayISO);
                          const isToday = dayISO === toISO(new Date());
                          const isOvertime = h > OVERTIME_DAILY_THRESHOLD;
                          const isScheduledNoHours = h === 0 && hasShiftScheduled(emp.id, dayISO);

                          let cellBg: string | undefined;
                          if (isScheduledNoHours) {
                            cellBg = "rgba(226,127,87,0.15)"; // orange for scheduled but 0h
                          } else if (isToday) {
                            cellBg = "rgba(226,127,87,0.06)";
                          }

                          return (
                            <td
                              key={i}
                              style={{
                                textAlign: "center",
                                padding: "10px 4px",
                                fontSize: 13,
                                fontVariantNumeric: "tabular-nums",
                                color: isOvertime ? "#c62828" : h > 0 ? "#1a1a1a" : "#ccc",
                                fontWeight: isOvertime ? 700 : h > 0 ? 500 : 400,
                                background: cellBg,
                              }}
                            >
                              {h > 0 ? h.toFixed(1).replace(/\.0$/, "") : "-"}
                            </td>
                          );
                        })}
                        <td
                          style={{
                            textAlign: "center",
                            padding: "10px 8px",
                            fontSize: 13,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                            color: isOverWeek ? "#c62828" : total > 0 ? "#1a1a1a" : "#ccc",
                          }}
                        >
                          {total > 0 ? total.toFixed(1).replace(/\.0$/, "") + "h" : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Grand total row */}
                  <tr style={{ borderTop: "2px solid #ddd6c8", background: "#f6eedf" }}>
                    <td
                      style={{
                        padding: "10px 8px",
                        fontSize: 13,
                        fontWeight: 700,
                        position: "sticky",
                        left: 0,
                        background: "#f6eedf",
                      }}
                    >
                      Total equipe
                    </td>
                    {weekISOs.map((dayISO, i) => {
                      const dayTotal = employes.reduce((s, e) => s + getHours(e.id, dayISO), 0);
                      return (
                        <td
                          key={i}
                          style={{
                            textAlign: "center",
                            padding: "10px 4px",
                            fontSize: 13,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: dayTotal > 0 ? "#1a1a1a" : "#ccc",
                          }}
                        >
                          {dayTotal > 0 ? dayTotal.toFixed(1).replace(/\.0$/, "") : "-"}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        textAlign: "center",
                        padding: "10px 8px",
                        fontSize: 14,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: "#e27f57",
                      }}
                    >
                      {grandTotal > 0 ? grandTotal.toFixed(1).replace(/\.0$/, "") + "h" : "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => alert("Telechargement PDF - fonctionnalite a venir")}
                style={{
                  background: "#fff",
                  color: "#1a1a1a",
                  border: "1px solid #ddd6c8",
                  borderRadius: 20,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Telecharger PDF
              </button>
              <button
                onClick={() => alert("Envoi de la feuille d'emargement - fonctionnalite a venir")}
                style={{
                  background: "#e27f57",
                  color: "#fff",
                  border: "none",
                  borderRadius: 20,
                  padding: "10px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(226,127,87,0.3)",
                }}
              >
                Envoyer la feuille
              </button>
            </div>

            {/* Legend */}
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 16,
                padding: "10px 14px",
                background: "#f6eedf",
                borderRadius: 10,
                fontSize: 12,
                color: "#666",
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "rgba(198,40,40,0.15)" }} />
                &gt;10h/jour ou &gt;43h/sem. (alerte)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: "rgba(226,127,87,0.15)" }} />
                Shift prevu, 0h pointees
              </span>
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}
