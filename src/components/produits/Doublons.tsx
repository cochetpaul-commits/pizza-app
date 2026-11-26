"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import type { DuplicatePair } from "@/lib/duplicateDetection";
import { useDoublons } from "@/lib/useDoublons";
import { useDoublonsEcartes } from "@/lib/doublonsEcartes";
import { CAT_COLORS, CAT_LABELS, type Category, type Ingredient } from "@/types/ingredients";
import { couleurTexte } from "@/lib/styleCategories";
import { EtatVide } from "@/components/ui/EtatVide";
import { Chargement } from "@/components/analyse/Blocs";
import { ATTENTION, BON, BORD, BTN, CADRE, CHAMP, FAIBLE, MAUVAIS, MUTED, TD, TH, alpha, h1, liseret, pastille } from "@/components/ui/charte";
import { useVoirMontants } from "@/lib/useVoirMontants";

/**
 * Base produits › Doublons probables (page à part, 29/10/2026). Même détection que la tuile de la Base
 * produits : deux fiches actives du même fournisseur dont les noms se ressemblent à 80 % ou plus
 * (accents, casse et ponctuation ignorés). Pour chaque paire on garde une fiche ; l'autre est fusionnée
 * dedans par /api/ingredients/merge (prix, lignes de recettes, mouvements réaffectés, puis suppression).
 * Depuis le 22/11/2026 (demande de Paul) : on choisit pour chaque paire « Fusionner » ou « Pas un doublon », rien ne
 * part tout de suite, puis on valide tous les choix d'un coup. L'ancien « Tout fusionner » fusionnait aussi des
 * produits seulement voisins (gants taille L et taille M).
 */
type Choix = "fusion" | "non";

type OffreDoublon = { unit_price: number | null; unit: string | null; pack_price: number | null; valid_from?: string | null; created_at?: string | null };
const dateCourte = (d: string | null | undefined) => (d ? new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }) : null);
const prixOffre = (o: OffreDoublon | undefined) => {
  if (!o) return null;
  const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  if (o.unit_price != null && o.unit_price > 0) return `${eur(o.unit_price)} / ${o.unit === "pc" ? "pièce" : o.unit ?? "u"}`;
  if (o.pack_price != null && o.pack_price > 0) return `${eur(o.pack_price)} le colis`;
  return null;
};
const dateOffre = (o: OffreDoublon | undefined) => (o ? (o.valid_from ?? o.created_at ?? null) : null);

