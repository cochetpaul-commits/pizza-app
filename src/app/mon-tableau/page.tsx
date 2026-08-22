"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DateRangePicker, shiftRange, type DateRange } from "@/components/ui/DateRangePicker";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useTopBar } from "@/components/layout/TopBarContext";

/* ── Types (réponse /api/mon-tableau) ─────────────────────── */

type AttacheGroup = { key: string; label: string };

type OpStats = {
  ca: number; tickets: number; couverts: number;
  ticketMoyen: number; caParCouvert: number;
  attaches: Record<string, number>;
};

type CatLine = { cat: string; ca: number; qty: number; prevCa: number };
type ProdLine = { name: string; ca: number; qty: number; cat: string; sousCat?: string | null };

type ApiData = {
  admin?: boolean;
  employe?: { prenom: string; poste: string | null; equipe: string | null; operateur: string | null; profile: "manager" | "bar" | "cuisine" | "salle" };
  period?: { from: string; to: string };
  empty?: boolean;
  error?: string;
  bar?: { caBoissons: number; prevCaBoissons: number; caTotal: number; pctBoissons: number; parCategorie: CatLine[]; topProduits: ProdLine[]; detail?: ProdLine[] };
  cuisine?: { caFood: number; prevCaFood: number; caTotal: number; pctFood: number; parCategorie: CatLine[]; topProduits: ProdLine[]; detail?: ProdLine[] };
  salle?: { me: OpStats | null; team: OpStats | null; teamSize: number; attacheGroups: AttacheGroup[]; hasOperateur: boolean };
  manager?: {
    totals: { ca: number; prevCa: number; tickets: number; couverts: number; ticketMoyen: number; caParCouvert: number };
    operateurs: ({ op: string } & OpStats)[];
    teamAvgAttaches: Record<string, number>;
    attacheGroups: AttacheGroup[];
    myOp: string | null;
  };
};

/* ── Helpers ──────────────────────────────────────────────── */

const fmtEur = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
const fmtEur2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const fmtPct = (n: number) => Math.round(n) + " %";

const ACCENT = "#D4775A";

const CAT_LABELS: Record<string, string> = {
  PIZZE: "Pizze", CUCINA: "Cucina", ANTIPASTI: "Antipasti", DOLCI: "Dolci",
  VINI: "Vins", ALCOOL: "Alcool", BEVANDE: "Softs & Mocktails",
  "BEVANDE CALDE": "Cafés / Chaud", DIGESTIVI: "Digestifs",
};

const CAT_COLORS: Record<string, string> = {
  PIZZE: "#c94c2c", CUCINA: "#8a6b3e", ANTIPASTI: "#D4775A", DOLCI: "#b5904a",
  VINI: "#7c5c3a", ALCOOL: "#c15f2e", BEVANDE: "#5e7a8a",
  "BEVANDE CALDE": "#6f5c3a", DIGESTIVI: "#46655a",
};

function delta(cur: number, prev: number): { txt: string; color: string } | null {
  if (prev <= 0) return null;
  const d = ((cur - prev) / prev) * 100;
  const sign = d >= 0 ? "+" : "";
  return { txt: `${sign}${Math.round(d)} % vs période préc.`, color: d >= 0 ? "#2D6A4F" : "#DC2626" };
}

/* ── UI blocks ────────────────────────────────────────────── */

function KpiCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, fontWeight: 600, color: subColor ?? "#999", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Barre comparant ma valeur à la moyenne équipe. */
function VsBar({ label, mine, team, fmt }: { label: string; mine: number; team: number | null; fmt: (n: number) => string }) {
  const max = Math.max(mine, team ?? 0, 1);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        <span style={{ color: "#1a1a1a" }}>{label}</span>
        <span style={{ color: ACCENT }}>{fmt(mine)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#f0ebe3", position: "relative", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(mine / max) * 100}%`, background: ACCENT, borderRadius: 4 }} />
        {team != null && (
          <div title="Moyenne équipe" style={{ position: "absolute", top: -2, bottom: -2, left: `${(team / max) * 100}%`, width: 2, background: "#1a1a1a" }} />
        )}
      </div>
      {team != null && (
        <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>moyenne équipe : {fmt(team)}</div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase",
      letterSpacing: "0.12em", margin: "22px 0 10px",
      fontFamily: "var(--font-oswald), Oswald, sans-serif",
    }}>{children}</div>
  );
}

