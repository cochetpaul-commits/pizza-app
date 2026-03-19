"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ─────────────────────────────────────────────────────── */

type ContratPointage = {
  id: string;
  employe_id: string;
  emploi: string | null;
  actif: boolean;
};

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  actif: boolean;
  contrats: ContratPointage[] | null;
};

type Pointage = {
  id: string;
  employe_id: string;
  date: string;
  heure_arrivee: string | null;
  heure_depart: string | null;
  heure_arrivee_reelle: string | null;
  heure_depart_reelle: string | null;
  statut: string | null;
};

type Shift = {
  employe_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
};

type RowStatus = "traitee" | "en_attente" | "absent" | "absent_injustifie";

type EmployeRow = Employe & {
  pointage: Pointage | null;
  shift: Shift | null;
  status: RowStatus;
  reelArrivee: string;
  reelDepart: string;
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

const STATUS_COLORS: Record<RowStatus, { bg: string; fg: string }> = {
  traitee: { bg: "#e8ede6", fg: "#4a6741" },
  en_attente: { bg: "#FFF3E0", fg: "#E65100" },
  absent: { bg: "#fce4e4", fg: "#c0392b" },
  absent_injustifie: { bg: "#f3dede", fg: "#7b1a1a" },
};

const STATUS_LABELS: Record<RowStatus, string> = {
  traitee: "Traitee",
  en_attente: "En attente",
  absent: "Absent",
  absent_injustifie: "Absent injust.",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 6px",
  fontSize: 11,
  color: "#999",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 6px",
  fontSize: 13,
  verticalAlign: "middle",
};

const navBtnStyle: React.CSSProperties = {
  border: "1px solid #ddd6c8",
  borderRadius: 8,
  background: "#fff",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  color: "#1a1a1a",
  fontWeight: 600,
};

/* ── Helpers ───────────────────────────────────────────────────── */

function todayISO(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "-";
  return t.slice(0, 5);
}

function calcDurationMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h + "h" + (m > 0 ? String(m).padStart(2, "0") : "");
}

function getActiveRole(emp: Employe): string {
  if (!emp.contrats || emp.contrats.length === 0) return "";
  const active = emp.contrats.find((c) => c.actif);
  return active?.emploi ?? emp.contrats[0]?.emploi ?? "";
}