export function Doublons() {
  const bureau = useBureau();
  // Prix d'achat : responsables seulement ; les autres voient « prix connu » ou « sans prix »
  const voirMontants = useVoirMontants();
  const prix = (o: OffreDoublon | undefined) => { const t = prixOffre(o); return t && !voirMontants ? "prix connu" : t; };
  // Paires écartées : partagées entre appareils depuis le 24/11/2026 (table doublons_ecartes)
  const { ignores, pret: ignoresPrets, erreur: erreurEcartes, ecarter } = useDoublonsEcartes();
  const [q, setQ] = useState("");
  const [garde, setGarde] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [faits, setFaits] = useState<Set<string>>(new Set());
  const [supprimes, setSupprimes] = useState<Set<string>>(new Set());
  const [fusionnes, setFusionnes] = useState(0);
  const [tout, setTout] = useState<{ fait: number; total: number } | null>(null);
  const [choix, setChoix] = useState<Record<string, Choix>>({});
  const [version, setVersion] = useState(0);
  const etat = useDoublons(ignores, version);

  const paires = useMemo(() => {
    const low = q.trim().toLowerCase();
    return etat.paires
      .filter((p) => !supprimes.has(p.a.id) && !supprimes.has(p.b.id) && !faits.has(p.pairKey))
      .filter((p) => !low || p.a.name.toLowerCase().includes(low) || p.b.name.toLowerCase().includes(low))
      .sort((x, y) => x.a.name.localeCompare(y.a.name, "fr"));
  }, [etat.paires, faits, supprimes, q]);

  // Fiche à garder par défaut (26/11/2026) : celle qui a un prix, et entre deux prix le plus récent
  const offreDe = (id: string) => etat.offres.get(id) as unknown as OffreDoublon | undefined;
  const parDefaut = (p: DuplicatePair) => {
    const oa = prixOffre(offreDe(p.a.id)) ? offreDe(p.a.id) : undefined, ob = prixOffre(offreDe(p.b.id)) ? offreDe(p.b.id) : undefined;
    if (oa && !ob) return p.a.id;
    if (ob && !oa) return p.b.id;
    if (oa && ob) return (dateOffre(ob) ?? "") > (dateOffre(oa) ?? "") ? p.b.id : p.a.id;
    return p.a.id;
  };
  const gardee = (p: DuplicatePair) => garde[p.pairKey] ?? parDefaut(p);
  const choisir = (p: DuplicatePair, c: Choix) => setChoix((x) => { const n = { ...x }; if (n[p.pairKey] === c) delete n[p.pairKey]; else n[p.pairKey] = c; return n; });
  /** Le même choix sur toutes les paires affichées (le filtre compte), ou tout effacer */
  const choisirTout = (c: Choix | null) => setChoix((x) => { const n = { ...x }; for (const p of paires) { if (c) n[p.pairKey] = c; else delete n[p.pairKey]; } return n; });
  const aFusionner = useMemo(() => etat.paires.filter((p) => choix[p.pairKey] === "fusion" && !faits.has(p.pairKey) && !supprimes.has(p.a.id) && !supprimes.has(p.b.id)), [etat.paires, choix, faits, supprimes]);
  const aEcarter = useMemo(() => etat.paires.filter((p) => choix[p.pairKey] === "non"), [etat.paires, choix]);

  const fusionner = async (p: DuplicatePair): Promise<boolean> => {
    const keepId = gardee(p);
    const deleteId = keepId === p.a.id ? p.b.id : p.a.id;
    setBusy(p.pairKey);
    try {
      const res = await fetchApi("/api/ingredients/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId, deleteId }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error ?? `Erreur ${res.status}`);
      setFaits((x) => new Set(x).add(p.pairKey));
      setSupprimes((x) => new Set(x).add(deleteId));
      setFusionnes((n) => n + 1);
      return true;
    } catch (e) { alert(`Fusion interrompue sur « ${p.a.name} » : ${e instanceof Error ? e.message : "erreur"}`); return false; }
    finally { setBusy(null); }
  };
  /** Applique tous les choix : les paires écartées d'abord (sans risque), puis les fusions une à une */
  const valider = async () => {
    const fusions = aFusionner, ecartees = aEcarter;
    if (fusions.length === 0 && ecartees.length === 0) return;
    const phrases = [
      fusions.length ? `Fusionner ${fusions.length} paire${fusions.length > 1 ? "s" : ""}, chacune dans le produit coché « à garder » (prix, recettes et mouvements réaffectés, le doublon supprimé : on ne peut pas revenir en arrière)` : null,
      ecartees.length ? `Écarter ${ecartees.length} paire${ecartees.length > 1 ? "s" : ""} qui ne sont pas des doublons` : null,
    ].filter(Boolean);
    if (!confirm(`${phrases.join("\n\n")}\n\nValider ?`)) return;
    if (ecartees.length && !(await ecarter(ecartees.map((p) => p.pairKey)))) {
      alert("Les paires « pas un doublon » n'ont pas pu être enregistrées (réseau ?). Rien n'a été fusionné : réessaie.");
      return;
    }
    if (fusions.length) {
      setTout({ fait: 0, total: fusions.length });
      // Une fiche supprimée par une fusion précédente ne peut plus servir dans une autre paire
      const parties = new Set<string>();
      for (let i = 0; i < fusions.length; i++) {
        const p = fusions[i];
        if (!parties.has(p.a.id) && !parties.has(p.b.id)) {
          const ok = await fusionner(p);
          if (!ok) break;
          parties.add((garde[p.pairKey] ?? p.a.id) === p.a.id ? p.b.id : p.a.id);
        }
        setTout({ fait: i + 1, total: fusions.length });
      }
      setTout(null);
    }
    setChoix({});
    setVersion((v) => v + 1);
  };
  const cat = (p: Ingredient) => { const c = CAT_COLORS[(p.category ?? "") as Category] ?? FAIBLE; return <span style={pastille(couleurTexte(c), alpha(c, 0.14))}>{CAT_LABELS[p.category as Category] ?? p.category ?? "—"}</span>; };
  const fournisseur = (p: Ingredient) => etat.fournisseurs.get(etat.offres.get(p.id)?.supplier_id ?? p.supplier_id ?? "") ?? "—";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.dbl-ligne:hover td{background:#f7f3ec}`}</style>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={h1(bureau)}>Doublons probables</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            {etat.chargement ? "Recherche…" : `${paires.length} paire${paires.length > 1 ? "s" : ""}${fusionnes ? ` · ${fusionnes} fusionnée${fusionnes > 1 ? "s" : ""}` : ""}`} · deux fiches actives du même fournisseur aux noms proches
          </div>
        </div>
        <Link href="/ingredients" style={{ ...BTN, textDecoration: "none", display: "inline-block" }}>← Base produits</Link>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 200px", minWidth: 0, maxWidth: 420 }} />
      </div>
      {paires.length > 1 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: MUTED }}>
          <span>Pour les {paires.length} paires affichées :</span>
          <button type="button" onClick={() => choisirTout("non")} style={{ ...BTN, fontSize: 12.5 }}>Toutes « pas un doublon »</button>
          <button type="button" onClick={() => choisirTout("fusion")} style={{ ...BTN, fontSize: 12.5 }}>Toutes « fusionner »</button>
          <button type="button" onClick={() => choisirTout(null)} style={{ ...BTN, fontSize: 12.5, color: MUTED }}>Effacer les choix</button>
        </div>
      )}
      {(etat.erreur || erreurEcartes) && <div style={{ color: MAUVAIS, fontSize: 13 }}>{etat.erreur ?? `Paires écartées : ${erreurEcartes}`}</div>}
      <div style={CADRE}>
        {etat.chargement || !ignoresPrets ? <Chargement texte="Comparaison des noms…" /> : paires.length === 0 ? <EtatVide icone="produit" titre="Aucun doublon probable" texte={q ? "Rien ne correspond à ce filtre." : "Tous les noms de produits sont distincts, ou les paires ont été écartées."} /> : (
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
            <colgroup><col style={{ width: 6 }} /><col style={{ width: 40 }} /><col />{bureau && <col style={{ width: 130 }} />}{bureau && <col style={{ width: 120 }} />}{bureau && <col style={{ width: 150 }} />}{bureau && <col style={{ width: 90 }} />}<col style={{ width: bureau ? 90 : 68 }} /></colgroup>
            <thead><tr>
              <th style={{ ...TH, padding: 0 }} /><th style={{ ...TH, padding: 0 }} /><th style={TH}>Produit</th>{bureau && <th style={TH}>Catégorie</th>}{bureau && <th style={TH}>Fournisseur</th>}{bureau && <th style={TH}>Dernier prix</th>}{bureau && <th style={TH}>Fiche créée</th>}<th style={{ ...TH, textAlign: "right", ...(bureau ? {} : { paddingLeft: 0, paddingRight: 10 }) }}>{bureau ? "Proximité" : "Proche"}</th>
            </tr></thead>
            <tbody>
              {paires.map((p) => {
                const keepId = gardee(p);
                const c = CAT_COLORS[(p.a.category ?? "") as Category] ?? FAIBLE;
                return (
                  <Fragment key={p.pairKey}>
                    {[p.a, p.b].map((x) => {
                      const on = x.id === keepId;
                      return (
                        <tr key={x.id} className="dbl-ligne" onClick={() => setGarde((g) => ({ ...g, [p.pairKey]: x.id }))} style={{ cursor: "pointer", background: on ? "#f4f6f1" : undefined }}>
                          <td style={liseret(c)} />
                          <td style={{ ...TD, padding: "9px 0 9px 12px" }}><input type="radio" name={`garde-${p.pairKey}`} checked={on} onChange={() => setGarde((g) => ({ ...g, [p.pairKey]: x.id }))} style={{ accentColor: BON, width: 16, height: 16, cursor: "pointer" }} /></td>
                          <td style={{ ...TD, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {/* Téléphone (17/11/2026) : le nom s'écrit en entier sur plusieurs lignes, c'est lui qui distingue les deux produits */}
                              <span style={bureau ? { fontWeight: on ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { fontWeight: on ? 700 : 600, overflowWrap: "anywhere", lineHeight: 1.25 }}>{x.name}</span>
                              {on && <span style={pastille(BON)}>à garder</span>}
                            </div>
                            {!bureau && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{fournisseur(x)} · {prix(offreDe(x.id)) ? <b style={{ color: "#1a1a1a" }}>{prix(offreDe(x.id))}</b> : <span style={{ color: MAUVAIS, fontWeight: 700 }}>sans prix</span>}{dateCourte(dateOffre(offreDe(x.id))) ? ` du ${dateCourte(dateOffre(offreDe(x.id)))}` : ""}{x.created_at ? ` · créée le ${dateCourte(x.created_at)}` : ""}</div>}
                          </td>
                          {bureau && <td style={TD}>{cat(x)}</td>}
                          {bureau && <td style={{ ...TD, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fournisseur(x)}</td>}
                          {bureau && <td style={{ ...TD, whiteSpace: "nowrap" }}>
                            {prix(offreDe(x.id)) ? <><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{prix(offreDe(x.id))}</div>{dateCourte(dateOffre(offreDe(x.id))) && <div style={{ fontSize: 11.5, color: MUTED }}>du {dateCourte(dateOffre(offreDe(x.id)))}</div>}</> : <span style={pastille(MAUVAIS)}>sans prix</span>}
                          </td>}
                          {bureau && <td style={{ ...TD, color: MUTED, whiteSpace: "nowrap" }}>{dateCourte(x.created_at) ?? "—"}</td>}
                          <td style={{ ...TD, textAlign: "right" }}>{x.id === p.a.id && <span style={pastille(p.score >= 0.95 ? MAUVAIS : p.score >= 0.88 ? "#b7791f" : MUTED, p.score < 0.88 ? "rgba(0,0,0,0.06)" : undefined)}>{Math.round(p.score * 100)} %</span>}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td style={{ ...liseret("transparent"), borderBottom: `1px solid ${BORD}` }} />
                      <td colSpan={bureau ? 7 : 3} style={{ ...TD, borderBottom: `1px solid ${BORD}`, padding: "8px 14px 12px", background: "#faf7f1" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                          {(() => {
                            const autre = keepId === p.a.id ? p.b : p.a;
                            const prixGarde = prix(offreDe(keepId)), prixAutre = prix(offreDe(autre.id));
                            return !prixGarde && prixAutre ? <span style={{ fontSize: 12, color: ATTENTION, marginRight: "auto" }}>La fiche gardée n&apos;a pas de prix : celui de l&apos;autre ({prixAutre}) sera repris à la fusion.</span> : null;
                          })()}
                          {([["non", "Pas un doublon", MUTED], ["fusion", "Fusionner", BON]] as const).map(([c, libelle, couleur]) => {
                            const actif = choix[p.pairKey] === c;
                            return (
                              <button key={c} type="button" aria-pressed={actif} onClick={() => choisir(p, c)} disabled={tout !== null}
                                style={{ ...BTN, minHeight: 38, padding: "6px 14px", fontWeight: actif ? 700 : 600, color: actif ? "#fff" : couleur, background: actif ? (c === "fusion" ? BON : "#1a1a1a") : "#fff", borderColor: actif ? (c === "fusion" ? BON : "#1a1a1a") : BORD }}>
                                {actif ? "✓ " : ""}{libelle}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {/* Barre de validation, collée en bas tant qu'il y a des choix */}
      {(aFusionner.length > 0 || aEcarter.length > 0 || tout) && (
        <div style={{ position: "sticky", bottom: bureau ? 12 : 8, zIndex: 20, background: "#fff", border: "1px solid #1a1a1a", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}>
          <div style={{ fontSize: 13.5 }}>
            <b>{aFusionner.length}</b> à fusionner · <b>{aEcarter.length}</b> à écarter
            <div style={{ fontSize: 12, color: MUTED }}>{paires.length - paires.filter((p) => choix[p.pairKey]).length} paire{paires.length - paires.filter((p) => choix[p.pairKey]).length > 1 ? "s" : ""} sans choix : elles restent dans la liste</div>
          </div>
          <button type="button" onClick={() => void valider()} disabled={busy !== null || tout !== null}
            style={{ ...BTN, background: BON, borderColor: BON, color: "#fff", fontWeight: 700, height: 44, padding: "0 20px", fontSize: 15, opacity: busy !== null || tout !== null ? 0.6 : 1 }}>
            {tout ? `Fusion ${tout.fait} / ${tout.total}…` : "Valider mes choix"}
          </button>
        </div>
      )}
    </div>
  );
}
