"use client";

import { useRef, useState } from "react";

import { fetchApi } from "@/lib/fetchApi";
import type { KeziaDaily } from "@/lib/kezia/keziaParser";

type Result = {
  ok: boolean;
  error?: string;
  parsed?: KeziaDaily;
  mode?: string;
  updated?: boolean;
  date?: string;
};

function fmtEur(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + " %";
}

export default function KeziaImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<KeziaDaily | null>(null);
  const [commitDone, setCommitDone] = useState<{ date: string; updated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true); setError(null); setPreview(null); setCommitDone(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");
      const auth = await getAuthHeader();
      const res = await fetchApi("/api/kezia", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
        body: form,
      });
      const data: Result = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setPreview(data.parsed ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "commit");
      const auth = await getAuthHeader();
      const res = await fetchApi("/api/kezia", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
        body: form,
      });
      const data: Result = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setCommitDone({ date: data.date ?? "", updated: data.updated ?? false });
      setPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const p = preview;

  return (
    <>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Import Kezia
        </h1>
        <p style={{ color: "#999", fontSize: 13, marginBottom: "1.5rem" }}>
          Importe la synthese journaliere Kezia (PDF) pour enregistrer le CA du jour.
        </p>

        {/* Upload zone */}
        <div
          style={{
            border: "2px dashed #ccc", borderRadius: 8, padding: "2rem",
            textAlign: "center", cursor: "pointer", marginBottom: "1rem",
            background: file ? "#f0fdf4" : "#fafafa",
          }}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef} type="file" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f); setPreview(null); setCommitDone(null); setError(null);
            }}
          />
          {file ? (
            <p style={{ color: "#4a6741", fontWeight: 600 }}>{file.name}</p>
          ) : (
            <p style={{ color: "#666" }}>Cliquez pour selectionner un PDF Kezia</p>
          )}
        </div>

        {/* Analyze button */}
        {file && !preview && !commitDone && (
          <button onClick={handlePreview} disabled={loading} style={{
            background: "#b8a800", color: "white", border: "none", borderRadius: 6,
            padding: "0.6rem 1.5rem", fontSize: "1rem",
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Analyse en cours..." : "Analyser la synthese"}
          </button>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(139,26,26,0.06)", border: "1px solid rgba(139,26,26,0.25)", borderRadius: 6, padding: "1rem", marginTop: "1rem", color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Preview */}
        {p && !commitDone && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
              <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Synthese du {p.date_raw}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 14 }}>
                <div><strong>CA TTC :</strong> {fmtEur(p.ca_ttc)}</div>
                <div><strong>CA HT :</strong> {fmtEur(p.ca_ht)}</div>
                <div><strong>TVA :</strong> {fmtEur(p.tva_total)}</div>
                <div><strong>Tickets :</strong> {p.tickets}</div>
                <div><strong>Panier moyen :</strong> {fmtEur(p.panier_moyen)}</div>
                <div><strong>Couverts :</strong> {p.couverts}</div>
                <div><strong>Marge :</strong> {fmtEur(p.marge_total)}</div>
                <div><strong>Taux de marque :</strong> {fmtPct(p.taux_marque)}</div>
              </div>
            </div>

            {/* Paiements */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#666" }}>Paiements</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: 14 }}>
                <div>Especes : {fmtEur(p.especes)}</div>
                <div>Cartes : {fmtEur(p.cartes)}</div>
                <div>Cheques : {fmtEur(p.cheques)}</div>
                <div>Virements : {fmtEur(p.virements)}</div>
              </div>
            </div>

            {/* Rayons */}
            {p.rayons.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9" }}>
                    <th style={th}>Rayon</th>
                    <th style={th}>CA HT</th>
                    <th style={th}>CA TTC</th>
                    <th style={th}>Marge</th>
                    <th style={th}>Marge %</th>
                    <th style={th}>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {p.rayons.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={td}>{r.name}</td>
                      <td style={td}>{fmtEur(r.ca_ht)}</td>
                      <td style={td}>{fmtEur(r.ca_ttc)}</td>
                      <td style={td}>{fmtEur(r.marge)}</td>
                      <td style={td}>{(r.marge_pct).toFixed(1)} %</td>
                      <td style={td}>{(r.repart_pct).toFixed(1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: "flex", gap: "1rem" }}>
              <button onClick={handleCommit} disabled={loading} style={{
                background: "#4a6741", color: "white", border: "none", borderRadius: 6,
                padding: "0.6rem 1.5rem", fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              }}>
                {loading ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button onClick={() => { setFile(null); setPreview(null); setError(null); }} style={{
                background: "transparent", border: "1px solid #ccc", borderRadius: 6,
                padding: "0.6rem 1.5rem", fontSize: "1rem", cursor: "pointer",
              }}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Commit result */}
        {commitDone && (
          <div style={{ marginTop: "1.5rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "1.5rem" }}>
            <h2 style={{ color: "#4a6741", fontWeight: 700, marginBottom: "0.5rem" }}>
              {commitDone.updated ? "Synthese mise a jour" : "Synthese enregistree"}
            </h2>
            <p>Date : <strong>{commitDone.date}</strong></p>
            <button
              onClick={() => { setFile(null); setPreview(null); setCommitDone(null); setError(null); }}
              style={{
                marginTop: "1rem", background: "#b8a800", color: "white", border: "none",
                borderRadius: 6, padding: "0.6rem 1.5rem", fontSize: "1rem", cursor: "pointer",
              }}
            >
              Importer une autre synthese
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600,
  borderBottom: "2px solid #e2e8f0",
};

const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
};
