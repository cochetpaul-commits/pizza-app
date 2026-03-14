"use client";

import { useState } from "react";
import type { DuplicatePair } from "@/lib/duplicateDetection";
import type { LatestOffer, Supplier } from "@/types/ingredients";
import { fmtOfferPriceLine } from "@/lib/offers";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

interface Props {
  pairs: DuplicatePair[];
  offersByIngredientId: Map<string, LatestOffer>;
  suppliers: Supplier[];
  onClose: () => void;
  onMerged: () => void;
  onIgnore: (key: string) => void;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatPrice(offer: LatestOffer | undefined): string {
  if (!offer) return "—";
  const line = fmtOfferPriceLine(offer, {});
  return line.main || "—";
}

export default function DuplicatePanel({ pairs, offersByIngredientId, suppliers, onClose, onMerged, onIgnore }: Props) {
  const suppliersMap = new Map(suppliers.map((s) => [s.id, s]));

  // For each pair key → which id to keep ("a" | "b")
  const [keepChoice, setKeepChoice] = useState<Record<string, "a" | "b">>({});
  // Track loading/done per pairKey
  const [merging, setMerging] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());

  function getDefaultKeep(pair: DuplicatePair): "a" | "b" {
    const offerA = offersByIngredientId.get(pair.a.id);
    const offerB = offersByIngredientId.get(pair.b.id);
    const dateA = offerA?.updated_at ? new Date(offerA.updated_at).getTime() : 0;
    const dateB = offerB?.updated_at ? new Date(offerB.updated_at).getTime() : 0;
    return dateA >= dateB ? "a" : "b";
  }

