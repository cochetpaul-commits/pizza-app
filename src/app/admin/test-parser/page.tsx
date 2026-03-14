"use client";

import { useState, useRef, useCallback } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import type { ParsedIngredient, ParseLog, Categorie } from "@/lib/parsers";

type AnalyzeResponse = {
  ok: boolean;
  error?: string;
  fournisseur: string;
  etablissement: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
  ingredients: ParsedIngredient[];
  logs: ParseLog[];
  raw_text_preview: string;
};

const FOURNISSEURS = [
  { value: "", label: "Auto-detect" },
  { value: "metro", label: "Metro" },
  { value: "mael", label: "Maël" },
  { value: "masse", label: "Masse" },
  { value: "cozigou", label: "Cozigou" },
  { value: "vinoflo", label: "Vinoflo" },
  { value: "carniato", label: "Carniato" },
];

const ETABLISSEMENTS = [
  { value: "", label: "Auto-detect" },
  { value: "bello_mio", label: "Bello Mio" },
  { value: "piccola_mia", label: "Piccola Mia" },
];

const CATEGORIES: Categorie[] = [
  "cremerie_fromage", "charcuterie_viande", "maree",
  "legumes_herbes", "epicerie", "boissons",
  "surgele", "emballage_entretien", "autre",
];

const confidenceColor = (c: string) => {
  if (c === "high") return "#fff";
  if (c === "medium") return "#fffbe6";
  return "#fff0f0";
};

