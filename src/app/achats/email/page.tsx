"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { T } from "@/lib/tokens";

const OSWALD = "var(--font-oswald), Oswald, sans-serif";

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

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "A valider", color: "#EA580C", bg: "rgba(234,88,12,0.08)" },
  imported: { label: "Importe", color: "#16A34A", bg: "rgba(22,163,74,0.08)" },
  rejected: { label: "Rejete", color: "#999", bg: "rgba(0,0,0,0.04)" },
  error: { label: "Erreur", color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
};

export default function EmailInvoicesPage() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <Content />
    </RequireRole>
  );
}

function Content() {
  const [invoices, setInvoices] = useState<EmailInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("email_invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setInvoices((data ?? []) as EmailInvoice[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/invoices/email-import");
      await load();
    } catch (e) {
      console.error(e);
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
      alert("Fournisseur non detecte — import impossible. Importez manuellement.");
      return;
    }
    // Download PDF from storage
    const { data: blob } = await supabase.storage.from("email-invoices").download(inv.storage_path);
    if (!blob) { alert("Erreur telechargement PDF"); return; }

    // Send to the supplier-specific import route
    const form = new FormData();
    form.append("file", blob, inv.filename);
    if (inv.detected_etab) form.append("etablissement", inv.detected_etab);

    try {
      const res = await fetch(`/api/invoices/${inv.detected_supplier}`, { method: "POST", body: form });
      const json = await res.json();
      if (json.ok || json.invoiceId) {
        await updateStatus(inv.id, "imported");
        if (json.invoiceId) {
          await supabase.from("email_invoices").update({ supplier_invoice_id: json.invoiceId }).eq("id", inv.id);
        }
      } else {
        alert(`Erreur import: ${json.error ?? "Erreur inconnue"}`);
      }
    } catch (e) {
      alert(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const pendingCount = invoices.filter(i => i.status === "pending").length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 24, fontWeight: 700, color: T.dark, margin: 0 }}>
            Factures par email
          </h1>
          <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0" }}>
            facture@bellomio.fr + facture@piccolamia.fr
          </p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          style={{
            padding: "8px 18px", borderRadius: 10, border: "none",
            background: T.terracotta, color: "#fff",
            fontSize: 13, fontWeight: 700, cursor: syncing ? "wait" : "pointer",
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? "Sync en cours..." : "Synchroniser"}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {[
          { key: "pending", label: `A valider (${pendingCount})` },
          { key: "imported", label: "Importees" },
          { key: "rejected", label: "Rejetees" },
          { key: "all", label: "Toutes" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            flex: 1, padding: "8px 0", border: "none",
            background: filter === f.key ? T.terracotta : "#fff",
            color: filter === f.key ? "#fff" : T.dark,
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            fontFamily: OSWALD, letterSpacing: "0.03em",
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: T.muted }}>Chargement...</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 13 }}>
          Aucune facture {filter === "pending" ? "en attente" : ""}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => {
            const st = STATUS_LABELS[inv.status] ?? STATUS_LABELS.pending;
            const date = inv.email_date
              ? new Date(inv.email_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
              : inv.created_at ? new Date(inv.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "";
            const isBeillo = inv.email_account?.includes("bellomio");

            return (
              <div key={inv.id} style={{
                background: "#fff", borderRadius: 14, border: `1.5px solid ${T.border}`,
                borderLeft: `4px solid ${isBeillo ? T.belloMio : T.piccolaMia}`,
                padding: "14px 16px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.dark }}>{inv.filename}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: st.bg, color: st.color,
                      }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                      {date} · {inv.email_from ?? ""}
                    </div>
                    {inv.email_subject && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inv.email_subject}
                      </div>
                    )}
                    {inv.detected_supplier_name && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.sauge, marginTop: 4 }}>
                        Fournisseur detecte : {inv.detected_supplier_name}
                      </div>
                    )}
                    {!inv.detected_supplier_name && inv.status === "pending" && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#EA580C", marginTop: 4 }}>
                        Fournisseur non reconnu
                      </div>
                    )}
                    {inv.error_message && (
                      <div style={{ fontSize: 10, color: "#DC2626", marginTop: 3 }}>{inv.error_message}</div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openPdf(inv)} style={{
                      padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                      background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", color: T.dark,
                    }}>Voir PDF</button>

                    {inv.status === "pending" && (
                      <>
                        <button onClick={() => importInvoice(inv)} disabled={!inv.detected_supplier} style={{
                          padding: "6px 12px", borderRadius: 8, border: "none",
                          background: inv.detected_supplier ? T.sauge : "#ccc",
                          fontSize: 11, fontWeight: 700, cursor: inv.detected_supplier ? "pointer" : "not-allowed",
                          color: "#fff",
                        }}>Importer</button>
                        <button onClick={() => updateStatus(inv.id, "rejected")} style={{
                          padding: "6px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                          background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#999",
                        }}>Rejeter</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
