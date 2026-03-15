"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { fetchApi } from "@/lib/fetchApi";

type InvoiceLine = {
  sku?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  tax_rate?: number | null;
  notes?: string | null;
};

type ParsedInvoice = {
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_ht?: number | null;
  total_ttc?: number | null;
  lines: InvoiceLine[];
};

type PreviewResult = {
  ok: boolean;
  error?: string;
  invoice?: { id: string; already_imported: boolean };
  parsed?: ParsedInvoice;
  inserted?: {
    supplier_id: string;
    ingredients_created?: number;
    offers_inserted?: number;
  };
};

export default function LmdwInvoicePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [commitResult, setCommitResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [establishment, setEstablishment] = useState<"bellomio" | "piccola" | "both">("both");

  async function getAuthHeader(): Promise<string> {
    const raw = localStorage.getItem(
      Object.keys(localStorage).find((k) => k.includes("auth-token")) ?? ""
    );
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
        if (token) return `Bearer ${token}`;
      } catch {}
    }
    return "";
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setCommitResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");
      form.append("establishment", establishment);

      const auth = await getAuthHeader();
      const res = await fetchApi("/api/invoices/lmdw", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
        body: form,
      });

      const data: PreviewResult = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setPreview(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setCommitResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "commit");
      form.append("establishment", establishment);

      const auth = await getAuthHeader();
      const res = await fetchApi("/api/invoices/lmdw", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
        body: form,
      });

      const data: PreviewResult = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setCommitResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const parsed = preview?.parsed;

  return (
    <>
    <NavBar backHref="/invoices" backLabel="Factures" right={<Link href="/ingredients" className="btn">Index ingredients</Link>} />
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        Import factures LMDW
      </h1>

      {/* Establishment selector */}
      <div style={{ margin: "1rem 0", padding: "1rem", background: "#f9f9f9", borderRadius: 8, border: "1px solid #ddd6c8" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#374151" }}>Cet import concerne :</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["bellomio", "piccola", "both"] as const).map((v) => (
            <button key={v} onClick={() => setEstablishment(v)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: establishment === v ? (v === "bellomio" ? "#D4775A" : v === "piccola" ? "#6B1B1B" : "#6B7280") : "#fff",
                color: establishment === v ? "#fff" : "#374151" }}>
              {v === "bellomio" ? "Bello Mio" : v === "piccola" ? "Piccola Mia" : "Les deux"}
            </button>
          ))}
        </div>
      </div>

      {/* Zone upload */}
      <div
        style={{
          border: "2px dashed #ccc",
          borderRadius: 8,
          padding: "2rem",
          textAlign: "center",
          cursor: "pointer",
          marginBottom: "1rem",
          background: file ? "#f0fdf4" : "#fafafa",
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setPreview(null);
            setCommitResult(null);
            setError(null);
          }}
        />
        {file ? (
          <p style={{ color: "#4a6741", fontWeight: 600 }}>
            {file.name}
          </p>
        ) : (
          <p style={{ color: "#666" }}>Cliquez pour selectionner un PDF de facture LMDW</p>
        )}
      </div>

      {/* Bouton preview */}
      {file && !preview && !commitResult && (
        <button
          onClick={handlePreview}
          disabled={loading}
          style={{
            background: "#D4775A",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "0.6rem 1.5rem",
            fontSize: "1rem",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Analyse en cours..." : "Analyser la facture"}
        </button>
      )}

      {/* Erreur */}
      {error && (
        <div style={{ background: "rgba(139,26,26,0.06)", border: "1px solid rgba(139,26,26,0.25)", borderRadius: 6, padding: "1rem", marginTop: "1rem", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Preview */}
      {preview && parsed && !commitResult && (
        <div style={{ marginTop: "1.5rem" }}>
          {preview.invoice?.already_imported && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, padding: "0.75rem", marginBottom: "1rem", color: "#854d0e" }}>
              Cette facture a deja ete importee (id: {preview.invoice.id})
            </div>
          )}

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
            <p><strong>Facture :</strong> {parsed.invoice_number ?? "\u2014"}</p>
            <p><strong>Date :</strong> {parsed.invoice_date ?? "\u2014"}</p>
            <p><strong>Total HT :</strong> {parsed.total_ht != null ? `${parsed.total_ht} \u20ac` : "\u2014"}</p>
            <p><strong>Total TTC :</strong> {parsed.total_ttc != null ? `${parsed.total_ttc} \u20ac` : "\u2014"}</p>
            <p><strong>Lignes :</strong> {parsed.lines.length}</p>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={th}>Code</th>
                <th style={th}>Nom</th>
                <th style={th}>Qte</th>
                <th style={th}>Vol</th>
                <th style={th}>PU HT</th>
                <th style={th}>Total HT</th>
                <th style={th}>TVA</th>
              </tr>
            </thead>
            <tbody>
              {parsed.lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={td}>{l.sku ?? "\u2014"}</td>
                  <td style={td}>{l.name ?? "\u2014"}</td>
                  <td style={td}>{l.quantity ?? "\u2014"}</td>
                  <td style={td}>{l.unit ?? "\u2014"}</td>
                  <td style={td}>{l.unit_price != null ? `${l.unit_price.toFixed(2)} \u20ac` : "\u2014"}</td>
                  <td style={td}>{l.total_price != null ? `${l.total_price.toFixed(2)} \u20ac` : "\u2014"}</td>
                  <td style={td}>{l.tax_rate != null ? `${l.tax_rate}%` : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={handleCommit}
              disabled={loading}
              style={{
                background: "#4a6741",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "0.6rem 1.5rem",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Import en cours..." : "Importer dans l'index"}
            </button>
            <button
              onClick={() => { setFile(null); setPreview(null); setError(null); }}
              style={{
                background: "transparent",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: "0.6rem 1.5rem",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Resultat commit */}
      {commitResult && (
        <div style={{ marginTop: "1.5rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "1.5rem" }}>
          <h2 style={{ color: "#4a6741", fontWeight: 700, marginBottom: "0.75rem" }}>Import termine</h2>
          <p><strong>Ingredients crees :</strong> {commitResult.inserted?.ingredients_created ?? 0}</p>
          <p><strong>Offres inserees :</strong> {commitResult.inserted?.offers_inserted ?? 0}</p>
          <button
            onClick={() => { setFile(null); setPreview(null); setCommitResult(null); setError(null); }}
            style={{
              marginTop: "1rem",
              background: "#D4775A",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "0.6rem 1.5rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Importer une autre facture
          </button>
        </div>
      )}
    </div>
    </>
  );
}

const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontWeight: 600,
  borderBottom: "2px solid #e2e8f0",
};

const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
};
