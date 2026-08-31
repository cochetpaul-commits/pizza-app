"use client";

import { useEffect, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { supabase } from "@/lib/supabaseClient";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { RequireRole } from "@/components/RequireRole";
import { PilotageRangeBar, usePilotageTopBar } from "@/components/ui/PilotageRangeBar";
import { usePilotageRange } from "@/lib/pilotageRange";

/**
 * Rentabilité — la cascade CA → marge brute → EBE.
 * Chaque ligne affiche sa source et son niveau de fiabilité : une donnée
 * partielle ou manquante ne doit jamais passer pour un chiffre certain.
 */

type Ligne = {
  poste: string;
  montant: number | null;
  statut: "ok" | "partiel" | "manquant";
  source: string;
  detail?: string;
};

type Data = {
  ca: { ht: number; ttc: number };
  theorique: { cout: number; caCouvert: number; pct: number; couverture: number } | null;
  lignes: Ligne[];
  margeBrute: { montant: number; pct: number; foodCostPct: number; fiable: boolean } | null;
  ebe: { montant: number; pct: number } | null;
  exploitationDetail: { libelle: string; montant: number }[];
  detailPennylane?: PosteDetail[];
  pennylane: boolean;
};
type LigneDetail = { date: string | null; fournisseur: string | null; libelle: string | null; montant: number; type: string };
type CatDetail = { categorie: string; total: number; nb: number; lignes: LigneDetail[] };
type PosteDetail = { poste: string; libelle: string; total: number; categories: CatDetail[] };

const fmtDate = (s: string | null) => (s ? new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "");
/** « Facture SAS MAEL - FB9373 (label généré) » → « FB9373 » · « Avoir SAS MAEL - FB9282 » → « Avoir FB9282 » */
function libelleCourt(libelle: string | null, fournisseur: string | null): string | null {
  if (!libelle) return null;
  let l = libelle.replace(/\s*\(label généré\)/i, "").trim();
  const m = l.match(/^(Facture|Avoir)\s+(.+?)\s+-\s+(.+)$/i);
  if (m) l = (m[1].toLowerCase() === "avoir" ? "Avoir " : "") + m[3].trim();
  if (fournisseur && l.toLowerCase() === fournisseur.toLowerCase()) return null;
  return l;
}

/** Charges par catégorie Pennylane : poste ▸ catégorie ▸ factures */
function DetailPennylane({ postes }: { postes: PosteDetail[] }) {
  const total = postes.reduce((a, p) => a + p.total, 0);
  return (
    <div style={{ ...CARD, padding: "6px 18px 10px" }}>
      <style>{`.pl-det > summary::-webkit-details-marker{display:none} .pl-det > summary .chev{display:inline-block;transition:transform .15s} .pl-det[open] > summary .chev{transform:rotate(90deg)}`}</style>
      <div style={{ ...SEC, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
        <span>Charges par catégorie Pennylane</span>
        <span style={{ color: "#1a1a1a" }}>{eur(total)}</span>
      </div>
      {postes.map(p => (
        <details key={p.poste} className="pl-det" style={{ borderBottom: "1px solid #f0ebe3" }}>
          <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer", listStyle: "none", fontSize: 13.5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#1a1a1a", fontWeight: 600 }}>
              <span className="chev" style={{ fontSize: 10, color: "#999" }}>▶</span>{p.libelle}
              <span style={{ fontSize: 11, color: "#999", fontWeight: 500 }}>{p.categories.length} catégorie{p.categories.length > 1 ? "s" : ""}</span>
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{eur(p.total)}</span>
          </summary>
          <div style={{ paddingLeft: 18, paddingBottom: 6 }}>
            {p.categories.map(c => (
              <details key={c.categorie} className="pl-det">
                <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer", listStyle: "none", fontSize: 12.5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#1a1a1a" }}>
                    <span className="chev" style={{ fontSize: 9, color: "#bbb" }}>▶</span>{c.categorie}
                    <span style={{ fontSize: 11, color: "#999" }}>{c.nb} ligne{c.nb > 1 ? "s" : ""}</span>
                  </span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{eur(c.total)}</span>
                </summary>
                <div style={{ paddingLeft: 17, paddingBottom: 6 }}>
                  {c.lignes.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 12, color: "#6f6a61" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ color: "#999", marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{fmtDate(l.date)}</span>
                        {l.fournisseur ?? (l.type === "transaction" ? "Transaction bancaire" : "—")}
                        {(() => { const lc = libelleCourt(l.libelle, l.fournisseur); return lc ? <span style={{ color: "#999" }}> · {lc}</span> : null; })()}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{l.montant.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </details>
      ))}
      <div style={{ fontSize: 10.5, color: "#999", marginTop: 8 }}>
        Catégories telles que définies dans Pennylane (HT, ventilées au prorata quand une facture a plusieurs catégories). Les lignes sans facture (paie, URSSAF, gérants) viennent des transactions bancaires.
      </div>
    </div>
  );
}

const eur = (n: number) => Math.round(n).toLocaleString("fr-FR") + " €";
const pct = (n: number) => n.toFixed(1).replace(".", ",") + " %";

const CARD: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8", borderRadius: 14, padding: "16px 18px", marginBottom: 12,
};
const SEC: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase",
  letterSpacing: 0.6, marginBottom: 10,
};

function Statut({ s }: { s: Ligne["statut"] }) {
  const map = {
    ok: { t: "vérifié", bg: "rgba(45,106,79,0.10)", c: "#2D6A4F" },
    partiel: { t: "partiel", bg: "rgba(180,83,9,0.12)", c: "#b45309" },
    manquant: { t: "source à brancher", bg: "rgba(220,38,38,0.09)", c: "#b3261e" },
  }[s];
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: map.bg, color: map.c, whiteSpace: "nowrap" }}>
      {map.t}
    </span>
  );
}

