"use client";

import { useRef, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";

type DetectionResult = {
  supplier: { slug: string; name: string; matchedKeyword: string } | null;
  etablissement: { slug: string; name: string; matchedKeyword: string } | null;
};

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
];

const ETABS = [
  { slug: "bello_mio", name: "Bello Mio", value: "bellomio" as const },
  { slug: "piccola_mia", name: "Piccola Mia", value: "piccola" as const },
];

type Step = "upload" | "confirm" | "preview" | "done";

export default function InvoicesPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { current: etab, etablissements } = useEtablissement();
  const gestionHref = etab?.slug === "piccola_mia" ? "/piccola-mia/gestion" : "/bello-mio/gestion";

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detection
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedEtab, setSelectedEtab] = useState<string>("bellomio");

  // Import results
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

  async function handleFileUpload(f: File) {
    setFile(f);
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", f);
      console.log("[invoices] calling detect API...");
      const res = await fetchApi("/api/invoices/detect", { method: "POST", body: form });
      console.log("[invoices] response status:", res.status);
      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur ${res.status}`;
        try { const j = JSON.parse(text); msg = j.error ?? msg; } catch { /* not JSON */ }
        throw new Error(msg);
      }
      const data = await res.json();
      console.log("[invoices] detection result:", data);
      setDetection(data.detection);
      setSelectedSupplier(data.detection?.supplier?.slug ?? null);
      if (data.detection?.etablissement?.slug === "bello_mio") setSelectedEtab("bellomio");
      else if (data.detection?.etablissement?.slug === "piccola_mia") setSelectedEtab("piccola");
      setStep("confirm");
    } catch (e: unknown) {
      console.error("[invoices] upload error:", e, "type:", typeof e);
      if (e instanceof Error) console.error("[invoices] stack:", e.stack);
      setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!file || !selectedSupplier) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");
      form.append("establishment", selectedEtab);
      const auth = getAuthHeader();
      const res = await fetchApi(`/api/invoices/${selectedSupplier}`, {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
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
        headers: auth ? { Authorization: auth } : {},
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
    setStep("upload");
    setFile(null);
    setDetection(null);
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
      <NavBar backHref={gestionHref} backLabel="Gestion" />
      <div style={pageStyle}>
        <h1 style={h1Style}>Import factures</h1>

        {error && (
          <div style={errorBox}>{error}</div>
        )}

        {/* ════════════ STEP 1: Upload ════════════ */}
        {step === "upload" && (
          <>
            <div
              style={dropZone(!!file)}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFileUpload(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
                    setError("Seuls les fichiers PDF sont acceptes.");
                    return;
                  }
                  handleFileUpload(f);
                }}
              />
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                {loading ? "Analyse en cours..." : "Glisser une facture PDF ici"}
              </div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                ou cliquer pour parcourir
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#999", textAlign: "center", marginTop: 12 }}>
              Le fournisseur et l&apos;etablissement seront detectes automatiquement.
            </p>

            {/* Quick links to legacy pages */}
            <div style={{ marginTop: 32, borderTop: "1px solid #f0ebe3", paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Import par fournisseur
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SUPPLIERS.map((s) => {
                  const available = etablissements.length > 0;
                  return (
                    <a key={s.slug} href={`/invoices/${s.slug}`}
                      style={{ ...pillBtnBase, opacity: available ? 1 : 0.5, textDecoration: "none" }}>
                      {s.name}
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ════════════ STEP 2: Confirmation ════════════ */}
        {step === "confirm" && detection && (
          <div style={confirmCard}>
            {/* Etablissement */}
            <div style={confirmSection}>
              {detection.etablissement ? (
                <div style={confirmRow}>
                  <span style={checkBadge(true)}>✓</span>
                  <div>
                    <div style={confirmLabel}>Etablissement</div>
                    <div style={confirmValue}>{detection.etablissement.name}</div>
                    <div style={confirmHint}>
                      Detecte via &quot;{detection.etablissement.matchedKeyword}&quot;
                    </div>
                  </div>
                </div>
              ) : (
                <div style={confirmRow}>
                  <span style={checkBadge(false)}>⚠</span>
                  <div style={{ flex: 1 }}>
                    <div style={confirmLabel}>Etablissement non detecte</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      {ETABS.map((e) => (
                        <button key={e.value} type="button"
                          onClick={() => setSelectedEtab(e.value)}
                          style={pillBtn(selectedEtab === e.value)}>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fournisseur */}
            <div style={confirmSection}>
              {detection.supplier ? (
                <div style={confirmRow}>
                  <span style={checkBadge(true)}>✓</span>
                  <div>
                    <div style={confirmLabel}>Fournisseur</div>
                    <div style={confirmValue}>{detection.supplier.name}</div>
                    <div style={confirmHint}>
                      Detecte via &quot;{detection.supplier.matchedKeyword}&quot;
                    </div>
                  </div>
                </div>
              ) : (
                <div style={confirmRow}>
                  <span style={checkBadge(false)}>⚠</span>
                  <div style={{ flex: 1 }}>
                    <div style={confirmLabel}>Fournisseur non detecte</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {SUPPLIERS.filter((s) => {
                        if (selectedEtab === "piccola") {
                          return ["mael", "metro", "cozigou", "carniato"].includes(s.slug);
                        }
                        return true;
                      }).map((s) => (
                        <button key={s.slug} type="button"
                          onClick={() => setSelectedSupplier(s.slug)}
                          style={pillBtn(selectedSupplier === s.slug)}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Override button */}
            {(detection.etablissement || detection.supplier) && (
              <div style={{ borderTop: "1px solid #f0ebe3", paddingTop: 12, marginTop: 4 }}>
                <button type="button" onClick={() => {
                  setDetection({ supplier: null, etablissement: null });
                }} style={{ fontSize: 12, color: "#999", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Modifier manuellement
                </button>
              </div>
            )}

            {/* File info */}
            <div style={{ fontSize: 12, color: "#6f6a61", marginTop: 12 }}>
              📄 {file?.name}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button type="button" onClick={reset} style={cancelBtnStyle}>
                Annuler
              </button>
              <button type="button" onClick={handlePreview}
                disabled={loading || !selectedSupplier}
                style={{ ...primaryBtnStyle, opacity: loading || !selectedSupplier ? 0.5 : 1 }}>
                {loading ? "Analyse..." : "Confirmer et analyser"}
              </button>
            </div>
          </div>
        )}

        {/* ════════════ STEP 3: Preview ════════════ */}
        {step === "preview" && preview?.parsed && (
          <>
            <div style={confirmCard}>
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

        {/* ════════════ STEP 4: Done ════════════ */}
        {step === "done" && commitResult && (
          <div style={{ ...confirmCard, textAlign: "center" }}>
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

const dropZone = (hasFile: boolean): React.CSSProperties => ({
  border: "2px dashed #ddd6c8",
  borderRadius: 12,
  padding: "40px 20px",
  textAlign: "center",
  cursor: "pointer",
  background: hasFile ? "#f0fdf4" : "#faf8f4",
  transition: "border-color 0.2s",
});

const confirmCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #ddd6c8",
  padding: "20px 22px",
};

const confirmSection: React.CSSProperties = {
  paddingBottom: 14,
  marginBottom: 14,
  borderBottom: "1px solid #f0ebe3",
};

const confirmRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
};

const checkBadge = (ok: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: "50%",
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
  marginTop: 2,
  background: ok ? "#e8ede6" : "#FFF3E0",
  color: ok ? "#4a6741" : "#E65100",
});

const confirmLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6f6a61",
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const confirmValue: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#1a1a1a",
  marginTop: 2,
};

const confirmHint: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  marginTop: 2,
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

const pillBtnBase: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  color: "#374151",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

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