function CatSplit({ lines, total }: { lines: CatLine[]; total: number }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px" }}>
      {lines.map(l => {
        const pct = total > 0 ? (l.ca / total) * 100 : 0;
        const d = delta(l.ca, l.prevCa);
        const color = CAT_COLORS[l.cat] ?? ACCENT;
        return (
          <div key={l.cat} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              <span style={{ color: "#1a1a1a" }}>{CAT_LABELS[l.cat] ?? l.cat} <span style={{ color: "#999", fontWeight: 400 }}>· {l.qty.toLocaleString("fr-FR")} vendus</span></span>
              <span style={{ color }}>{fmtEur(l.ca)} <span style={{ color: "#999", fontWeight: 400 }}>({Math.round(pct)} %)</span></span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
            </div>
            {d && <div style={{ fontSize: 10, color: d.color, marginTop: 2, fontWeight: 600 }}>{d.txt}</div>}
          </div>
        );
      })}
    </div>
  );
}

function TopProduits({ prods, unit }: { prods: ProdLine[]; unit: "ca" | "qty" }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "6px 16px" }}>
      {prods.map((p, i) => (
        <div key={p.name} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
          borderBottom: i < prods.length - 1 ? "1px solid #f0ebe3" : "none",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#b0a894", width: 18, flexShrink: 0 }}>{i + 1}</span>
          <div className="produit-main">
            <span className="produit-name" style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</span>
          </div>
          <span style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>{p.qty.toLocaleString("fr-FR")}×</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: unit === "ca" ? ACCENT : "#1a1a1a", flexShrink: 0, minWidth: 64, textAlign: "right" }}>{fmtEur(p.ca)}</span>
        </div>
      ))}
    </div>
  );
}