function getInitials(emp: Employe): string {
  if (emp.initiales) return emp.initiales;
  return (
    (emp.prenom?.[0] ?? "") + (emp.nom?.[0] ?? "")
  ).toUpperCase();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function PointagePage() {
  const { current: etab } = useEtablissement();
  const [rows, setRows] = useState<EmployeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [allEmployes, setAllEmployes] = useState<Employe[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [savingBulk, setSavingBulk] = useState(false);

  // Editable reel times: pointageId -> { arrivee, depart }
  const [reelEdits, setReelEdits] = useState<
    Record<string, { arrivee: string; depart: string }>
  >({});
  const [savingReel, setSavingReel] = useState<Record<string, boolean>>({});

  // Modal state
  const [modalEmployeId, setModalEmployeId] = useState("");
  const [modalArrivee, setModalArrivee] = useState("");
  const [modalDepart, setModalDepart] = useState("");
  const [saving, setSaving] = useState(false);

  const buildRows = useCallback(
    (
      employes: Employe[],
      pointages: Pointage[],
      shifts: Shift[]
    ): EmployeRow[] => {
      const pointageMap = new Map<string, Pointage>();
      for (const p of pointages) pointageMap.set(p.employe_id, p);

      const shiftMap = new Map<string, Shift>();
      for (const s of shifts) shiftMap.set(s.employe_id, s);

      const combined: EmployeRow[] = employes.map((e) => {
        const p = pointageMap.get(e.id) ?? null;
        const s = shiftMap.get(e.id) ?? null;

        let status: RowStatus = "absent";
        if (p) {
          if (p.statut === "traitee" || p.statut === "validee") {
            status = "traitee";
          } else if (p.heure_arrivee) {
            status = "en_attente";
          }
        } else if (s) {
          // Has a scheduled shift but no pointage => absent
          status = "absent";
        }
        // If neither shift nor pointage, they were not scheduled

        return {
          ...e,
          pointage: p,
          shift: s,
          status,
          reelArrivee: p?.heure_arrivee_reelle
            ? p.heure_arrivee_reelle.slice(0, 5)
            : "",
          reelDepart: p?.heure_depart_reelle
            ? p.heure_depart_reelle.slice(0, 5)
            : "",
        };
      });

      // Sort: en_attente first, then absent, then traitee
      const order: Record<RowStatus, number> = {
        en_attente: 0,
        absent: 1,
        absent_injustifie: 2,
        traitee: 3,
      };
      combined.sort((a, b) => order[a.status] - order[b.status]);

      return combined;
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    setTableError(false);

    const [empRes, contratRes] = await Promise.all([
      supabase
        .from("employes")
        .select("*")
        .eq("etablissement_id", etab.id)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("contrats")
        .select("id, employe_id, emploi, actif")
        .eq("actif", true),
    ]);

    const contratsData = (contratRes.data ?? []) as ContratPointage[];
    const employes: Employe[] = (empRes.data ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      contrats: contratsData.filter((c) => c.employe_id === e.id),
    })) as Employe[];
    setAllEmployes(employes);

    // Fetch pointages
    const { data: pointages, error: pErr } = await supabase
      .from("pointages")
      .select(
        "id, employe_id, date, heure_arrivee, heure_depart, heure_arrivee_reelle, heure_depart_reelle, statut"
      )
      .eq("etablissement_id", etab.id)
      .eq("date", selectedDate);

    if (pErr) {
      setTableError(true);
    }

    // Fetch shifts for the selected date
    const { data: shiftsData } = await supabase
      .from("shifts")
      .select("employe_id, date, heure_debut, heure_fin")
      .eq("etablissement_id", etab.id)
      .eq("date", selectedDate);

    const combined = buildRows(
      employes,
      pErr ? [] : ((pointages as Pointage[]) ?? []),
      (shiftsData as Shift[]) ?? []
    );
    setRows(combined);
    setReelEdits({});
    setLoading(false);
  }, [etab, selectedDate, buildRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadData();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadData]);

  /* ── Handlers ───────────────────────────────────────────────── */

  const handleSave = async () => {
    if (!modalEmployeId || !modalArrivee || !etab) return;
    setSaving(true);

    const { error } = await supabase.from("pointages").insert({
      employe_id: modalEmployeId,
      etablissement_id: etab.id,
      date: selectedDate,
      heure_arrivee: modalArrivee + ":00",
      heure_depart: modalDepart ? modalDepart + ":00" : null,
    });

    setSaving(false);
    if (!error) {
      setShowModal(false);
      setModalEmployeId("");
      setModalArrivee("");
      setModalDepart("");
      loadData();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  const handleReelChange = (
    pointageId: string,
    field: "arrivee" | "depart",
    value: string
  ) => {
    setReelEdits((prev) => ({
      ...prev,
      [pointageId]: {
        arrivee: prev[pointageId]?.arrivee ?? "",
        depart: prev[pointageId]?.depart ?? "",
        [field]: value,
      },
    }));
  };

  const handleSaveReel = async (row: EmployeRow) => {
    if (!row.pointage) return;
    const edits = reelEdits[row.pointage.id];
    if (!edits) return;

    setSavingReel((prev) => ({ ...prev, [row.pointage!.id]: true }));

    const update: Record<string, string | null> = {};
    if (edits.arrivee) update.heure_arrivee_reelle = edits.arrivee + ":00";
    if (edits.depart) update.heure_depart_reelle = edits.depart + ":00";

    if (Object.keys(update).length === 0) {
      setSavingReel((prev) => ({ ...prev, [row.pointage!.id]: false }));
      return;
    }

    const { error } = await supabase
      .from("pointages")
      .update(update)
      .eq("id", row.pointage.id);

    setSavingReel((prev) => ({ ...prev, [row.pointage!.id]: false }));
    if (error) {
      alert("Erreur : " + error.message);
    } else {
      loadData();
    }
  };

  const handleBulkValidate = async () => {
    const pendingIds = rows
      .filter((r) => r.status === "en_attente" && r.pointage)
      .map((r) => r.pointage!.id);

    if (pendingIds.length === 0) return;
    setSavingBulk(true);

    const { error } = await supabase
      .from("pointages")
      .update({ statut: "traitee" })
      .in("id", pendingIds);

    setSavingBulk(false);
    if (error) {
      alert("Erreur : " + error.message);
    } else {
      loadData();
    }
  };

  /* ── Derived values ─────────────────────────────────────────── */

  const presentCount = rows.filter(
    (r) => r.status === "traitee" || r.status === "en_attente"
  ).length;
  const absentCount = rows.filter(
    (r) => r.status === "absent" || r.status === "absent_injustifie"
  ).length;
  const pendingCount = rows.filter((r) => r.status === "en_attente").length;

  const isToday = selectedDate === todayISO();

  const prevDay = () => setSelectedDate((d) => addDaysISO(d, -1));
  const nextDay = () => setSelectedDate((d) => addDaysISO(d, 1));
  const goToday = () => setSelectedDate(todayISO());

  // Filter only employees not already in today's pointages for the modal
  const availableForModal = useMemo(() => {
    const existingIds = new Set(
      rows.filter((r) => r.pointage).map((r) => r.id)
    );
    return allEmployes.filter((e) => !existingIds.has(e.id));
  }, [allEmployes, rows]);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={h1Style}>Pointage</h1>

        {/* Date navigator */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f6eedf",
            borderRadius: 12,
            padding: "10px 16px",
            marginBottom: 12,
          }}
        >
          <button onClick={prevDay} style={navBtnStyle}>
            &larr;
          </button>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#1a1a1a",
                textTransform: "capitalize",
              }}
            >
              {formatDate(selectedDate)}
            </div>
            {!isToday && (
              <button
                onClick={goToday}
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
                Aujourd&apos;hui
              </button>
            )}
          </div>
          <button onClick={nextDay} style={navBtnStyle}>
            &rarr;
          </button>
        </div>

        {/* Summary bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            marginBottom: 16,
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
            <span>
              <strong style={{ color: "#4a6741" }}>{presentCount}</strong>{" "}
              <span style={{ color: "#999" }}>present{presentCount > 1 ? "s" : ""}</span>
            </span>
            <span>
              <strong style={{ color: "#c0392b" }}>{absentCount}</strong>{" "}
              <span style={{ color: "#999" }}>absent{absentCount > 1 ? "s" : ""}</span>
            </span>
            <span>
              <strong style={{ color: "#E65100" }}>{pendingCount}</strong>{" "}
              <span style={{ color: "#999" }}>en attente</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {pendingCount > 0 && (
              <button
                onClick={handleBulkValidate}
                disabled={savingBulk}
                style={{
                  background: "#4a6741",
                  color: "#fff",
                  border: "none",
                  borderRadius: 20,
                  padding: "7px 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity: savingBulk ? 0.7 : 1,
                }}
              >
                {savingBulk
                  ? "Validation..."
                  : "Traiter la journee (" + pendingCount + ")"}
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              style={{
                background: "#e27f57",
                color: "#fff",
                border: "none",
                borderRadius: 20,
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Ajouter
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <p
            style={{
              color: "#999",
              fontSize: 13,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            Chargement...
          </p>
        ) : !etab ? (
          <p
            style={{
              color: "#999",
              fontSize: 13,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            Selectionnez un etablissement
          </p>
        ) : rows.length === 0 ? (
          <p
            style={{
              color: "#999",
              fontSize: 13,
              textAlign: "center",
              marginTop: 40,
            }}
          >
            Aucun employe actif
          </p>
        ) : (
          <>
          {tableError && (
            <div style={{ background: "#FFF3E0", border: "1px solid #FFB74D", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#E65100" }}>
              Table &quot;pointages&quot; non configuree — les donnees de badgeage ne sont pas disponibles.
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                  <th style={{ ...thStyle, textAlign: "left" }}>Employe</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Planning</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Badge</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Reel</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Duree</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sc = STATUS_COLORS[r.status];
                  const initials = getInitials(r);
                  const role = getActiveRole(r);

                  // Determine times for duration calculation
                  const reelA =
                    reelEdits[r.pointage?.id ?? ""]?.arrivee ||
                    r.reelArrivee ||
                    null;
                  const reelD =
                    reelEdits[r.pointage?.id ?? ""]?.depart ||
                    r.reelDepart ||
                    null;
                  const durStart = reelA || formatTime(r.pointage?.heure_arrivee);
                  const durEnd = reelD || formatTime(r.pointage?.heure_depart);
                  const dur = calcDurationMinutes(
                    durStart === "-" ? null : durStart,
                    durEnd === "-" ? null : durEnd
                  );

                  const hasEdits =
                    r.pointage &&
                    reelEdits[r.pointage.id] &&
                    (reelEdits[r.pointage.id].arrivee ||
                      reelEdits[r.pointage.id].depart);

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid #ddd6c8",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f5f0e8")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* Employe with avatar + role */}
                      <td style={{ ...tdStyle, display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "#ddd6c8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#1a1a1a",
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>
                            {r.prenom} {r.nom}
                          </div>
                          {role && (
                            <div style={{ fontSize: 11, color: "#999" }}>
                              {role}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Planning (from shifts) */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 12,
                          color: r.shift ? "#1a1a1a" : "#ccc",
                        }}
                      >
                        {r.shift
                          ? formatTime(r.shift.heure_debut) +
                            " - " +
                            formatTime(r.shift.heure_fin)
                          : "-"}
                      </td>

                      {/* Badge (heure_arrivee / heure_depart from pointages) */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 12,
                        }}
                      >
                        {r.pointage
                          ? formatTime(r.pointage.heure_arrivee) +
                            " - " +
                            formatTime(r.pointage.heure_depart)
                          : "-"}
                      </td>

                      {/* Reel (editable) */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {r.pointage ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 4,
                            }}
                          >
                            <input
                              type="time"
                              value={
                                reelEdits[r.pointage.id]?.arrivee ??
                                r.reelArrivee
                              }
                              onChange={(e) =>
                                handleReelChange(
                                  r.pointage!.id,
                                  "arrivee",
                                  e.target.value
                                )
                              }
                              style={{
                                width: 70,
                                padding: "3px 4px",
                                border: "1px solid #ddd6c8",
                                borderRadius: 6,
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                            <span style={{ color: "#999", fontSize: 11 }}>-</span>
                            <input
                              type="time"
                              value={
                                reelEdits[r.pointage.id]?.depart ??
                                r.reelDepart
                              }
                              onChange={(e) =>
                                handleReelChange(
                                  r.pointage!.id,
                                  "depart",
                                  e.target.value
                                )
                              }
                              style={{
                                width: 70,
                                padding: "3px 4px",
                                border: "1px solid #ddd6c8",
                                borderRadius: 6,
                                fontSize: 12,
                                textAlign: "center",
                              }}
                            />
                            {hasEdits && (
                              <button
                                onClick={() => handleSaveReel(r)}
                                disabled={
                                  savingReel[r.pointage!.id] ?? false
                                }
                                style={{
                                  border: "none",
                                  background: "#e27f57",
                                  color: "#fff",
                                  borderRadius: 6,
                                  padding: "3px 8px",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  opacity: savingReel[r.pointage!.id]
                                    ? 0.6
                                    : 1,
                                }}
                              >
                                OK
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#ccc" }}>-</span>
                        )}
                      </td>

                      {/* Duree */}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {formatDuration(dur)}
                      </td>

                      {/* Statut */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 8,
                            fontSize: 11,
                            fontWeight: 600,
                            background: sc.bg,
                            color: sc.fg,
                          }}
                        >
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Modal */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowModal(false)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 28,
                width: "90%",
                maxWidth: 420,
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                style={{
                  fontFamily: "var(--font-oswald), Oswald, sans-serif",
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 20,
                  color: "#1a1a1a",
                }}
              >
                Ajouter un pointage
              </h2>

              {/* Employee selector */}
              <label style={{ display: "block", marginBottom: 14 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1a1a1a",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Employe
                </span>
                <select
                  value={modalEmployeId}
                  onChange={(e) => setModalEmployeId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                    background: "#fff",
                  }}
                >
                  <option value="">Choisir...</option>
                  {availableForModal.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.prenom} {e.nom}
                    </option>
                  ))}
                </select>
              </label>

              {/* Arrival time */}
              <label style={{ display: "block", marginBottom: 14 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1a1a1a",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Heure d&apos;arrivee
                </span>
                <input
                  type="time"
                  value={modalArrivee}
                  onChange={(e) => setModalArrivee(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </label>

              {/* Departure time */}
              <label style={{ display: "block", marginBottom: 20 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1a1a1a",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Heure de depart (optionnel)
                </span>
                <input
                  type="time"
                  value={modalDepart}
                  onChange={(e) => setModalDepart(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
              </label>

              {/* Buttons */}
              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "8px 18px",
                    border: "1px solid #ddd6c8",
                    borderRadius: 20,
                    background: "#fff",
                    fontSize: 13,
                    cursor: "pointer",
                    color: "#1a1a1a",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={!modalEmployeId || !modalArrivee || saving}
                  style={{
                    padding: "8px 18px",
                    border: "none",
                    borderRadius: 20,
                    background:
                      !modalEmployeId || !modalArrivee ? "#ccc" : "#e27f57",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      !modalEmployeId || !modalArrivee ? "default" : "pointer",
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
