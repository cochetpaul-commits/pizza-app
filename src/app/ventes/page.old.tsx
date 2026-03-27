"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8" };
const JOURS_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function fmtEur(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtEur0(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

type DayData = { date: string; label: string; ca: number; couverts: number; isToday: boolean };
type Product = { name: string; quantity: number; totalSales: number };
type Category = { name: string; ca: number; pct: number };

export default function VentesPage() {
  const { current: etab } = useEtablissement();
  const etabColor = etab?.couleur ?? "#e27f57";

  const [loading, setLoading] = useState(true);
  const [caToday, setCaToday] = useState(0);
  const [couvertsToday, setCouvertsToday] = useState(0);
  const [ticketMoyen, setTicketMoyen] = useState(0);
  const [midi, setMidi] = useState({ ca: 0, couverts: 0 });
  const [soir, setSoir] = useState({ ca: 0, couverts: 0 });
  const [surPlace, setSurPlace] = useState({ ca: 0, couverts: 0 });
  const [aEmporter, setAEmporter] = useState({ ca: 0, couverts: 0 });
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [weekData, setWeekData] = useState<DayData[]>([]);
  const [caSemaine, setCaSemaine] = useState(0);
  const [couvertsSemaine, setCouvertsSemaine] = useState(0);

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      try {
        // Load today's data
        const [todayRes, weekRes] = await Promise.all([
          fetch("/api/popina/ca-jour"),
          fetch("/api/popina/ca-semaine"),
        ]);

        if (!cancelled && todayRes.ok) {
          const d = await todayRes.json();
          setCaToday(d.totalSales ?? 0);
          setCouvertsToday(d.guestsNumber ?? 0);
          setTicketMoyen(d.ticketMoyen ?? 0);
          setMidi(d.midi ?? { ca: 0, couverts: 0 });
          setSoir(d.soir ?? { ca: 0, couverts: 0 });
          setSurPlace(d.surPlace ?? { ca: 0, couverts: 0 });
          setAEmporter(d.aEmporter ?? { ca: 0, couverts: 0 });
          setTopProducts(d.topProducts ?? []);
          setCategories(d.categories ?? []);
        }

        if (!cancelled && weekRes.ok) {
          const w = await weekRes.json();
          const days: DayData[] = (w.days ?? []).map((day: { date: string; label: string; totalSales: number; guestsNumber: number }) => ({
            date: day.date, label: day.label,
            ca: day.totalSales ?? 0, couverts: day.guestsNumber ?? 0,
            isToday: day.date === new Date().toISOString().slice(0, 10),
          }));
          setWeekData(days);
          setCaSemaine(w.totalSales ?? 0);
          setCouvertsSemaine(w.totalGuests ?? 0);
        }
      } catch { /* API not available */ }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab]);

  const weekTicket = couvertsSemaine > 0 ? caSemaine / couvertsSemaine : 0;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: etabColor }} />
            <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
              Ventes — {etab?.nom ?? ""}
            </h1>
          </div>
          <Link href="/ventes/produits" style={{ padding: "8px 16px", borderRadius: 8, background: "#1a1a1a", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
            Voir tous les produits
          </Link>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement des données Popina...</div>}

        {!loading && (
          <>
            {/* ═══ KPIs du jour ═══ */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <div style={{ ...CARD, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>CA du jour</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(caToday)} €</div>
              </div>
              <div style={{ ...CARD, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>Couverts</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>{couvertsToday}</div>
              </div>
              <div style={{ ...CARD, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>Ticket moyen</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#D4775A" }}>{fmtEur(ticketMoyen)} €</div>
              </div>
              <div style={{ ...CARD, textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>CA semaine</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur0(caSemaine)} €</div>
              </div>
            </div>

            {/* ═══ Répartition Zones ═══ */}
            <div style={{ ...CARD, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Répartition par zone</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "Midi", ca: midi.ca, couverts: midi.couverts, color: "#e27f57" },
                  { label: "Soir", ca: soir.ca, couverts: soir.couverts, color: "#2D6A4F" },
                  { label: "Sur place", ca: surPlace.ca, couverts: surPlace.couverts, color: "#D4775A" },
                  { label: "À emporter", ca: aEmporter.ca, couverts: aEmporter.couverts, color: "#1a1a1a" },
                ].map(z => (
                  <div key={z.label} style={{ padding: 14, borderRadius: 10, border: "1px solid #f0ebe3" }}>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>{z.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{fmtEur(z.ca)} €</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{z.couverts} couvert{z.couverts > 1 ? "s" : ""}</div>
                    <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#f0ebe3" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: z.color, width: `${caToday > 0 ? Math.min(100, (z.ca / caToday) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ Tableau semaine ═══ */}
            <div style={{ ...CARD, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Semaine en cours</h2>
                <span style={{ fontSize: 12, color: "#999" }}>Ticket moyen semaine : <strong style={{ color: "#D4775A" }}>{fmtEur(weekTicket)} €</strong></span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Jour</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>CA TTC</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Couverts</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Ticket moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {(weekData.length > 0 ? weekData : JOURS_FULL.map((j, i) => ({ date: "", label: j.substring(0, 3), ca: 0, couverts: 0, isToday: i === (new Date().getDay() + 6) % 7 }))).map((d, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0ebe3", background: d.isToday ? "rgba(45,106,79,0.04)" : "transparent" }}>
                      <td style={{ padding: "10px 0", fontWeight: d.isToday ? 700 : 500 }}>
                        {d.label} {d.isToday && <span style={{ fontSize: 9, color: "#2D6A4F", marginLeft: 4 }}>Aujourd&apos;hui</span>}
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600, color: d.ca > 0 ? "#1a1a1a" : "#ccc" }}>
                        {d.ca > 0 ? `${fmtEur(d.ca)} €` : "—"}
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "right", color: d.couverts > 0 ? "#1a1a1a" : "#ccc" }}>
                        {d.couverts > 0 ? d.couverts : "—"}
                      </td>
                      <td style={{ padding: "10px 0", textAlign: "right", color: d.ca > 0 ? "#D4775A" : "#ccc" }}>
                        {d.couverts > 0 ? `${fmtEur(d.ca / d.couverts)} €` : "—"}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr style={{ borderTop: "2px solid #ddd6c8", fontWeight: 700 }}>
                    <td style={{ padding: "10px 0" }}>Total</td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>{fmtEur(caSemaine)} €</td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>{couvertsSemaine}</td>
                    <td style={{ padding: "10px 0", textAlign: "right", color: "#D4775A" }}>{fmtEur(weekTicket)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══ 2 colonnes : Catégories + Top Produits ═══ */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Catégories */}
              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Catégories (aujourd&apos;hui)</h2>
                {categories.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center", padding: "20px 0" }}>Aucune donnée</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <tbody>
                      {categories.map(c => (
                        <tr key={c.name} style={{ borderBottom: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "8px 0", fontWeight: 500 }}>{c.name}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>{fmtEur(c.ca)} €</td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: "#999", width: 50 }}>{c.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Top produits */}
              <div style={CARD}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Top produits (aujourd&apos;hui)</h2>
                {topProducts.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center", padding: "20px 0" }}>Aucune donnée</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                        <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Produit</th>
                        <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Qté</th>
                        <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, i) => (
                        <tr key={p.name} style={{ borderBottom: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "8px 0" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#D4775A", marginRight: 6 }}>#{i + 1}</span>
                            {p.name}
                          </td>
                          <td style={{ padding: "8px 0", textAlign: "right" }}>{p.quantity}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600 }}>{fmtEur(p.totalSales)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ═══ Pas de données ? ═══ */}
            {caToday === 0 && caSemaine === 0 && (
              <div style={{ ...CARD, textAlign: "center", padding: "40px 20px", background: `linear-gradient(135deg, ${etabColor}08 0%, ${etabColor}03 100%)`, border: `1px solid ${etabColor}20` }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>En attente de données</h3>
                <p style={{ fontSize: 13, color: "#666", maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
                  Les données de vente seront affichées dès que la caisse Popina enregistrera des transactions.
                  Vérifiez que l&apos;intégration est configurée dans les paramètres.
                </p>
                <Link href="/settings/etablissements" style={{
                  display: "inline-block", marginTop: 12, padding: "8px 16px", borderRadius: 8,
                  background: "#1a1a1a", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 600,
                }}>
                  Vérifier l&apos;intégration
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