/** Détail complet des ventes, groupé par famille — chaque famille se déplie. */
function DetailProduits({ prods }: { prods: ProdLine[] }) {
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  const groupes = new Map<string, ProdLine[]>();
  for (const p of prods) {
    const g = groupes.get(p.cat) ?? [];
    g.push(p);
    groupes.set(p.cat, g);
  }
  const ordre = [...groupes.entries()].sort(
    (a, b) => b[1].reduce((s, p) => s + p.ca, 0) - a[1].reduce((s, p) => s + p.ca, 0),
  );
  const toggle = (cat: string) => setOuverts(prev => {
    const n = new Set(prev);
    if (n.has(cat)) n.delete(cat); else n.add(cat);
    return n;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ordre.map(([cat, items]) => {
        const caCat = items.reduce((s, p) => s + p.ca, 0);
        const qtyCat = items.reduce((s, p) => s + p.qty, 0);
        const color = CAT_COLORS[cat] ?? ACCENT;
        const ouvert = ouverts.has(cat);
        return (
          <div key={cat} style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, overflow: "hidden" }}>
            <button type="button" onClick={() => toggle(cat)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", border: "none", background: "none", cursor: "pointer",
              borderLeft: `3px solid ${color}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", flex: 1, textAlign: "left" }}>
                {CAT_LABELS[cat] ?? cat}
                <span style={{ color: "#999", fontWeight: 400 }}> · {items.length} produit{items.length > 1 ? "s" : ""} · {qtyCat.toLocaleString("fr-FR")} vendus</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmtEur(caCat)}</span>
              <span style={{ fontSize: 11, color: "#999", transform: ouvert ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
            </button>
            {ouvert && (
              <div style={{ padding: "0 16px 8px" }}>
                {items.map((p, i) => (
                  <div key={p.name} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: i < items.length - 1 ? "1px solid #f0ebe3" : "none",
                  }}>
                    <div className="produit-main">
                      <span className="produit-name" style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</span>
                      {p.sousCat && <span style={{ fontSize: 10, color: "#999", display: "block" }}>{p.sousCat}</span>}
                    </div>
                    <span style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>{p.qty.toLocaleString("fr-FR")}×</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1a1a1a", flexShrink: 0, minWidth: 60, textAlign: "right" }}>{fmtEur(p.ca)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

function semaineCourante(): DateRange {
  const now = new Date();
  const lundi = new Date(now);
  lundi.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(lundi), to: iso(now) };
}

export default function MonTableauPage() {
  const router = useRouter();
  const [period, setPeriod] = usePilotageRange(semaineCourante);
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Même date-ranker que Pilotage/Ventes : dans le bandeau du haut sur
  // mobile, barre sticky sur ordinateur.
  const topBar = useTopBar();
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const atToday = period.to >= today;
    topBar.set({
      actions: (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" aria-label="Période précédente" onClick={() => setPeriod(shiftRange(period, -1))} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce",
            background: "#fff", color: ACCENT, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <DateRangePicker value={period} onChange={setPeriod} format="short" />
          <button type="button" aria-label="Période suivante" onClick={() => { if (!atToday) setPeriod(shiftRange(period, 1)); }} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid #e0d8ce",
            background: atToday ? "#f0ebe3" : "#fff", color: atToday ? "#ccc" : ACCENT,
            cursor: atToday ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      ),
    });
    return () => topBar.clear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.from, period.to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setErr("Non connecté"); setLoading(false); return; }
      try {
        const res = await fetch(`/api/mon-tableau?from=${period.from}&to=${period.to}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) { setErr(json.error ?? "Erreur"); setData(null); }
        else if ((json as ApiData).admin) {
          // Admins : vision globale — redirection vers l'accueil groupe
          router.replace("/dashboard");
          return;
        }
        else setData(json as ApiData);
      } catch {
        if (!cancelled) setErr("Erreur réseau");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.from, period.to]);

  const profile = data?.employe?.profile;
  const today = new Date().toISOString().slice(0, 10);
  const atToday = period.to >= today;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 60px" }}>
      {/* Barre de période sticky (ordinateur) — masquée sur mobile où le
          ranker vit dans le bandeau du haut, comme sur Ventes */}
      <div className="montableau-periodbar" style={{
        position: "sticky", top: 0, zIndex: 60,
        display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
        margin: "-16px -16px 12px", padding: "10px 16px",
        background: "rgba(242,237,228,0.88)",
        backdropFilter: "blur(14px) saturate(160%)", WebkitBackdropFilter: "blur(14px) saturate(160%)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
      }}>
        <button type="button" aria-label="Période précédente" onClick={() => setPeriod(shiftRange(period, -1))} style={{
          width: 32, height: 32, borderRadius: 10, border: "1px solid #e0d8ce",
          background: "#fff", color: ACCENT, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <DateRangePicker value={period} onChange={setPeriod} format="short" />
        <button type="button" aria-label="Période suivante" onClick={() => { if (!atToday) setPeriod(shiftRange(period, 1)); }} style={{
          width: 32, height: 32, borderRadius: 10, border: "1px solid #e0d8ce",
          background: atToday ? "#f0ebe3" : "#fff", color: atToday ? "#ccc" : ACCENT,
          cursor: atToday ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 767px) { .montableau-periodbar { display: none !important; } }
      `}} />

      {/* En-tête */}
      {data?.employe && (
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            {profile === "manager" ? "📊 Tableau de mon équipe"
              : `${profile === "bar" ? "🍸" : profile === "cuisine" ? "👨‍🍳" : "🍽️"} Mon tableau de bord`}
          </h1>
          <div style={{ fontSize: 13, color: "#999", marginTop: 2 }}>
            {data.employe.prenom}
            {data.employe.poste ? ` · ${data.employe.poste}` : ""}
            {data.employe.equipe ? ` (${data.employe.equipe})` : ""}
          </div>
        </div>
      )}

      {loading && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 40 }}>Chargement…</p>}
      {!loading && err && (
        <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 24, textAlign: "center", fontSize: 13, color: "#999" }}>
          {err === "Aucune fiche employé liée à ce compte"
            ? "Ton compte n'est pas encore relié à une fiche employé. Demande à un responsable de t'inviter depuis Paramètres → Employés."
            : err}
        </div>
      )}
      {!loading && !err && data?.empty && (
        <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 24, textAlign: "center", fontSize: 13, color: "#999" }}>
          Aucune vente sur cette période. {""}
          (Piccola Mia n&apos;est pas encore connectée à la caisse Kezia — les chiffres arrivent avec Bello Mio.)
        </div>
      )}

      {/* ═══ MANAGER : vue équipe ═══ */}
      {!loading && !err && data?.manager && (() => {
        const m = data.manager!;
        const d = delta(m.totals.ca, m.totals.prevCa);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <KpiCard label="CA de la période" value={fmtEur(m.totals.ca)} sub={d?.txt} subColor={d?.color} />
              <KpiCard label="Tickets" value={String(m.totals.tickets)} sub={`${m.totals.couverts} couverts`} />
              <KpiCard label="Ticket moyen" value={fmtEur2(m.totals.ticketMoyen)} sub={`panier/couvert : ${fmtEur2(m.totals.caParCouvert)}`} />
            </div>

            <SectionTitle>Par serveur</SectionTitle>
            <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "6px 16px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 420 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Serveur</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>CA</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Tickets</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Couverts</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Ticket moy.</th>
                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Desserts</th>
                  </tr>
                </thead>
                <tbody>
                  {m.operateurs.map(o => {
                    const isMe = m.myOp && o.op === m.myOp;
                    return (
                      <tr key={o.op} style={{ borderBottom: "1px solid #f0ebe3", background: isMe ? "rgba(212,119,90,0.06)" : "transparent" }}>
                        <td style={{ padding: "9px 0", fontWeight: isMe ? 700 : 600, color: isMe ? ACCENT : "#1a1a1a" }}>
                          {o.op}{isMe ? " (moi)" : ""}
                        </td>
                        <td style={{ padding: "9px 0", textAlign: "right", fontWeight: 700 }}>{fmtEur(o.ca)}</td>
                        <td style={{ padding: "9px 0", textAlign: "right" }}>{o.tickets}</td>
                        <td style={{ padding: "9px 0", textAlign: "right" }}>{o.couverts}</td>
                        <td style={{ padding: "9px 0", textAlign: "right" }}>{fmtEur2(o.ticketMoyen)}</td>
                        <td style={{ padding: "9px 0", textAlign: "right" }}>{fmtPct(o.attaches.dolci ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <SectionTitle>Attaches de l&apos;équipe (moyenne)</SectionTitle>
            <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px" }}>
              {m.attacheGroups.map(g => (
                <VsBar key={g.key} label={g.label} mine={m.teamAvgAttaches[g.key] ?? 0} team={null} fmt={fmtPct} />
              ))}
            </div>
          </>
        );
      })()}

      {/* ═══ BAR ═══ */}
      {!loading && !err && data?.bar && (() => {
        const b = data.bar!;
        const d = delta(b.caBoissons, b.prevCaBoissons);
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <KpiCard label="CA Boissons" value={fmtEur(b.caBoissons)} sub={d?.txt} subColor={d?.color} />
              <KpiCard label="Part du CA total" value={fmtPct(b.pctBoissons)} sub={`CA total : ${fmtEur(b.caTotal)}`} />
            </div>
            <SectionTitle>Par famille</SectionTitle>
            <CatSplit lines={b.parCategorie} total={b.caBoissons} />
            <SectionTitle>Top produits boissons</SectionTitle>
            <TopProduits prods={b.topProduits} unit="ca" />
            {b.detail && b.detail.length > 0 && (
              <>
                <SectionTitle>Le détail — toutes les boissons vendues</SectionTitle>
                <DetailProduits prods={b.detail} />
              </>
            )}
          </>
        );
      })()}

      {/* ═══ CUISINE ═══ */}
      {!loading && !err && data?.cuisine && (() => {
        const c = data.cuisine!;
        const d = delta(c.caFood, c.prevCaFood);
        const pizze = c.parCategorie.find(x => x.cat === "PIZZE");
        const cucina = c.parCategorie.find(x => x.cat === "CUCINA");
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <KpiCard label="CA Food" value={fmtEur(c.caFood)} sub={d?.txt} subColor={d?.color} />
              <KpiCard label="Part du CA total" value={fmtPct(c.pctFood)} sub={`CA total : ${fmtEur(c.caTotal)}`} />
            </div>
            {/* Pizza vs Cucina */}
            {pizze && cucina && (pizze.ca + cucina.ca) > 0 && (
              <>
                <SectionTitle>Pizza vs Cucina</SectionTitle>
                <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span style={{ color: CAT_COLORS.PIZZE }}>🍕 Pizze · {fmtEur(pizze.ca)}</span>
                    <span style={{ color: CAT_COLORS.CUCINA }}>Cucina · {fmtEur(cucina.ca)} 🍝</span>
                  </div>
                  <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden" }}>
                    <div style={{ width: `${(pizze.ca / (pizze.ca + cucina.ca)) * 100}%`, background: CAT_COLORS.PIZZE }} />
                    <div style={{ flex: 1, background: CAT_COLORS.CUCINA }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999", marginTop: 4 }}>
                    <span>{Math.round((pizze.ca / (pizze.ca + cucina.ca)) * 100)} % · {pizze.qty.toLocaleString("fr-FR")} pizze</span>
                    <span>{Math.round((cucina.ca / (pizze.ca + cucina.ca)) * 100)} % · {cucina.qty.toLocaleString("fr-FR")} plats</span>
                  </div>
                </div>
              </>
            )}
            <SectionTitle>Par famille</SectionTitle>
            <CatSplit lines={c.parCategorie} total={c.caFood} />
            <SectionTitle>Top produits (en quantité)</SectionTitle>
            <TopProduits prods={c.topProduits} unit="qty" />
            {c.detail && c.detail.length > 0 && (
              <>
                <SectionTitle>Le détail — tous les plats vendus</SectionTitle>
                <DetailProduits prods={c.detail} />
              </>
            )}
          </>
        );
      })()}

      {/* ═══ SALLE ═══ */}
      {!loading && !err && data?.salle && (() => {
        const s = data.salle!;
        if (!s.hasOperateur || !s.me) {
          return (
            <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 24, textAlign: "center", fontSize: 13, color: "#999" }}>
              Ton nom d&apos;opérateur Popina n&apos;est pas renseigné sur ta fiche.
              Demande à un responsable de l&apos;ajouter (Paramètres → Employés → ta fiche → « Caisse Popina »).
            </div>
          );
        }
        const me = s.me;
        const team = s.team;
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              <KpiCard label="Mes ventes" value={fmtEur(me.ca)} sub={team ? `équipe (moy.) : ${fmtEur(team.ca)}` : undefined} />
              <KpiCard label="Mes tickets" value={String(me.tickets)} sub={team ? `équipe (moy.) : ${Math.round(team.tickets)}` : undefined} />
              <KpiCard label="Mes couverts" value={String(me.couverts)} sub={team ? `équipe (moy.) : ${Math.round(team.couverts)}` : undefined} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
              <KpiCard label="Ticket moyen" value={fmtEur2(me.ticketMoyen)} sub={team ? `équipe : ${fmtEur2(team.ticketMoyen)}` : undefined}
                subColor={team ? (me.ticketMoyen >= team.ticketMoyen ? "#2D6A4F" : "#DC2626") : undefined} />
              <KpiCard label="Panier / couvert" value={fmtEur2(me.caParCouvert)} sub={team ? `équipe : ${fmtEur2(team.caParCouvert)}` : undefined}
                subColor={team ? (me.caParCouvert >= team.caParCouvert ? "#2D6A4F" : "#DC2626") : undefined} />
            </div>

            <SectionTitle>Mes attaches (% de mes tables) — trait noir = moyenne équipe</SectionTitle>
            <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px" }}>
              {s.attacheGroups.map(g => (
                <VsBar
                  key={g.key}
                  label={g.label}
                  mine={me.attaches[g.key] ?? 0}
                  team={team ? (team.attaches[g.key] ?? 0) : null}
                  fmt={fmtPct}
                />
              ))}
            </div>
            {team && (
              <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
                Moyenne calculée sur {s.teamSize} opérateur{s.teamSize > 1 ? "s" : ""} actif{s.teamSize > 1 ? "s" : ""} sur la période.
              </p>
            )}
          </>
        );
      })()}
    </div>
  );
}
