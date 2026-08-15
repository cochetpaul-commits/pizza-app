"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PeriodSelector, currentPeriod, type PeriodValue, type PeriodMode } from "@/components/PeriodSelector";

/* ── Types (réponse /api/mon-tableau) ─────────────────────── */

type AttacheGroup = { key: string; label: string };

type OpStats = {
  ca: number; tickets: number; couverts: number;
  ticketMoyen: number; caParCouvert: number;
  attaches: Record<string, number>;
};

type CatLine = { cat: string; ca: number; qty: number; prevCa: number };
type ProdLine = { name: string; ca: number; qty: number; cat: string };

type ApiData = {
  employe: { prenom: string; poste: string | null; equipe: string | null; operateur: string | null; profile: "bar" | "cuisine" | "salle" };
  period: { from: string; to: string };
  empty: boolean;
  error?: string;
  bar?: { caBoissons: number; prevCaBoissons: number; caTotal: number; pctBoissons: number; parCategorie: CatLine[]; topProduits: ProdLine[] };
  cuisine?: { caFood: number; prevCaFood: number; caTotal: number; pctFood: number; parCategorie: CatLine[]; topProduits: ProdLine[] };
  salle?: { me: OpStats | null; team: OpStats | null; teamSize: number; attacheGroups: AttacheGroup[]; hasOperateur: boolean };
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

/* ── Page ─────────────────────────────────────────────────── */

export default function MonTableauPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => currentPeriod("semaine"));
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
        else setData(json as ApiData);
      } catch {
        if (!cancelled) setErr("Erreur réseau");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [period.from, period.to]);

  const onModeChange = (mode: PeriodMode) => setPeriod(currentPeriod(mode));

  const profile = data?.employe?.profile;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px" }}>
      <PeriodSelector period={period} onPeriodChange={setPeriod} onModeChange={onModeChange} />

      {/* En-tête */}
      {data?.employe && (
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            {profile === "bar" ? "🍸 " : profile === "cuisine" ? "👨‍🍳 " : "🍽️ "}
            Mon tableau de bord
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
