"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";

type ImportRow = {
  id: string;
  created_at: string;
  email_from: string | null;
  email_subject: string | null;
  filename: string | null;
  fournisseur: string | null;
  invoice_number: string | null;
  nb_lignes: number;
  status: string;
  error_detail: string | null;
  gmail_message_id: string | null;
  invoice_id: string | null;
};

type InvoiceLine = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
};

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ok: { label: "Importée", bg: "#dcfce7", color: "#166534" },
  error: { label: "Erreur", bg: "#fee2e2", color: "#991b1b" },
  no_match: { label: "Non reconnu", bg: "#fef3c7", color: "#92400e" },
  duplicate: { label: "Doublon", bg: "#e0e7ff", color: "#3730a3" },
  skipped: { label: "Ignoré", bg: "#f3f4f6", color: "#6b7280" },
};

export default function FacturesAutoPage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("email_imports")
        .select("id,created_at,email_from,email_subject,filename,fournisseur,invoice_number,nb_lignes,status,error_detail,gmail_message_id,invoice_id")
        .order("created_at", { ascending: false })
        .limit(100);

      if (etab) {
        q = q.eq("etablissement_id", etab.id);
      }

      const { data } = await q;
      setImports(data ?? []);
      setLoading(false);
    })();
  }, [etab]);

  const filtered = filter === "all" ? imports : imports.filter((i) => i.status === filter);

  const counts = {
    all: imports.length,
    ok: imports.filter((i) => i.status === "ok").length,
    error: imports.filter((i) => i.status === "error").length,
    no_match: imports.filter((i) => i.status === "no_match").length,
  };

  async function handleRetry(row: ImportRow) {
    if (!row.gmail_message_id) return;
    setRetrying(row.id);
    try {
      const res = await fetch(`/api/gmail/webhook?messageId=${row.gmail_message_id}`);
      const data = await res.json();
      if (data.results?.[0]?.status === "ok" || data.results?.[0]?.results?.[0]?.status === "ok") {
        // Remove old entry, refresh
        setImports((prev) => prev.filter((i) => i.id !== row.id));
      }
      // Reload
      window.location.reload();
    } catch {
      alert("Erreur lors de la réimportation");
    } finally {
      setRetrying(null);
    }
  }

  async function toggleExpand(row: ImportRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      setLines([]);
      return;
    }
    if (!row.invoice_id) return;
    setExpandedId(row.id);
    setLinesLoading(true);
    const { data } = await supabase
      .from("supplier_invoice_lines")
      .select("id,name,sku,quantity,unit,unit_price,total_price")
      .eq("invoice_id", row.invoice_id)
      .order("name");
    setLines((data ?? []) as InvoiceLine[]);
    setLinesLoading(false);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "#999",
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 60px" }}>
        <button
          type="button"
          onClick={() => router.push("/achats")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginBottom: 6, display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#999" }}
        >
          ← Achats
        </button>

        <h1 style={{ margin: "0 0 16px", fontSize: 22, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a" }}>
          Import factures automatique
        </h1>

        {/* KPI row */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "Total", count: counts.all },
            { key: "ok", label: "Importées", count: counts.ok },
            { key: "error", label: "Erreurs", count: counts.error },
            { key: "no_match", label: "Non reconnus", count: counts.no_match },
          ].map((k) => (
            <button
              key={k.key}
              onClick={() => setFilter(k.key)}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                border: filter === k.key ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                background: filter === k.key ? "#D4775A" : "#fff",
                color: filter === k.key ? "#fff" : "#1a1a1a",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {k.label} ({k.count})
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#999", textAlign: "center", padding: 40 }}>Chargement…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
            <p style={{ fontSize: 14 }}>Aucune facture importée</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Les factures envoyées à gestionifratelligroup@gmail.com apparaîtront ici automatiquement.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((row) => {
              const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.skipped;
              const date = new Date(row.created_at);
              const dateStr = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

              const isExpanded = expandedId === row.id;
              const canExpand = row.status === "ok" && row.invoice_id;

              return (
                <div
                  key={row.id}
                  onClick={() => canExpand && toggleExpand(row)}
                  style={{
                    background: "#fff",
                    border: "1px solid #ddd6c8",
                    borderRadius: 12,
                    padding: "12px 16px",
                    borderLeft: `4px solid ${badge.color}`,
                    cursor: canExpand ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a", textTransform: "uppercase" }}>
                          {row.fournisseur ?? "Inconnu"}
                        </span>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 8,
                          background: badge.bg,
                          color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                        {canExpand && (
                          <span style={{ fontSize: 10, color: "#999" }}>{isExpanded ? "▲" : "▼"}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#6f6a61", marginBottom: 2 }}>
                        {row.filename ?? row.email_subject ?? "—"}
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#999" }}>
                        <span>{dateStr}</span>
                        {row.invoice_number && <span>N° {row.invoice_number}</span>}
                        {row.nb_lignes > 0 && <span>{row.nb_lignes} lignes</span>}
                      </div>
                      {row.error_detail && (
                        <div style={{ fontSize: 11, color: "#991b1b", marginTop: 4, fontStyle: "italic" }}>
                          {row.error_detail}
                        </div>
                      )}
                    </div>
                    {(row.status === "error" || row.status === "no_match") && row.gmail_message_id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetry(row); }}
                        disabled={retrying === row.id}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          border: "1px solid #ddd6c8",
                          background: "#fff",
                          cursor: "pointer",
                          fontSize: 12,
                          color: "#D4775A",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {retrying === row.id ? "…" : "Réimporter"}
                      </button>
                    )}
                  </div>

                  {/* Expanded: invoice lines detail */}
                  {isExpanded && (
                    <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                      {linesLoading ? (
                        <p style={{ fontSize: 12, color: "#999" }}>Chargement des lignes…</p>
                      ) : lines.length === 0 ? (
                        <p style={{ fontSize: 12, color: "#999" }}>Aucune ligne trouvee</p>
                      ) : (
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #eee", color: "#999", textAlign: "left" }}>
                              <th style={{ padding: "4px 6px", fontWeight: 600 }}>Ingredient</th>
                              <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>PU</th>
                              <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l) => (
                              <tr key={l.id} style={{ borderBottom: "1px solid #f5f0e8" }}>
                                <td style={{ padding: "4px 6px", color: "#1a1a1a" }}>
                                  {l.name}
                                  {l.sku && <span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>{l.sku}</span>}
                                </td>
                                <td style={{ padding: "4px 6px", textAlign: "right", color: "#666" }}>
                                  {l.unit_price?.toFixed(2)} €/{l.unit}
                                </td>
                                <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, color: "#1a1a1a" }}>
                                  {l.total_price?.toFixed(2)} €
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "1.5px solid #ddd6c8" }}>
                              <td style={{ padding: "6px 6px", fontWeight: 700, color: "#1a1a1a" }}>
                                Total ({lines.length} lignes)
                              </td>
                              <td />
                              <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 700, color: "#1a1a1a" }}>
                                {lines.reduce((s, l) => s + (l.total_price ?? 0), 0).toFixed(2)} €
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...labelStyle, marginTop: 24, textAlign: "center" }}>
          Source : gestionifratelligroup@gmail.com · Label « Factures Fournisseurs »
        </div>
      </div>
    </RequireRole>
  );
}
