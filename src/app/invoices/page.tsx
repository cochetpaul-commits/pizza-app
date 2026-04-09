"use client";

import { useEffect, useRef, useState } from "react";

import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { takePendingInvoiceFile } from "@/lib/pendingInvoiceFile";

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
  { slug: "sdpf", name: "SDPF" },
  { slug: "elien", name: "Eric Elien" },
  { slug: "hardy", name: "Maison Hardy" },
];

const ETABS = [
  { slug: "bello_mio", name: "Bello Mio", value: "bellomio" as const },
  { slug: "piccola_mia", name: "Piccola Mia", value: "piccola" as const },
];

type Step = "upload" | "confirm" | "preview" | "done" | "batch";

type BatchItem = {
  file: File;
  status: "pending" | "detecting" | "processing" | "done" | "error";
  supplier?: string;
  detectedSupplier?: string;
  detectedEtab?: string;
  result?: { ingredients_created?: number; offers_inserted?: number; already_imported?: boolean };
  error?: string;
};

export default function InvoicesPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const { etablissements } = useEtablissement();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch mode
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchEtab, setBatchEtab] = useState<string>("bellomio");

  // Detection
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedEtab, setSelectedEtab] = useState<string>("bellomio");

  // Import results
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [commitResult, setCommitResult] = useState<ImportResult | null>(null);

  // If a file was staged by the /achats import drawer, consume it and trigger
  // the detection flow immediately.
  useEffect(() => {
    const pending = takePendingInvoiceFile();
    if (pending) {
      handleFileUpload(pending);
    }
  }, []);

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

  function getEtabId(etab?: string): string {
    const e = etab ?? selectedEtab;
    return etablissements.find(et =>
      e === "piccola" ? et.slug?.includes("piccola") : et.slug?.includes("bello")
    )?.id ?? "";
  }

  const isImageFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    return f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext);
  };

  async function handleFileUpload(f: File) {
    const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
    const isImage = isImageFile(f);
    // On iOS, camera photos sometimes have empty type — accept them
    if (!isPdf && !isImage && f.type) {
      setError("Formats acceptes : PDF, JPEG, PNG, WebP.");
      return;
    }
    // If type is empty and not PDF, treat as image (common on iOS)
    const treatAsImage = isImage || (!isPdf && !f.type);
    setFile(f);
    setError(null);
    setLoading(true);

    try {
      if (treatAsImage) {
        // Vision scan path — Gemini analyses the image directly
        const form = new FormData();
        form.append("file", f);
        form.append("mode", "preview");
        const auth = getAuthHeader();
        const res = await fetchApi("/api/invoices/scan", {
          method: "POST",
          headers: {
            ...(auth ? { Authorization: auth } : {}),
            "x-etablissement-id": getEtabId(),
          },
          body: form,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Erreur scan");
        // Go directly to preview with scan results
        setSelectedSupplier("scan");
        setDetection({
          supplier: { slug: "scan", name: data.supplier_detected ?? "Scan IA", matchedKeyword: "vision" },
          etablissement: null,
        });
        setPreview(data);
        setStep("preview");
      } else {
        // PDF detection path (existing flow)
        const form = new FormData();
        form.append("file", f);
        const res = await fetchApi("/api/invoices/detect", { method: "POST", body: form });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error ?? "Erreur detection");
        setDetection(data.detection);
        setSelectedSupplier(data.detection?.supplier?.slug ?? null);
        if (data.detection?.etablissement?.slug === "bello_mio") setSelectedEtab("bellomio");
        else if (data.detection?.etablissement?.slug === "piccola_mia") setSelectedEtab("piccola");
        setStep("confirm");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
      const endpoint = selectedSupplier === "scan" ? "/api/invoices/scan" : `/api/invoices/${selectedSupplier}`;
      const res = await fetchApi(endpoint, {
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
      const endpoint = selectedSupplier === "scan" ? "/api/invoices/scan" : `/api/invoices/${selectedSupplier}`;
      const res = await fetchApi(endpoint, {
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
    setStep("upload");
    setFile(null);
    setDetection(null);
    setSelectedSupplier(null);
    setSelectedEtab("bellomio");
    setPreview(null);
    setCommitResult(null);
    setError(null);
    setBatchItems([]);
    if (fileRef.current) fileRef.current.value = "";
    if (batchRef.current) batchRef.current.value = "";
  }

  // ── Batch import ──
  function handleBatchFiles(files: FileList) {
    const items: BatchItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf") {
        items.push({ file: f, status: "pending" });
      }
    }
    if (items.length === 0) { setError("Aucun fichier PDF selectionne."); return; }
    setBatchItems(items);
    setStep("batch");
  }

  async function runBatch() {
    setBatchRunning(true);
    const auth = getAuthHeader();

    for (let i = 0; i < batchItems.length; i++) {
      const item = batchItems[i];

      // Step 1: detect supplier
      setBatchItems(prev => prev.map((p, j) => j === i ? { ...p, status: "detecting" } : p));

      try {
        const detectForm = new FormData();
        detectForm.append("file", item.file);
        const detectRes = await fetchApi("/api/invoices/detect", { method: "POST", body: detectForm });
        const detectData = await detectRes.json();

        const detected = detectData.ok && detectData.detection?.supplier?.slug;
        const slug = detected ? detectData.detection.supplier.slug : null;
        const supplierName = detected ? detectData.detection.supplier.name : null;
        const etab = detectData.detection?.etablissement?.slug === "piccola_mia" ? "piccola" : batchEtab;

        // Step 2: import (commit directly)
        setBatchItems(prev => prev.map((p, j) => j === i ? { ...p, status: "processing", detectedSupplier: supplierName ?? "IA...", detectedEtab: etab } : p));

        const form = new FormData();
        form.append("file", item.file);
        form.append("mode", "commit");
        form.append("establishment", etab);
        const etabId = getEtabId(etab);

        // Use dedicated parser if known, ai-parse if unknown
        const endpoint = slug ? `/api/invoices/${slug}` : "/api/invoices/ai-parse";

        const res = await fetchApi(endpoint, {
          method: "POST",
          headers: {
            ...(auth ? { Authorization: auth } : {}),
            "x-etablissement-id": etabId,
          },
          body: form,
        });
        const data = await res.json();

        if (!data.ok) throw new Error(data.error ?? "Erreur import");

        setBatchItems(prev => prev.map((p, j) => j === i ? {
          ...p,
          status: "done",
          supplier: data.supplier_detected ?? supplierName ?? "Importe",
          result: {
            ingredients_created: data.inserted?.ingredients_created ?? 0,
            offers_inserted: data.inserted?.offers_inserted ?? 0,
            already_imported: data.invoice?.already_imported ?? false,
          },
        } : p));
      } catch (e) {
        setBatchItems(prev => prev.map((p, j) => j === i ? {
          ...p,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        } : p));
      }
    }
    setBatchRunning(false);
  }

  const etabName = ETABS.find((e) => e.value === selectedEtab)?.name ?? selectedEtab;
  const supplierName = SUPPLIERS.find((s) => s.slug === selectedSupplier)?.name ?? selectedSupplier;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        <h1 style={h1Style}>Import factures</h1>

        {error && <div style={errorBox}>{error}</div>}

        {/* ════════════ STEP 1: Upload ════════════ */}
        {step === "upload" && (
          <>
            <div
              style={dropZoneStyle}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = e.dataTransfer.files;
                if (files.length > 1) {
                  handleBatchFiles(files);
                } else if (files[0]) {
                  handleFileUpload(files[0]);
                }
              }}
            >
              <input
                ref={fileRef}
                type="file"
                style={{ display: "none" }}
                accept="application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = "";
                }}
              />
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 24, height: 24, border: "3px solid #ddd6c8", borderTopColor: "#D4775A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#D4775A" }}>Analyse en cours...</div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>
                    Glisser une facture ici
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                    PDF ou photo — cliquer pour parcourir
                  </div>
                </>
              )}
            </div>

            {/* Camera button (mobile) */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button type="button" onClick={() => cameraRef.current?.click()}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none",
                  background: "#D4775A", color: "#fff", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 8px rgba(212,119,90,0.3)",
                }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Scanner une facture
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#999", textAlign: "center", marginTop: 12 }}>
              Le fournisseur est detecte automatiquement (IA pour les photos).
            </p>

            {/* Batch upload */}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <input ref={batchRef} type="file" multiple accept=".pdf,application/pdf" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleBatchFiles(e.target.files); }} />
              <button type="button" onClick={() => batchRef.current?.click()}
                style={{ padding: "10px 24px", borderRadius: 10, border: "1.5px solid #D4775A", background: "#fff", color: "#D4775A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Importer plusieurs factures (PDF)
              </button>
            </div>

            {/* Quick links to legacy pages */}
            <div style={{ marginTop: 32, borderTop: "1px solid #f0ebe3", paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Import par fournisseur
              </div>
              <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12 }}>
                {SUPPLIERS.map((s) => (
                  <a key={s.slug} href={`/invoices/${s.slug}`}
                    style={{ ...pillBtnBase, textDecoration: "none" }}>
                    {s.name}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ════════════ STEP 2: Confirmation ════════════ */}
        {step === "confirm" && detection && (
          <div style={cardStyle}>
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
                    <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12, marginTop: 8 }}>
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
                    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12, marginTop: 8 }}>
                      {SUPPLIERS.map((s) => (
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
              {file?.name}
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
            <div style={cardStyle}>
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

        {/* ════════════ BATCH MODE ════════════ */}
        {step === "batch" && (
          <div style={cardStyle}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777", marginBottom: 16 }}>
              Import multiple — {batchItems.length} fichier{batchItems.length > 1 ? "s" : ""}
            </div>

            {/* Etab selector (default for undetected) */}
            {!batchRunning && batchItems.every(b => b.status === "pending") && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#666" }}>Etablissement par defaut :</span>
                <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12 }}>
                  {ETABS.map(e => (
                    <button key={e.value} type="button" onClick={() => setBatchEtab(e.value)}
                      style={pillBtn(batchEtab === e.value)}>
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* File list */}
            <div style={{ marginBottom: 16 }}>
              {batchItems.map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", borderRadius: 10,
                  background: item.status === "done" ? "#f0fdf4" : item.status === "error" ? "#fef2f2" : (item.status === "detecting" || item.status === "processing") ? "#fffbeb" : "#fff",
                  border: `1px solid ${item.status === "done" ? "#bbf7d0" : item.status === "error" ? "#fecaca" : (item.status === "detecting" || item.status === "processing") ? "#fde68a" : "#e0d8ce"}`,
                  marginBottom: 6,
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0, color: item.status === "done" ? "#166534" : item.status === "error" ? "#991b1b" : "#666" }}>
                    {item.status === "pending" && "—"}
                    {item.status === "detecting" && "..."}
                    {item.status === "processing" && "..."}
                    {item.status === "done" && "OK"}
                    {item.status === "error" && "X"}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.file.name}
                    </div>
                    {item.status === "done" && item.supplier && (
                      <div style={{ fontSize: 11, color: "#4a6741" }}>
                        {item.supplier}
                        {`${item.result?.ingredients_created ?? 0} ingredients, ${item.result?.offers_inserted ?? 0} offres`}{item.result?.already_imported ? " (facture deja connue)" : ""}
                      </div>
                    )}
                    {item.status === "error" && (
                      <div style={{ fontSize: 11, color: "#DC2626" }}>{item.error}</div>
                    )}
                    {item.status === "detecting" && (
                      <div style={{ fontSize: 11, color: "#D97706" }}>Detection fournisseur...</div>
                    )}
                    {item.status === "processing" && (
                      <div style={{ fontSize: 11, color: "#D97706" }}>Import {item.detectedSupplier ?? ""}...</div>
                    )}
                  </div>

                  <span style={{ fontSize: 11, color: "#999", flexShrink: 0 }}>
                    {(item.file.size / 1024).toFixed(0)} Ko
                  </span>
                </div>
              ))}
            </div>

            {/* Progress */}
            {batchRunning && (() => {
              const done = batchItems.filter(b => b.status === "done" || b.status === "error").length;
              const pct = Math.round((done / batchItems.length) * 100);
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 4 }}>
                    <span>{done}/{batchItems.length} traites</span>
                    <span>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: "#e0d8ce", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "#4a6741", borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={reset} style={cancelBtnStyle}>
                {batchRunning ? "Fermer" : "Annuler"}
              </button>
              {!batchRunning && batchItems.some(b => b.status === "pending") && (
                <button type="button" onClick={runBatch} style={primaryBtnStyle}>
                  Lancer l&apos;import ({batchItems.filter(b => b.status === "pending").length} fichiers)
                </button>
              )}
              {!batchRunning && batchItems.every(b => b.status !== "pending") && (
                <button type="button" onClick={reset} style={primaryBtnStyle}>
                  Terminer
                </button>
              )}
            </div>
          </div>
        )}

        {/* ════════════ STEP 4: Done ════════════ */}
        {step === "done" && commitResult && (
          <div style={{ ...cardStyle, textAlign: "center" }}>
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

const dropZoneStyle: React.CSSProperties = {
  border: "2px dashed #ddd6c8",
  borderRadius: 12,
  padding: "40px 20px",
  textAlign: "center",
  cursor: "pointer",
  background: "#faf8f4",
  transition: "border-color 0.2s",
};

const cardStyle: React.CSSProperties = {
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

const pillBtn = (active: boolean, ec?: string): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 10,
  border: "none",
  background: active ? (ec ? ec + "25" : "#fff") : "transparent",
  color: active ? "#1a1a1a" : "#999",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
  transition: "all 0.15s",
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
