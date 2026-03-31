"use client";

import { useRef, useState } from "react";

import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";

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

type ImportResult = {
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

const SUPPLIERS = [
  { slug: "mael", name: "Maël" },
  { slug: "metro", name: "Metro" },
  { slug: "masse", name: "Masse" },
  { slug: "cozigou", name: "Cozigou" },
  { slug: "vinoflo", name: "Vinoflo" },
  { slug: "carniato", name: "Carniato" },
  { slug: "barspirits", name: "Bar Spirits" },
  { slug: "sum", name: "Sum" },
  { slug: "armor", name: "Armor" },
  { slug: "lmdw", name: "LMDW" },
  { slug: "sdpf", name: "SDPF" },
  { slug: "elien", name: "Eric Elien" },
];

const ETABS = [
  { name: "Bello Mio", value: "bellomio" as const },
  { name: "Piccola Mia", value: "piccola" as const },
];

type Step = "select" | "preview" | "done";

export default function InvoicesPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { etablissements } = useEtablissement();

  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedEtab, setSelectedEtab] = useState<string>("bellomio");

  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null);

  function getAuthHeader(): string {
    const raw = localStorage.getItem(
      Object.keys(localStorage).find((k) => k.includes("auth-token")) ?? ""
    );
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
        if (token) return `Bearer ${token}`;
      } catch { /* */ }
    }
    return "";
  }

  function getEtabId(): string {
    return etablissements.find(e =>
      selectedEtab === "piccola" ? e.slug?.includes("piccola") : e.slug?.includes("bello")
    )?.id ?? "";
  }

  async function handleUpload(f: File) {
    if (!selectedSupplier) return;
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Seuls les fichiers PDF sont acceptes.");
      return;
    }
    setFile(f);
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const form = new FormData();
      form.append("file", f);
      form.append("mode", "preview");
      form.append("establishment", selectedEtab);
      const auth = getAuthHeader();
      const res = await fetchApi(`/api/invoices/${selectedSupplier}`, {
        method: "POST",
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          "x-etablissement-id": getEtabId(),
        },
        body: form,
      });
      const data: ImportResult = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setPreview(data);
      setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file || !selectedSupplier) return;
    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "commit");
      form.append("establishment", selectedEtab);
      const auth = getAuthHeader();
      const res = await fetchApi(`/api/invoices/${selectedSupplier}`, {
        method: "POST",
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          "x-etablissement-id": getEtabId(),
        },
        body: form,
      });
      const data: ImportResult = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erreur inconnue");
      setCommitResult(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("select");
    setFile(null);
    setSelectedSupplier(null);
    setSelectedEtab("bellomio");
    setPreview(null);
    setCommitResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const etabName = ETABS.find((e) => e.value === selectedEtab)?.name ?? selectedEtab;
  const supplierName = SUPPLIERS.find((s) => s.slug === selectedSupplier)?.name ?? selectedSupplier;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        <h1 style={h1Style}>Import factures</h1>

        {error && <div style={errorBox}>{error}</div>}

        {/* ════════════ STEP 1: Sélection fournisseur + étab + upload ════════════ */}
        {step === "select" && (
          <>
            {/* Etablissement */}
            <div style={{ marginBottom: 20 }}>
              <div style={sectionLabel}>Etablissement</div>
              <div style={{ display: "flex", gap: 8 }}>
                {ETABS.map((e) => (
                  <button key={e.value} type="button"
                    onClick={() => setSelectedEtab(e.value)}
                    style={pillBtn(selectedEtab === e.value)}>
                    {e.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Fournisseur */}
            <div style={{ marginBottom: 24 }}>
              <div style={sectionLabel}>Fournisseur</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SUPPLIERS.map((s) => (
                  <button key={s.slug} type="button"
                    onClick={() => setSelectedSupplier(s.slug)}
                    style={pillBtn(selectedSupplier === s.slug)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload zone */}
            <div
              style={{
                ...dropZone,
                opacity: selectedSupplier ? 1 : 0.4,
                pointerEvents: selectedSupplier ? "auto" : "none",
              }}
              onClick={() => selectedSupplier && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleUpload(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                style={{ display: "none" }}
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                {loading ? "Analyse en cours..." : selectedSupplier ? "Glisser un PDF ici ou cliquer" : "Selectionnez un fournisseur"}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                {selectedSupplier ? `${supplierName} → ${etabName}` : ""}
              </div>
            </div>
          </>
        )}

        {/* ════════════ STEP 2: Preview ════════════ */}
        {step === "preview" && preview?.parsed && (
          <>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>
                    {supplierName} → {etabName}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
                    Facture {preview.parsed.invoice_number ?? "—"} du {preview.parsed.invoice_date ?? "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13 }}>
                  {preview.parsed.total_ht != null && (
                    <div><strong>{preview.parsed.total_ht.toFixed(2)} € HT</strong></div>
                  )}
                  <div style={{ color: "#999" }}>{preview.parsed.lines.length} articles</div>
                </div>
              </div>

              {preview.invoice?.already_imported && (
                <div style={{ ...errorBox, background: "#FFF3E0", color: "#E65100", border: "1px solid #FFCC80" }}>
                  Cette facture a deja ete importee.
                </div>
              )}
            </div>

            {/* Lines table */}
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Ref</th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Article</th>
                    <th style={thStyle}>Qte</th>
                    <th style={thStyle}>Unite</th>
                    <th style={thStyle}>PU</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.parsed.lines.map((l, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{l.sku ?? "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "left", fontWeight: 500 }}>{l.name ?? "—"}</td>
                      <td style={tdStyle}>{l.quantity ?? "—"}</td>
                      <td style={tdStyle}>{l.unit ?? "—"}</td>
                      <td style={tdStyle}>{l.unit_price?.toFixed(2) ?? "—"}</td>
                      <td style={tdStyle}>{l.total_price?.toFixed(2) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button type="button" onClick={reset} style={cancelBtnStyle}>Annuler</button>
              <button type="button" onClick={handleCommit} disabled={loading}
                style={{ ...primaryBtnStyle, opacity: loading ? 0.5 : 1 }}>
                {loading ? "Import..." : "Importer"}
              </button>
            </div>
          </>
        )}

        {/* ════════════ STEP 3: Done ════════════ */}
        {step === "done" && commitResult && (
          <div style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              Import termine
            </h2>
            <p style={{ fontSize: 14, color: "#6f6a61", margin: 0 }}>
              {supplierName} → {etabName}
            </p>
            {commitResult.inserted && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 20, fontSize: 13 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#D4775A" }}>
                    {commitResult.inserted.ingredients_created ?? 0}
                  </div>
                  <div style={{ color: "#999" }}>ingredients crees</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#4a6741" }}>
                    {commitResult.inserted.offers_inserted ?? 0}
                  </div>
                  <div style={{ color: "#999" }}>offres mises a jour</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 24 }}>
              <button type="button" onClick={reset} style={primaryBtnStyle}>
                Importer une autre facture
              </button>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  );
}

/* ── Styles ── */

const pageStyle: React.CSSProperties = {
  maxWidth: 700,
  margin: "0 auto",
  padding: "16px 16px 60px",
};

const h1Style: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: 24,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  color: "#1a1a1a",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#999",
  marginBottom: 8,
};

const dropZone: React.CSSProperties = {
  border: "2px dashed #ddd6c8",
  borderRadius: 12,
  padding: "40px 20px",
  textAlign: "center",
  cursor: "pointer",
  background: "#faf8f4",
  transition: "border-color 0.2s, opacity 0.2s",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #ddd6c8",
  padding: "20px 22px",
};

const errorBox: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  background: "#fde8e8",
  color: "#c0392b",
  fontSize: 13,
  marginBottom: 12,
  border: "1px solid #f5c6c6",
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 8,
  border: active ? "2px solid #D4775A" : "1px solid #ddd6c8",
  background: active ? "rgba(212,119,90,0.08)" : "#fff",
  color: active ? "#D4775A" : "#374151",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
});

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 36,
  padding: "0 18px",
  borderRadius: 8,
  border: "none",
  background: "#D4775A",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  borderRadius: 10,
  overflow: "hidden",
  border: "1px solid #ddd6c8",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#999",
  borderBottom: "1px solid #ddd6c8",
  textAlign: "center",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #f0ebe3",
  textAlign: "center",
};