export default function RentabilitePage() {
  const { current: etab } = useEtablissement();
  const { isGroupAdmin } = useProfile();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [reload, setReload] = useState(0);
  // Période commune Pilotage (mémorisée) ; par défaut le mois en cours
  const [period, setPeriod] = usePilotageRange(() => {
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: d.toISOString().slice(0, 10) };
  });
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Jamais « choisis un établissement » ici : auto-sélection du dernier resto
  useEtabAuto();
  // Sur mobile : sélecteur dans le bandeau du haut, comme la page Ventes
  usePilotageTopBar(period, setPeriod, etab?.couleur ?? "#D4775A");

  // Chargement : dépendances scalaires uniquement (pas de useCallback —
  // le compilateur React refuse la mémoïsation manuelle ici).
  useEffect(() => {
    const etabId = etab?.id;
    // Vue groupe : pas de calcul possible
    if (!etabId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErr("");
    fetch(`/api/rentabilite?etablissement_id=${etabId}&from=${period.from}&to=${period.to}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setErr(json.error ?? "Erreur");
        else setData(json as Data);
      })
      .catch(() => { if (!cancelled) setErr("Erreur réseau"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [etab?.id, period.from, period.to, reload]);


  // Rapatrie les factures et charges Pennylane du mois affiché
  const syncPennylane = async () => {
    if (!etab?.id || syncing) return;
    setSyncing(true); setSyncMsg("");
    const { data: sess } = await supabase.auth.getSession();
    try {
      const res = await fetch("/api/pennylane/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
        body: JSON.stringify({ etablissement_id: etab.id, mois: period.from.slice(0, 8) + "01" }),
      });
      const json = await res.json();
      if (!res.ok) setSyncMsg(json.error ?? "Erreur");
      else {
        const r = json.resultats?.[0];
        setSyncMsg(r?.erreur ? `Erreur : ${r.erreur}` : `${r?.factures ?? 0} factures rapatriées`);
        setReload(n => n + 1);
      }
    } catch { setSyncMsg("Erreur réseau"); }
    setSyncing(false);
  };

  return (
    <RequireRole permission="performances.pilotage">
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div className="period-sticky" style={{ margin: "-24px -16px 16px", padding: "10px 16px" }}><PilotageRangeBar value={period} onChange={setPeriod} accent={etab?.couleur ?? "#D4775A"} /></div>

        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: "0 0 4px",
        }}>
          Rentabilité
        </h1>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", margin: "0 0 18px" }}>
          <p style={{ fontSize: 12.5, color: "#999", margin: 0 }}>
            {etab?.nom} · du chiffre d&apos;affaires réel à la marge, source par source.
          </p>
          {isGroupAdmin && etab && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {syncMsg && <span style={{ fontSize: 11, color: syncMsg.startsWith("Erreur") ? "#DC2626" : "#2D6A4F", fontWeight: 600 }}>{syncMsg}</span>}
              <button type="button" onClick={syncPennylane} disabled={syncing} style={{
                padding: "7px 14px", borderRadius: 9, border: "1px solid #ddd6c8",
                background: "#fff", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
                cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1,
              }}>
                {syncing ? "Synchronisation…" : "⟳ Synchroniser Pennylane"}
              </button>
            </div>
          )}
        </div>

        {loading && <p style={{ color: "#999", fontSize: 13 }}>Calcul en cours…</p>}
        {!loading && !etab && (
          <div style={{ ...CARD, textAlign: "center", color: "#999", fontSize: 13 }}>
            Choisis un établissement dans le menu de gauche — la rentabilité se calcule par restaurant.
          </div>
        )}
        {!loading && err && <div style={{ ...CARD, color: "#DC2626", fontSize: 13 }}>{err}</div>}

        {!loading && data && (
          <>
            {/* CA */}
            <div style={CARD}>
              <div style={SEC}>Chiffre d&apos;affaires</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 30, fontWeight: 700, color: "#1a1a1a" }}>
                  {eur(data.ca.ht)}
                </span>
                <span style={{ fontSize: 12, color: "#999" }}>HT · {eur(data.ca.ttc)} TTC</span>
                <Statut s="ok" />
              </div>
              <div style={{ fontSize: 10.5, color: "#999", marginTop: 3 }}>Caisse Popina, ventes réelles</div>
            </div>

            {/* Cascade */}
            <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
              <div style={{ ...SEC, padding: "16px 18px 0", marginBottom: 0 }}>Cascade</div>
              {data.lignes.map((l, i) => (
                <div key={l.poste} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 18px",
                  borderBottom: i < data.lignes.length - 1 ? "1px solid #f0ebe3" : "none",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1a1a1a" }}>− {l.poste}</span>
                      <Statut s={l.statut} />
                    </div>
                    <div style={{ fontSize: 10.5, color: "#999", marginTop: 2 }}>
                      {l.source}{l.detail ? ` — ${l.detail}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    color: l.montant == null ? "#ccc" : l.montant < 0 ? "#2D6A4F" : "#b3261e",
                  }}>
                    {l.montant == null ? "—" : eur(l.montant)}
                  </span>
                </div>
              ))}
            </div>

            {/* Marge brute */}
            <div style={{ ...CARD, background: data.margeBrute ? "rgba(45,106,79,0.05)" : "#fff", borderColor: data.margeBrute ? "rgba(45,106,79,0.25)" : "#ddd6c8" }}>
              <div style={SEC}>Marge brute</div>
              {data.margeBrute ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#2D6A4F" }}>
                      {eur(data.margeBrute.montant)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#2D6A4F" }}>{pct(data.margeBrute.pct)} du CA</span>
                    <Statut s={data.margeBrute.fiable ? "ok" : "partiel"} />
                  </div>
                  <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 4 }}>
                    Coût matière réel : <b>{pct(data.margeBrute.foodCostPct)}</b> du CA
                    {!data.margeBrute.fiable && " — chiffre incomplet tant que les achats et le stock ne sont pas branchés"}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#999", margin: 0 }}>En attente des achats matières.</p>
              )}
            </div>

            {/* Écart théorique / réel */}
            {data.theorique && (
              <div style={CARD}>
                <div style={SEC}>Coût matière théorique</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>
                    {pct(data.theorique.pct)}
                  </span>
                  <span style={{ fontSize: 12, color: "#999" }}>
                    soit {eur(data.theorique.cout)} sur {eur(data.theorique.caCouvert)} de ventes reconnues
                  </span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, data.theorique.couverture)}%`, background: "#D4775A", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: "#999", marginTop: 3 }}>
                    {pct(data.theorique.couverture)} du CA rattaché à une fiche recette — plus la couverture monte, plus la comparaison au réel est juste.
                  </div>
                </div>
                {data.margeBrute?.fiable && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(37,99,235,0.06)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb" }}>Écart théorique / réel</div>
                    <div style={{ fontSize: 12.5, color: "#1a1a1a", marginTop: 2 }}>
                      {pct(Math.abs(data.margeBrute.foodCostPct - data.theorique.pct))} d&apos;écart — casse, offerts, portions, pertes.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EBE */}
            <div style={{ ...CARD, background: data.ebe ? "rgba(212,119,90,0.07)" : "#fff", borderColor: data.ebe ? "rgba(212,119,90,0.3)" : "#ddd6c8" }}>
              <div style={SEC}>EBE</div>
              {data.ebe ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 30, fontWeight: 700, color: "#b0562f" }}>
                    {eur(data.ebe.montant)}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#b0562f" }}>{pct(data.ebe.pct)} du CA</span>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
                  Il manque la masse salariale chargée (Silae / DSN) et les charges d&apos;exploitation (Pennylane).
                </p>
              )}
            </div>

            {/* Catégories Pennylane, dépliables jusqu'aux factures */}
            {data.detailPennylane && data.detailPennylane.length > 0 && <DetailPennylane postes={data.detailPennylane} />}

            {/* Détail exploitation (résumé par poste) */}
            {(!data.detailPennylane || data.detailPennylane.length === 0) && data.exploitationDetail.length > 0 && (
              <div style={{ ...CARD, padding: "6px 18px" }}>
                <div style={{ ...SEC, paddingTop: 12 }}>Détail des charges</div>
                {data.exploitationDetail.map((d, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0",
                    borderBottom: i < data.exploitationDetail.length - 1 ? "1px solid #f0ebe3" : "none",
                    fontSize: 13,
                  }}>
                    <span style={{ color: "#1a1a1a" }}>{d.libelle}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{eur(d.montant)}</span>
                  </div>
                ))}
              </div>
            )}

            {!data.pennylane && (
              <p style={{ fontSize: 11.5, color: "#999", marginTop: 10 }}>
                Pennylane n&apos;est pas encore connecté à l&apos;application : les achats affichés ne couvrent que
                les factures scannées. Une clé API (Pennylane → Paramètres → API) rendra la cascade complète
                et automatique.
              </p>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
