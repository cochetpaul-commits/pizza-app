"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, PriceAlert, ALERT_THRESHOLD } from "@/lib/priceAlerts";
import { useEtablissement } from "@/lib/EtablissementContext";
import Link from "next/link";

const SNOOZE_KEY = "alertes-prix:snoozed"; // localStorage key: JSON { [ingredient_id+supplier_id]: snooze_until_iso }

function getSnoozed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}"); } catch { return {}; }
}

function setSnoozed(map: Record<string, string>) {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
}

function snoozeKey(a: PriceAlert) {
  return `${a.ingredient_id}__${a.supplier_id}`;
}

function fmtPct(v: number) {
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;
}

function fmtPrice(v: number, unit: string) {
  return `${v.toFixed(2)} €/${unit}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function AleretesPrixPage() {
  const { current: etab } = useEtablissement();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snoozed, setSnoozedState] = useState<Record<string, string>>({});
  const [showSnoozed, setShowSnoozed] = useState(false);

  useEffect(() => {
    setSnoozedState(getSnoozed());
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");
        const eid = etab?.id;
        const all = await fetchPriceAlerts(supabase, user.id, ALERT_THRESHOLD, undefined, eid);
        setAlerts(all);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [etab]);

  function snooze(a: PriceAlert) {
    const until = new Date();
    until.setDate(until.getDate() + 30);
    const next = { ...snoozed, [snoozeKey(a)]: until.toISOString() };
    setSnoozed(next);
    setSnoozedState(next);
  }

  function unsnooze(a: PriceAlert) {
    const next = { ...snoozed };
    delete next[snoozeKey(a)];
    setSnoozed(next);
    setSnoozedState(next);
  }

  const now = new Date().toISOString();

  const { activeUp, activeDown, snoozedList } = useMemo(() => {
    const activeUp: PriceAlert[] = [];
    const activeDown: PriceAlert[] = [];
    const snoozedList: PriceAlert[] = [];
    for (const a of alerts) {
      const until = snoozed[snoozeKey(a)];
      if (until && until > now) snoozedList.push(a);
      else if (a.direction === "up") activeUp.push(a);
      else activeDown.push(a);
    }
    return { activeUp, activeDown, snoozedList };
  }, [alerts, snoozed, now]);
  const active = [...activeUp, ...activeDown];

  return (
    <main className="container safe-bottom">
        <div style={{ marginBottom: 20 }}>
          <h1 className="h1" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Alertes prix
            {active.length > 0 && (
              <span style={{
                fontSize: 13, fontWeight: 900, background: "rgba(220,38,38,0.10)", color: "#DC2626",
                border: "1px solid rgba(220,38,38,0.30)", borderRadius: 999, padding: "2px 10px",
              }}>
                {active.length}
              </span>
            )}
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>Hausses et baisses détectées depuis les factures importées</p>
        </div>

        {error && <div className="errorBox" style={{ marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
        ) : (
          <>
            {active.length === 0 && snoozedList.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontWeight: 800 }}>Aucune alerte active</div>
                <p className="muted" style={{ marginTop: 6 }}>Tous les prix sont stables.</p>
              </div>
            )}

            {/* Hausses */}
            {activeUp.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#DC2626", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, borderBottom: "2px solid rgba(220,38,38,0.2)", paddingBottom: 6 }}>
                  Hausses ({activeUp.length})
                </div>
                {activeUp.map((a, i) => (
                  <AlertCard key={i} alert={a} onSnooze={() => snooze(a)} onNavigate={`/ingredients/${a.ingredient_id}`} />
                ))}
              </div>
            )}

            {/* Baisses */}
            {activeDown.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#16A34A", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, borderBottom: "2px solid rgba(22,163,74,0.2)", paddingBottom: 6 }}>
                  Baisses ({activeDown.length})
                </div>
                {activeDown.map((a, i) => (
                  <AlertCard key={i} alert={a} onSnooze={() => snooze(a)} onNavigate={`/ingredients/${a.ingredient_id}`} />
                ))}
              </div>
            )}

            {/* Snoozed */}
            {snoozedList.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <button
                  onClick={() => setShowSnoozed(v => !v)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 700, opacity: 0.6, display: "flex", alignItems: "center", gap: 6 }}
                >
                  {showSnoozed ? "▾" : "▸"} {snoozedList.length} alerte{snoozedList.length > 1 ? "s" : ""} en veille (30 j)
                </button>
                {showSnoozed && (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {snoozedList.map((a, i) => (
                      <AlertCard key={i} alert={a} snoozed onUnsnooze={() => unsnooze(a)} onNavigate={`/ingredients/${a.ingredient_id}`} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </main>
  );
}

function AlertCard({
  alert: a, snoozed = false, onSnooze, onUnsnooze, onNavigate,
}: {
  alert: PriceAlert;
  snoozed?: boolean;
  onSnooze?: () => void;
  onUnsnooze?: () => void;
  onNavigate: string;
}) {
  return (
    <div className="card" style={{
      padding: "12px 14px", marginBottom: 8,
      opacity: snoozed ? 0.55 : 1,
      borderLeft: snoozed ? "4px solid #ddd6c8" : a.aberrant ? "4px solid #EA580C" : a.direction === "down" ? "4px solid #16A34A" : "4px solid #DC2626",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Link href={onNavigate} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{a.ingredient_name}</div>
          </Link>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 4 }}>
            {a.supplier_name}
            {a.ingredient_category ? ` · ${a.ingredient_category}` : ""}
            {" · "}{fmtDate(a.new_offer_date)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.55 }}>
            {fmtPrice(a.old_price, a.unit)} → <strong>{fmtPrice(a.new_price, a.unit)}</strong>
          </div>
          {a.aberrant && !snoozed && (
            <span style={{
              display: "inline-block", marginTop: 4, fontSize: 11, fontWeight: 700,
              background: "rgba(234,88,12,0.10)", color: "#EA580C",
              border: "1px solid rgba(234,88,12,0.25)", borderRadius: 6, padding: "2px 7px",
            }}>
              Variation aberrante (&gt;50 %)
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 999,
            background: a.direction === "down" ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)",
            color: a.direction === "down" ? "#16A34A" : "#DC2626",
            border: a.direction === "down" ? "1px solid rgba(22,163,74,0.25)" : "1px solid rgba(220,38,38,0.25)",
            fontWeight: 800, fontSize: 14,
          }}>
            {a.direction === "down" ? "↓" : "↑"} {fmtPct(Math.abs(a.change_pct))}
          </span>
          {!snoozed && onSnooze && (
            <button
              onClick={onSnooze}
              className="btn"
              style={{ fontSize: 11, height: 26, padding: "0 8px" }}
              title="Mettre en veille 30 jours"
            >
              Veille 30 j
            </button>
          )}
          {snoozed && onUnsnooze && (
            <button onClick={onUnsnooze} className="btn" style={{ fontSize: 11, height: 26, padding: "0 8px" }}>
              Réactiver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
