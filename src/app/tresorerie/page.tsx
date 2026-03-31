"use client";

import { useEffect, useState, useCallback, useRef, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import { NavBar } from "@/components/NavBar";

/* ── Types ── */
type BankOp = {
  id: string;
  operation_date: string;
  value_date: string | null;
  label: string;
  amount: number;
  category: string;
  bank_account: string | null;
  statement_month: string | null;
  source_file: string | null;
};

type Stats = {
  period: { from: string; to: string };
  totals: { credits: number; debits: number; balance: number };
  categories: { name: string; total: number; count: number }[];
  topExpenses: { label: string; amount: number; date: string }[];
  cbEncaissements: number;
  operations: BankOp[];
  availableMonths: string[];
};

/* ── Category display map ── */
const CAT_LABELS: Record<string, string> = {
  encaissement_cb: "Encaissements CB",
  commission_cb: "Commissions CB",
  virement_sortant: "Virements sortants",
  virement_entrant: "Virements entrants",
  prelevement: "Prélèvements",
  frais_bancaires: "Frais bancaires",
  autre: "Autre",
};

const CAT_COLORS: Record<string, string> = {
  encaissement_cb: "#4a6741",
  commission_cb: "#DC2626",
  virement_sortant: "#DC2626",
  virement_entrant: "#4a6741",
  prelevement: "#c4a882",
  frais_bancaires: "#999",
  autre: "#777",
};

const CAT_ORDER = [
  "encaissement_cb",
  "virement_entrant",
  "virement_sortant",
  "prelevement",
  "commission_cb",
  "frais_bancaires",
  "autre",
];

/* ── Helpers ── */
const fmt = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 15);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/* ── Styles ── */
const S = {
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "18px 20px",
    border: "1px solid #e0d8ce",
    marginBottom: 14,
  } as CSSProperties,
  sec: {
    fontSize: 9,
    textTransform: "uppercase" as const,
    letterSpacing: ".12em",
    color: "#777",
    fontWeight: 500,
    marginBottom: 12,
  } as CSSProperties,
  bigNum: {
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-.02em",
  } as CSSProperties,
  label: {
    fontFamily: "var(--font-dm), DM Sans, sans-serif",
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  } as CSSProperties,
  badge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 8,
    padding: "2px 8px",
    letterSpacing: ".02em",
  } as CSSProperties,
  filterPill: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 20,
    padding: "5px 14px",
    cursor: "pointer",
    border: "1px solid #ddd6c8",
    background: "#fff",
    color: "#1a1a1a",
    marginRight: 6,
    marginBottom: 6,
    transition: "all .15s",
  } as CSSProperties,
  filterPillActive: {
    background: "#1a1a1a",
    color: "#fff",
    borderColor: "#1a1a1a",
  } as CSSProperties,
};

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

