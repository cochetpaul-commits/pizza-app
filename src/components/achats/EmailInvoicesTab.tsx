"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { T } from "@/lib/tokens";

type EmailInvoice = {
  id: string;
  email_account: string;
  email_subject: string | null;
  email_from: string | null;
  email_date: string | null;
  filename: string;
  storage_path: string | null;
  detected_supplier: string | null;
  detected_supplier_name: string | null;
  detected_etab: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

const ST: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "A valider", color: "#EA580C", bg: "rgba(234,88,12,0.08)" },
  imported: { label: "Importe", color: "#16A34A", bg: "rgba(22,163,74,0.08)" },
  rejected: { label: "Rejete", color: "#999", bg: "rgba(0,0,0,0.04)" },
  error: { label: "Erreur", color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
};

export function EmailInvoicesTab() {
  const [invoices, setInvoices] = useState<EmailInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("email_invoices").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setInvoices((data ?? []) as EmailInvoice[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/invoices/email-import");
      const json = await res.json();
      if (json.errors && json.errors.length > 0) {
        setSyncResult(`Erreurs: ${json.errors.join(" | ")}`);
      } else {
        setSyncResult(`${json.processed ?? 0} facture(s) trouvee(s)`);
      }
      await load();
    } catch (e) {
      setSyncResult(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncing(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("email_invoices").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
  };

  const openPdf = async (inv: EmailInvoice) => {
    if (!inv.storage_path) return;
    const { data } = await supabase.storage.from("email-invoices").createSignedUrl(inv.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const importInvoice = async (inv: EmailInvoice) => {
    if (!inv.storage_path || !inv.detected_supplier) {
      alert("Fournisseur non detecte — importez manuellement.");
      return;
    }
    const { data: blob } = await supabase.storage.from("email-invoices").download(inv.storage_path);
    if (!blob) { alert("Erreur telechargement PDF"); return; }
    const form = new FormData();
    form.append("file", blob, inv.filename);
    if (inv.detected_etab) form.append("etablissement", inv.detected_etab);
    try {
      const res = await fetch(`/api/invoices/${inv.detected_supplier}`, { method: "POST", body: form });
      const json = await res.json();
      if (json.ok || json.invoiceId) {
        await updateStatus(inv.id, "imported");
        if (json.invoiceId) await supabase.from("email_invoices").update({ supplier_invoice_id: json.invoiceId }).eq("id", inv.id);
      } else {
        alert(`Erreur import: ${json.error ?? "Erreur inconnue"}`);
      }
    } catch (e) { alert(`Erreur: ${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>facture@bellomio.fr + facture@piccolamia.fr</p>
        <button onClick={triggerSync} disabled={syncing} style={{
          padding: "7px 16px", borderRadius: 8, border: "none",
          background: T.terracotta, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1,
        }}>
          {syncing ? "Sync..." : "Synchroniser"}
        </button>
      </div>

      {syncResult && (
        <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontSize: 11, fontWeight: 600, background: syncResult.startsWith("Erreur") ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.08)", color: syncResult.startsWith("Erreur") ? "#DC2626" : "#16A34A" }}>
          {syncResult}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, marginBottom: 14, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {[
          { key: "pending", label: "A valider" },
          { key: "imported", label: "Importees" },
          { key: "rejected", label: "Rejetees" },
          { key: "all", label: "Toutes" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            flex: 1, padding: "7px 0", border: "none",
            background: filter === f.key ? T.terracotta : "#fff",
            color: filter === f.key ? "#fff" : "#777",
            fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: T.muted, fontSize: 12 }}>Chargement...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: T.muted, fontSize: 12 }}>Aucune facture</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => {
            const st = ST[inv.status] ?? ST.pending;
            const date = inv.email_date ? new Date(inv.email_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
            const isBM = inv.email_account?.includes("bellomio");
            return (
              <div key={inv.id} style={{
                background: "#fff", borderRadius: 12, border: `1.5px solid ${T.border}`,
                borderLeft: `3px solid ${isBM ? T.belloMio : T.piccolaMia}`,
                padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.dark, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.filename}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                </div>
                <div style={{ fontSize: 10, color: T.muted }}>{date} · {inv.email_from ?? ""}</div>
                {inv.detected_supplier_name && <div style={{ fontSize: 11, fontWeight: 600, color: T.sauge, marginTop: 3 }}>{inv.detected_supplier_name}</div>}
                {!inv.detected_supplier_name && inv.status === "pending" && <div style={{ fontSize: 10, color: "#EA580C", marginTop: 3 }}>Non reconnu</div>}
                {inv.error_message && <div style={{ fontSize: 9, color: "#DC2626", marginTop: 2 }}>{inv.error_message}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={() => openPdf(inv)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", color: T.dark }}>PDF</button>
                  {inv.status === "pending" && <>
                    <button onClick={() => importInvoice(inv)} disabled={!inv.detected_supplier} style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: inv.detected_supplier ? T.sauge : "#ccc", fontSize: 10, fontWeight: 700, cursor: inv.detected_supplier ? "pointer" : "not-allowed", color: "#fff" }}>Importer</button>
                    <button onClick={() => updateStatus(inv.id, "rejected")} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer", color: "#999" }}>Rejeter</button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
