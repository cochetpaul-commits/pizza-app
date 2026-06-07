"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";

type SyncLog = {
  id: string;
  date_service: string;
  status: "ok" | "empty" | "error";
  nb_lignes: number;
  nb_orders: number;
  duration_ms: number | null;
  error_msg: string | null;
  triggered_by: string;
  created_at: string;
};

const STATUS_COLORS: Record<SyncLog["status"], { bg: string; fg: string; label: string }> = {
  ok: { bg: "#E8F5E9", fg: "#2D6A4F", label: "OK" },
  empty: { bg: "#FFF4E0", fg: "#8B6F00", label: "Vide" },
  error: { bg: "#FEF2F2", fg: "#B91C1C", label: "Erreur" },
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function PopinaSyncContent() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [resyncDay, setResyncDay] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("popina_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((data as SyncLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleResync() {
    setResyncing(true);
    setResyncResult(null);
    try {
      const res = await fetch(`/api/cron/popina-sync?day=${resyncDay}&manual=1`);
      const data = await res.json();
      if (data?.results?.[0]) {
        const r = data.results[0];
        if (r.status === "ok") setResyncResult(`OK : ${r.nbLignes} lignes (${r.nbOrders} commandes)`);
        else if (r.status === "empty") setResyncResult(`Aucun report Popina pour ce jour`);
        else setResyncResult(`Erreur : ${r.error}`);
      } else {
        setResyncResult("Réponse inattendue");
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setResyncResult(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setResyncing(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 2,
          color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px",
        }}>ADMINISTRATION</p>
        <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>Synchronisation Popina</h1>
        <p style={{ fontSize: 13, color: "#666", margin: "8px 0 0" }}>
          Cron quotidien à 7h Paris — synchronise les ventes de la veille depuis l&apos;API Popina vers <code>ventes_lignes</code>.
        </p>
      </div>

      {/* Resync manuel */}
      <div style={{
        padding: 18, borderRadius: 12, border: "1px solid #ddd6c8",
        background: "#f9f6f0", marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: "0 0 12px" }}>Resynchroniser un jour</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={resyncDay}
            onChange={(e) => setResyncDay(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd",
              fontSize: 13, boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleResync}
            disabled={resyncing || !resyncDay}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#D4775A", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: resyncing ? "default" : "pointer", opacity: resyncing ? 0.6 : 1,
            }}
          >{resyncing ? "Sync…" : "Resync"}</button>
          {resyncResult && (
            <span style={{ fontSize: 13, color: resyncResult.startsWith("OK") ? "#2D6A4F" : "#B91C1C" }}>
              {resyncResult}
            </span>
          )}
        </div>
      </div>

      {/* Logs */}
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>50 derniers syncs</h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#666",
          }}
        >Rafraîchir</button>
      </div>

      {loading ? (
        <p style={{ color: "#999", fontSize: 13 }}>Chargement…</p>
      ) : logs.length === 0 ? (
        <p style={{ color: "#999", fontSize: 13 }}>Aucun sync encore enregistré.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd6c8", textAlign: "left" }}>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666" }}>Jour</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666" }}>Statut</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666", textAlign: "right" }}>Lignes</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666", textAlign: "right" }}>Commandes</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666", textAlign: "right" }}>Durée</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666" }}>Déclenché par</th>
              <th style={{ padding: "10px 8px", fontWeight: 600, color: "#666" }}>Exécuté le</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const c = STATUS_COLORS[log.status];
              return (
                <tr key={log.id} style={{ borderBottom: "1px solid #f0ebe2" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>{fmtDate(log.date_service)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 8,
                      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700,
                    }}>{c.label}</span>
                    {log.error_msg && (
                      <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4, maxWidth: 280 }}>{log.error_msg}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{log.nb_lignes.toLocaleString("fr-FR")}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>{log.nb_orders.toLocaleString("fr-FR")}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", color: "#999" }}>
                    {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td style={{ padding: "10px 8px", color: "#666" }}>{log.triggered_by}</td>
                  <td style={{ padding: "10px 8px", color: "#666" }}>{fmtDateTime(log.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

export default function PopinaSyncPage() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <PopinaSyncContent />
    </RequireRole>
  );
}