function TresoreriePage() {
  const { current: etab } = useEtablissement();

  const [month, setMonth] = useState(getCurrentMonth());
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    try {
      const res = await fetchApi(`/api/tresorerie/stats?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("[tresorerie] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [etab, month]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Month navigation ── */
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  /* ── Import handler ── */
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetchApi("/api/tresorerie/import", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (res.ok) {
        setImportMsg(
          `${data.imported} opération(s) importée(s), ${data.skipped} ignorée(s) (doublons/erreurs)`
        );
        // Reload stats after import
        if (data.statement_month) setMonth(data.statement_month);
        setTimeout(() => load(), 500);
      } else {
        setImportMsg(`Erreur : ${data.error || "Import échoué"}`);
      }
    } catch (err) {
      setImportMsg("Erreur réseau lors de l'import");
      console.error(err);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ── Filtered operations ── */
  const filteredOps = (stats?.operations ?? []).filter((op) => {
    if (catFilter && op.category !== catFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!op.label.toLowerCase().includes(s) && !op.category.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  /* ── Active categories from data ── */
  const activeCats = CAT_ORDER.filter((c) =>
    stats?.categories.some((sc) => sc.name === c)
  );

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>
        {/* ── Page title ── */}
        <h1
          style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif",
            fontSize: 22,
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: 20,
          }}
        >
          Trésorerie
        </h1>

        {/* ── Month selector ── */}
        <div
          style={{
            ...S.card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={() => shiftMonth(-1)}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 12px",
              color: "#1a1a1a",
            }}
          >
            &#8249;
          </button>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontFamily: "var(--font-oswald), Oswald, sans-serif",
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a1a",
                textTransform: "capitalize",
              }}
            >
              {getMonthLabel(month)}
            </div>
            {stats && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{
                  fontSize: 11,
                  color: "#999",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  marginTop: 2,
                }}
              >
                {(stats.availableMonths.length > 0
                  ? stats.availableMonths
                  : [month]
                ).map((m) => (
                  <option key={m} value={m}>
                    {getMonthLabel(m)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={() => shiftMonth(1)}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 12px",
              color: "#1a1a1a",
            }}
          >
            &#8250;
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
            Chargement...
          </div>
        )}

        {!loading && stats && (
          <>
            {/* ── Hero: Totals ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ ...S.card, textAlign: "center" }}>
                <div style={S.sec}>Entrées</div>
                <div style={{ ...S.bigNum, color: "#4a6741" }}>
                  {fmt(stats.totals.credits)}
                </div>
              </div>
              <div style={{ ...S.card, textAlign: "center" }}>
                <div style={S.sec}>Sorties</div>
                <div style={{ ...S.bigNum, color: "#DC2626" }}>
                  {fmt(stats.totals.debits)}
                </div>
              </div>
              <div style={{ ...S.card, textAlign: "center" }}>
                <div style={S.sec}>Solde du mois</div>
                <div
                  style={{
                    ...S.bigNum,
                    color: stats.totals.balance >= 0 ? "#2563EB" : "#DC2626",
                  }}
                >
                  {fmt(stats.totals.balance)}
                </div>
              </div>
            </div>

            {/* ── Category breakdown ── */}
            <div style={S.sec}>Répartition par catégorie</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {activeCats.map((catKey) => {
                const cat = stats.categories.find((c) => c.name === catKey);
                if (!cat) return null;
                return (
                  <div key={catKey} style={S.card}>
                    <div
                      style={{
                        ...S.sec,
                        color: CAT_COLORS[catKey] ?? "#777",
                        marginBottom: 8,
                      }}
                    >
                      {CAT_LABELS[catKey] ?? catKey}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 22,
                        fontWeight: 700,
                        color: cat.total >= 0 ? "#4a6741" : "#DC2626",
                      }}
                    >
                      {fmt(cat.total)}
                    </div>
                    <div style={S.label}>{cat.count} opération(s)</div>
                  </div>
                );
              })}
            </div>

            {/* ── CB vs CA comparison ── */}
            {stats.cbEncaissements > 0 && (
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.sec}>Encaissements CB (banque)</div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#4a6741",
                  }}
                >
                  {fmt(stats.cbEncaissements)}
                </div>
                <div style={S.label}>
                  Total des paiements par carte enregistrés sur le relevé bancaire
                </div>
              </div>
            )}

            {/* ── Operations list ── */}
            <div style={S.sec}>Opérations</div>

            {/* Search + filter */}
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Rechercher une opération..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #ddd6c8",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "var(--font-dm), DM Sans, sans-serif",
                  outline: "none",
                  marginBottom: 10,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                <span
                  onClick={() => setCatFilter(null)}
                  style={{
                    ...S.filterPill,
                    ...(catFilter === null ? S.filterPillActive : {}),
                  }}
                >
                  Toutes
                </span>
                {activeCats.map((c) => (
                  <span
                    key={c}
                    onClick={() => setCatFilter(catFilter === c ? null : c)}
                    style={{
                      ...S.filterPill,
                      ...(catFilter === c ? S.filterPillActive : {}),
                    }}
                  >
                    {CAT_LABELS[c] ?? c}
                  </span>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  fontFamily: "var(--font-dm), DM Sans, sans-serif",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#faf8f5",
                      borderBottom: "1px solid #e0d8ce",
                    }}
                  >
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        color: "#999",
                        fontWeight: 500,
                      }}
                    >
                      Date
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        color: "#999",
                        fontWeight: 500,
                      }}
                    >
                      Libellé
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "10px 14px",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        color: "#999",
                        fontWeight: 500,
                      }}
                    >
                      Catégorie
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "10px 14px",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: ".08em",
                        color: "#999",
                        fontWeight: 500,
                      }}
                    >
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          textAlign: "center",
                          padding: 30,
                          color: "#999",
                          fontSize: 13,
                        }}
                      >
                        Aucune opération
                      </td>
                    </tr>
                  )}
                  {filteredOps.map((op) => (
                    <tr
                      key={op.id}
                      style={{
                        borderBottom: "1px solid #f0ece6",
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          whiteSpace: "nowrap",
                          color: "#555",
                          fontSize: 12,
                        }}
                      >
                        {fmtDate(op.operation_date)}
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          maxWidth: 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#1a1a1a",
                        }}
                        title={op.label}
                      >
                        {op.label}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span
                          style={{
                            ...S.badge,
                            color: CAT_COLORS[op.category] ?? "#777",
                            background:
                              (CAT_COLORS[op.category] ?? "#777") + "15",
                          }}
                        >
                          {CAT_LABELS[op.category] ?? op.category}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontFamily:
                            "var(--font-oswald), Oswald, sans-serif",
                          fontWeight: 600,
                          fontSize: 14,
                          color:
                            Number(op.amount) >= 0 ? "#4a6741" : "#DC2626",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {Number(op.amount) >= 0 ? "+" : ""}
                        {fmt(Number(op.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...S.label, textAlign: "right", marginBottom: 20 }}>
              {filteredOps.length} opération(s)
              {catFilter || search
                ? ` (filtrées sur ${stats.operations.length})`
                : ""}
            </div>

            {/* ── Top expenses ── */}
            {stats.topExpenses.length > 0 && (
              <>
                <div style={S.sec}>Top dépenses</div>
                <div style={S.card}>
                  {stats.topExpenses.map((exp, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom:
                          i < stats.topExpenses.length - 1
                            ? "1px solid #f0ece6"
                            : "none",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#1a1a1a",
                            maxWidth: 400,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={exp.label}
                        >
                          {exp.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#999" }}>
                          {fmtDate(exp.date)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily:
                            "var(--font-oswald), Oswald, sans-serif",
                          fontWeight: 600,
                          fontSize: 14,
                          color: "#DC2626",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmt(exp.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Import section ── */}
        <div style={S.sec}>Import relevé bancaire</div>
        <div style={S.card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                borderRadius: 20,
                background: "#1a1a1a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: importing ? "wait" : "pointer",
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? "Import en cours..." : "Importer un PDF"}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={handleImport}
                disabled={importing}
                style={{ display: "none" }}
              />
            </label>
            <span style={{ fontSize: 12, color: "#999" }}>
              Relevé Caisse d&apos;Epargne (PDF)
            </span>
          </div>
          {importMsg && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 8,
                background: importMsg.startsWith("Erreur")
                  ? "#DC262615"
                  : "#4a674115",
                color: importMsg.startsWith("Erreur") ? "#DC2626" : "#4a6741",
                fontSize: 13,
              }}
            >
              {importMsg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Export with role guard ── */
export default function TresoreirePageWrapper() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <TresoreriePage />
    </RequireRole>
  );
}