export default function TestParserPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fournisseur, setFournisseur] = useState("");
  const [etablissement, setEtablissement] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editedRows, setEditedRows] = useState<Map<number, Partial<ParsedIngredient>>>(new Map());
  const [showLogs, setShowLogs] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") setFile(f);
  }, []);

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      if (fournisseur) form.append("fournisseur", fournisseur);
      if (etablissement) form.append("etablissement", etablissement);

      const res = await fetch("/api/parsers/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "Erreur serveur");
        return;
      }

      setResult(data as AnalyzeResponse);
      // Select all high/medium confidence by default
      const sel = new Set<number>();
      (data.ingredients as ParsedIngredient[]).forEach((ing, i) => {
        if (ing.confidence !== "low") sel.add(i);
      });
      setSelected(sel);
      setEditedRows(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (!result) return;
    setSelected(new Set(result.ingredients.map((_, i) => i)));
  };

  const deselectLow = () => {
    if (!result) return;
    setSelected((prev) => {
      const next = new Set(prev);
      result.ingredients.forEach((ing, i) => {
        if (ing.confidence === "low") next.delete(i);
      });
      return next;
    });
  };

  const updateRow = (idx: number, field: string, value: string | number) => {
    setEditedRows((prev) => {
      const next = new Map(prev);
      const existing = next.get(idx) || {};
      next.set(idx, { ...existing, [field]: value });
      return next;
    });
  };

  const getRow = (idx: number): ParsedIngredient => {
    if (!result) throw new Error("no result");
    const base = result.ingredients[idx];
    const edits = editedRows.get(idx);
    return edits ? { ...base, ...edits } : base;
  };

  const exportCsv = () => {
    if (!result) return;
    const headers = ["nom", "reference", "unit_recette", "colisage", "unit_commande", "prix_unitaire", "prix_commande", "categorie", "confidence"];
    const rows = result.ingredients
      .filter((_, i) => selected.has(i))
      .map((_, i) => {
        const r = getRow(i);
        return [r.name, r.reference || "", r.unit_recette, r.colisage || "", r.unit_commande, r.prix_unitaire, r.prix_commande, r.categorie, r.confidence].join(";");
      });
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parser-${result.fournisseur}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <NavBar backHref="/admin/utilisateurs" backLabel="Admin" />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "DM Sans, sans-serif" }}>
        <h1 style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, color: "#1a1a1a", fontSize: 28, marginBottom: 24 }}>
          Test Parser Factures
        </h1>

        {/* STEP 1 — Upload */}
        <div style={{ marginBottom: 32 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "#D4775A" : "#ddd6c8"}`,
              borderRadius: 12,
              padding: "40px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "#fdf6f3" : "#fafaf8",
              transition: "all 0.2s",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            {file ? (
              <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{file.name}</span>
            ) : (
              <span style={{ color: "#999" }}>Glisser un PDF ici ou cliquer pour choisir</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: 1, minWidth: 180 }}>
              <span style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 4 }}>Fournisseur</span>
              <select
                value={fournisseur}
                onChange={(e) => setFournisseur(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}
              >
                {FOURNISSEURS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 180 }}>
              <span style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 4 }}>Etablissement</span>
              <select
                value={etablissement}
                onChange={(e) => setEtablissement(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}
              >
                {ETABLISSEMENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </label>
            <button
              onClick={handleAnalyze}
              disabled={!file || loading}
              style={{
                padding: "10px 28px",
                borderRadius: 20,
                border: "none",
                background: file && !loading ? "#D4775A" : "#ccc",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
                cursor: file && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? "Analyse..." : "Analyser"}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fff0f0", borderRadius: 8, color: "#c0392b", marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* STEP 2 — Results */}
        {result && (
          <>
            {/* Metadata */}
            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20,
              padding: "12px 16px", background: "#f5f0e8", borderRadius: 8,
            }}>
              <span><b>Fournisseur :</b> {result.fournisseur}</span>
              <span><b>Etab :</b> {result.etablissement || "?"}</span>
              {result.invoice_number && <span><b>N° :</b> {result.invoice_number}</span>}
              {result.invoice_date && <span><b>Date :</b> {result.invoice_date}</span>}
              {result.total_ht != null && <span><b>HT :</b> {result.total_ht.toFixed(2)}€</span>}
              {result.total_ttc != null && <span><b>TTC :</b> {result.total_ttc.toFixed(2)}€</span>}
              <span><b>Lignes :</b> {result.ingredients.length}</span>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={selectAll} style={btnStyle}>Tout sélectionner</button>
              <button onClick={deselectLow} style={btnStyle}>Désélectionner LOW</button>
              <button onClick={exportCsv} style={btnStyle}>Exporter CSV</button>
              <span style={{ fontSize: 13, color: "#999", alignSelf: "center" }}>
                {selected.size}/{result.ingredients.length} sélectionnés
              </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8", textAlign: "left" }}>
                    <th style={thStyle}></th>
                    <th style={thStyle}>Nom</th>
                    <th style={thStyle}>Ref</th>
                    <th style={thStyle}>U.recette</th>
                    <th style={thStyle}>Col.</th>
                    <th style={thStyle}>U.cmd</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Prix unit.</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Prix cmd</th>
                    <th style={thStyle}>Catégorie</th>
                    <th style={thStyle}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {result.ingredients.map((_, idx) => {
                    const row = getRow(idx);
                    const bg = confidenceColor(row.confidence);
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid #eee", background: bg }}>
                        <td style={tdStyle}>
                          <input
                            type="checkbox"
                            checked={selected.has(idx)}
                            onChange={() => toggleSelect(idx)}
                          />
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 260 }}>
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateRow(idx, "name", e.target.value)}
                            style={cellInputStyle}
                          />
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: 11, color: "#999" }}>{row.reference || ""}</span>
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={row.unit_recette}
                            onChange={(e) => updateRow(idx, "unit_recette", e.target.value)}
                            style={{ ...cellInputStyle, width: 60 }}
                          >
                            {["g", "kg", "cl", "L", "ml", "pcs"].map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <input
                            type="number"
                            value={row.colisage ?? ""}
                            onChange={(e) => updateRow(idx, "colisage", e.target.value ? Number(e.target.value) : "")}
                            style={{ ...cellInputStyle, width: 50 }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={row.unit_commande}
                            onChange={(e) => updateRow(idx, "unit_commande", e.target.value)}
                            style={{ ...cellInputStyle, width: 65 }}
                          >
                            {["pcs", "colis", "kg"].map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            value={row.prix_unitaire}
                            onChange={(e) => updateRow(idx, "prix_unitaire", Number(e.target.value))}
                            style={{ ...cellInputStyle, width: 80, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            value={row.prix_commande}
                            onChange={(e) => updateRow(idx, "prix_commande", Number(e.target.value))}
                            style={{ ...cellInputStyle, width: 80, textAlign: "right" }}
                          />
                        </td>
                        <td style={tdStyle}>
                          <select
                            value={row.categorie}
                            onChange={(e) => updateRow(idx, "categorie", e.target.value)}
                            style={{ ...cellInputStyle, width: 140 }}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c.replace("_", " ")}</option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: row.confidence === "high" ? "#27ae60" : row.confidence === "medium" ? "#f39c12" : "#e74c3c",
                          }}>
                            {row.confidence.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* STEP 4 — Logs */}
            <div style={{ marginBottom: 40 }}>
              <button
                onClick={() => setShowLogs(!showLogs)}
                style={{ ...btnStyle, marginBottom: 8 }}
              >
                {showLogs ? "Masquer" : "Afficher"} logs parser ({result.logs.length})
              </button>
              {showLogs && (
                <div style={{
                  maxHeight: 400, overflow: "auto",
                  background: "#1a1a1a", color: "#e0e0e0",
                  borderRadius: 8, padding: 16, fontSize: 12,
                  fontFamily: "monospace",
                }}>
                  {result.logs.map((log, i) => (
                    <div key={i} style={{
                      marginBottom: 4,
                      color: log.result === "ok" ? "#a3e635" : log.result === "error" ? "#f87171" : "#999",
                    }}>
                      <span style={{ color: "#666" }}>L{log.line_number}</span>{" "}
                      <span style={{ color: "#93c5fd" }}>[{log.rule}]</span>{" "}
                      <span style={{ color: log.result === "ok" ? "#a3e635" : "#999" }}>{log.result}</span>
                      {log.detail && <span style={{ color: "#d4d4d8" }}> — {log.detail}</span>}
                      <div style={{ color: "#666", fontSize: 11, marginLeft: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 900 }}>
                        {log.raw}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "8px 6px",
  fontSize: 12,
  fontWeight: 600,
  color: "#999",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "4px 6px",
  verticalAlign: "middle",
};

const cellInputStyle: React.CSSProperties = {
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "3px 6px",
  fontSize: 13,
  background: "transparent",
  width: "100%",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  fontSize: 13,
  cursor: "pointer",
};