  async function handleMerge(pair: DuplicatePair) {
    const choice = keepChoice[pair.pairKey] ?? getDefaultKeep(pair);
    const keepId = choice === "a" ? pair.a.id : pair.b.id;
    const deleteId = choice === "a" ? pair.b.id : pair.a.id;

    setMerging((prev) => new Set([...prev, pair.pairKey]));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const res = await fetchApi("/api/ingredients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keepId, deleteId }),
      });
      const json = await res.json() as { ok: boolean; error?: string; errors?: string[] };
      if (!json.ok) {
        alert(`Erreur fusion : ${json.error ?? "Inconnue"}`);
        setMerging((prev) => { const n = new Set(prev); n.delete(pair.pairKey); return n; });
        return;
      }
      if (json.errors && json.errors.length > 0) {
        console.warn("Merge non-fatal errors:", json.errors);
      }
      setMerged((prev) => new Set([...prev, pair.pairKey]));
      setMerging((prev) => { const n = new Set(prev); n.delete(pair.pairKey); return n; });
      // Refresh parent after short delay
      setTimeout(() => onMerged(), 600);
    } catch (e) {
      alert(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
      setMerging((prev) => { const n = new Set(prev); n.delete(pair.pairKey); return n; });
    }
  }

  const visiblePairs = pairs.filter((p) => !merged.has(p.pairKey));

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", flexDirection: "column",
        alignItems: "stretch",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#fff", marginTop: "auto",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          borderRadius: "16px 16px 0 0",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 1,
          background: "#fff", borderBottom: "1px solid #e5ddd0",
          padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          borderRadius: "16px 16px 0 0",
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {visiblePairs.length} doublon{visiblePairs.length !== 1 ? "s" : ""} détecté{visiblePairs.length !== 1 ? "s" : ""}
            </span>
            <span style={{ marginLeft: 8, fontSize: 13, color: "#888" }}>
              (similarité ≥ 80%)
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "1px solid #e5ddd0", borderRadius: 8,
              padding: "4px 14px", fontSize: 13, cursor: "pointer", color: "#444",
            }}
          >
            ✕ Fermer
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px 24px" }}>
          {visiblePairs.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#888", fontSize: 14 }}>
              Aucun doublon détecté
            </div>
          )}

          {visiblePairs.map((pair) => {
            const isMerging = merging.has(pair.pairKey);
            const isMerged = merged.has(pair.pairKey);
            const choice = keepChoice[pair.pairKey] ?? getDefaultKeep(pair);
            const offerA = offersByIngredientId.get(pair.a.id);
            const offerB = offersByIngredientId.get(pair.b.id);
            const supA = suppliersMap.get(offerA?.supplier_id ?? pair.a.supplier_id ?? "");
            const supB = suppliersMap.get(offerB?.supplier_id ?? pair.b.supplier_id ?? "");

            return (
              <div
                key={pair.pairKey}
                style={{
                  marginBottom: 12, border: "1px solid #e5ddd0", borderRadius: 10,
                  background: "#faf7f2", overflow: "hidden",
                  opacity: isMerging || isMerged ? 0.5 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {/* Score badge */}
                <div style={{
                  padding: "8px 12px 4px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{
                    background: pair.score >= 0.95 ? "#7f1d1d" : pair.score >= 0.90 ? "#8B1A1A" : "#b45309",
                    color: "white", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    padding: "2px 8px",
                  }}>
                    {Math.round(pair.score * 100)}% similarité
                  </span>
                  {isMerging && (
                    <span style={{ fontSize: 12, color: "#888" }}>Fusion en cours…</span>
                  )}
                  {isMerged && (
                    <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>✓ Fusionné</span>
                  )}
                </div>

                {/* Two columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, padding: "0 12px 8px" }}>
                  {([{ ing: pair.a, offer: offerA, sup: supA, side: "a" as const }, { ing: pair.b, offer: offerB, sup: supB, side: "b" as const }]).map(({ ing, offer, sup, side }) => {
                    const isKeep = choice === side;
                    return (
                      <div
                        key={side}
                        style={{
                          background: isKeep ? "#fff8f8" : "white",
                          border: isKeep ? "2px solid #8B1A1A" : "1px solid #e5ddd0",
                          borderRadius: 8, padding: "10px 12px",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                        onClick={() => setKeepChoice((prev) => ({ ...prev, [pair.pairKey]: side }))}
                      >
                        {/* Radio + label */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                          <input
                            type="radio"
                            name={`keep-${pair.pairKey}`}
                            checked={isKeep}
                            onChange={() => setKeepChoice((prev) => ({ ...prev, [pair.pairKey]: side }))}
                            style={{ marginTop: 3, accentColor: "#8B1A1A", flexShrink: 0 }}
                          />
                          <span style={{
                            fontWeight: 700, fontSize: 13, lineHeight: 1.3,
                            color: isKeep ? "#8B1A1A" : "#1a1a1a",
                          }}>
                            {ing.name}
                          </span>
                        </div>
                        {isKeep && (
                          <div style={{ fontSize: 10, color: "#8B1A1A", fontWeight: 600, marginBottom: 4, marginLeft: 20 }}>
                            GARDER
                          </div>
                        )}
                        <div style={{ marginLeft: 20, fontSize: 12, color: "#666", display: "flex", flexDirection: "column", gap: 2 }}>
                          <span>{sup?.name ?? "—"}</span>
                          <span style={{ color: "#1a1a1a", fontWeight: 600 }}>{formatPrice(offer)}</span>
                          <span style={{ color: "#aaa" }}>màj {formatDate(offer?.updated_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Actions */}
                <div style={{
                  padding: "8px 12px 12px",
                  display: "flex", gap: 8, justifyContent: "flex-end",
                }}>
                  <button
                    onClick={() => onIgnore(pair.pairKey)}
                    disabled={isMerging}
                    style={{
                      height: 30, padding: "0 14px", borderRadius: 6, fontSize: 12,
                      cursor: "pointer", border: "1px solid #e5ddd0", background: "white",
                      color: "#888",
                    }}
                  >
                    Ignorer
                  </button>
                  <button
                    onClick={() => handleMerge(pair)}
                    disabled={isMerging || isMerged}
                    style={{
                      height: 30, padding: "0 16px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      cursor: isMerging || isMerged ? "not-allowed" : "pointer",
                      border: "none", background: "#8B1A1A", color: "white",
                    }}
                  >
                    {isMerging ? "…" : "Fusionner →"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
