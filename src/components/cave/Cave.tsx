"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import { VoletDroit } from "@/components/produits/BaseProduits";
import type { VinCave } from "@/app/api/cave/route";
import { Tuile } from "@/components/ui/Tuile";
import { getCategoryColor } from "@/lib/categoryColors";
import { couleurTexte as couleurTexteCat } from "@/lib/styleCategories";
import Link from "next/link";
import { EtatVide } from "@/components/ui/EtatVide";
import { ACCENT, ATTENTION, BON, BORD, BTN, CADRE, CHAMP, MAUVAIS, MUTED, OSWALD, TD, TH, alpha, filtre as styleFiltre, h1, liseret, pastille } from "@/components/ui/charte";

/**
 * Cave Bello Mio (phase 1, 27/10/2026) : le sommelier de poche de l'équipe.
 * - Service : on coche ce que la table a pris, l'app propose trois vins avec l'argument et la phrase à dire,
 *   et pousse la bouteille dès deux plats ;
 * - Cave : les vins de la carte par couleur, chaque fiche en volet (profil, pitch, astuce, prix, stock à J-1,
 *   accords). La direction édite, valide, ajoute ou retire des accords, voit prix d'achat et coefficient.
 */
type Plat = { id: string; nom: string; categorie: string; prix: number };
type Donnees = { vins: VinCave[]; edition: boolean; argent: boolean; plats: Plat[] };

const VERT = BON, ROUGE = MAUVAIS, AMBRE = ATTENTION;
const SERIF = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";
const COULEURS: Record<string, { lib: string; c: string }> = { rouge: { lib: "Rouge", c: "#8a2f3a" }, blanc: { lib: "Blanc", c: "#c9a84c" }, rose: { lib: "Rosé", c: "#e09a9a" }, bulles: { lib: "Bulles", c: "#8aa8b8" }, doux: { lib: "Doux", c: "#b7791f" }, champagne: { lib: "Champagne", c: "#8aa8b8" } };
const ORDRE = ["rouge", "blanc", "rose", "bulles", "doux", "champagne"];
const CATS: Record<string, string> = { ANTIPASTI: "Antipasti", PIZZE: "Pizze", CUCINA: "Cucina", DOLCI: "Dolci" };
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const Point = ({ couleur }: { couleur: string }) => <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COULEURS[couleur]?.c ?? MUTED, marginRight: 7, verticalAlign: -1 }} />;
const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} style={{ ...styleFiltre(on), padding: "6px 11px" }}>{children}</button>
);
const Cat = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: MUTED, fontWeight: 700, margin: "12px 0 4px" }}>{children}</div>;
/** « BURRATA » → « Burrata » : la caisse écrit certains plats en capitales */
const joli = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'’-])\S/g, (c) => c.toUpperCase()) : s);

function Prix({ v }: { v: VinCave }) {
  const p = v.prix ?? {};
  const items = [p.v != null && ["verre", p.v], p.d != null && ["50 cl", p.d], p.b != null && ["bouteille", p.b], p.m != null && ["magnum", p.m]].filter(Boolean) as [string, number][];
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map(([l, n]) => <div key={l} style={{ flex: "1 1 80px", background: "#f2ede4", border: `1px solid ${BORD}`, borderRadius: 10, padding: "8px 10px", textAlign: "center" }}><b style={{ display: "block", fontFamily: OSWALD, fontSize: 18 }}>{eur(n)}</b><span style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>{l}</span></div>)}
    </div>
  );
}

function Profil({ p }: { p: VinCave["profil"] }) {
  if (!p) return null;
  const lignes: [string, number][] = [["Corps", p.corps], ["Fruit", p.fruit], ["Fraîcheur", p.fraicheur], ...(p.tanins ? [["Tanins", p.tanins] as [string, number]] : [])];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "6px 10px", alignItems: "center", fontSize: 12 }}>
      {lignes.map(([l, n]) => <span key={l} style={{ display: "contents" }}><span>{l}</span><div style={{ height: 8, background: "#e8e1d4", borderRadius: 4, overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: `${Math.min(5, n) * 20}%`, background: ACCENT }} /></div></span>)}
    </div>
  );
}

/* ── Fiche en volet ─────────────────────────────────────────────────────── */
function Fiche({ v, donnees, onFermer, onRecharger }: { v: VinCave; donnees: Donnees; onFermer: () => void; onRecharger: () => void }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [accordPlat, setAccordPlat] = useState("");
  const [accordRaison, setAccordRaison] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const champs: [keyof VinCave, string, boolean][] = [["nom", "Nom", false], ["nom_complet", "Nom complet", false], ["domaine", "Domaine", false], ["region", "Région", false], ["appellation", "Appellation", false], ["cepages", "Cépages", false], ["millesime", "Millésime", false], ["degre", "Degré", false], ["garde", "Garde", false], ["service", "Service", false], ["carafage", "Carafage", false], ["pitch", "Pitch à table", true], ["astuce", "Astuce salle", true], ["oeil", "Œil", true], ["nez", "Nez", true], ["bouche", "Bouche", true], ["histoire", "Histoire", true], ["vinification", "Vinification", true], ["accords_generiques", "Accords génériques", true], ["note", "À vérifier (direction)", true]];
  const commencer = () => { setForm(Object.fromEntries(champs.map(([k]) => [k, String(v[k] ?? "")]))); setEdit(true); };
  const envoyer = async (extra: Record<string, unknown> = {}) => {
    setEtat("Enregistrement…");
    const body = edit ? { id: v.id, ...Object.fromEntries(champs.map(([k]) => [k, form[k]?.trim() || null])), ...extra } : { id: v.id, ...extra };
    const r = await fetchApi("/api/cave", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { setEtat(j?.error ?? "Enregistrement impossible"); return; }
    setEtat(null); setEdit(false); onRecharger();
  };
  const ajouterAccord = async () => {
    const plat = donnees.plats.find((p) => p.id === accordPlat);
    if (!plat) { setEtat("Choisis un plat."); return; }
    const r = await fetchApi("/api/cave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vin_id: v.id, plat_nom: plat.nom, plat_popina_id: plat.id, raison: accordRaison }) });
    if (r.ok) { setAccordPlat(""); setAccordRaison(""); onRecharger(); } else setEtat("Accord non enregistré");
  };
  const retirerAccord = async (id: string) => { const r = await fetchApi(`/api/cave?accord=${id}`, { method: "DELETE" }); if (r.ok) onRecharger(); };
  const input: CSSProperties = { ...CHAMP, height: undefined, width: "100%" };
  const platPar = new Map(donnees.plats.map((p) => [p.id, p]));
  const pied = donnees.edition ? (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
      {etat && <span style={{ fontSize: 12.5, color: etat.startsWith("Enregistrement") ? MUTED : ROUGE }}>{etat}</span>}
      <span style={{ flex: 1 }} />
      {edit ? (<>
        <button type="button" onClick={() => setEdit(false)} style={BTN}>Annuler</button>
        <button type="button" onClick={() => void envoyer()} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700 }}>Enregistrer</button>
      </>) : (<>
        <button type="button" onClick={commencer} style={BTN}>Modifier</button>
        {v.sur_carte
          ? <button type="button" onClick={() => void envoyer({ sur_carte: false })} style={{ ...BTN, color: MUTED }}>Archiver</button>
          : <button type="button" onClick={() => void envoyer({ sur_carte: true })} style={{ ...BTN, color: VERT, borderColor: VERT }}>Remettre en cave</button>}
        {v.statut === "valide"
          ? <button type="button" onClick={() => void envoyer({ valider: false })} style={BTN}>Remettre à valider</button>
          : <button type="button" onClick={() => void envoyer({ valider: true })} style={{ ...BTN, background: VERT, borderColor: VERT, color: "#fff", fontWeight: 700 }}>Valider la fiche</button>}
      </>)}
    </div>
  ) : undefined;
  return (
    <VoletDroit titre={<><Point couleur={v.couleur} />{v.nom}</>} sousTitre={[v.appellation, v.domaine].filter(Boolean).join(" · ") || COULEURS[v.couleur]?.lib} onFermer={onFermer} pied={pied}>
      {edit ? (
        <div style={{ display: "grid", gap: 8 }}>
          {champs.map(([k, l, long]) => (
            <label key={k} style={{ display: "grid", gap: 3, fontSize: 12, color: MUTED }}>{l}
              {long ? <textarea value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} rows={k === "pitch" || k === "astuce" ? 2 : 3} style={{ ...input, resize: "vertical" }} />
                : <input value={form[k] ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} style={input} />}
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={pastille(v.statut === "valide" ? VERT : AMBRE)}>{v.statut === "valide" ? "Fiche validée" : "À valider"}</span>
            {v.stock != null && <span style={pastille(v.stock <= 0 ? ROUGE : v.stock <= 3 ? AMBRE : MUTED, v.stock > 3 ? "rgba(0,0,0,0.06)" : undefined)}>{v.stock <= 0 ? "Plus en cave" : `${v.stock.toLocaleString("fr-FR")} en cave`}</span>}
            {v.stock == null && <span style={{ color: MUTED, fontSize: 12 }}>stock inconnu : produit non relié</span>}
            {!v.sur_carte && <span style={pastille(MUTED, "rgba(0,0,0,0.06)")}>Archivé</span>}
            <span style={{ flex: 1 }} />
            {v.ingredient_id && <Link href={`/ingredients?edit=${v.ingredient_id}&back=${encodeURIComponent("/cave")}`} style={{ fontSize: 12.5, color: ACCENT, fontWeight: 700, textDecoration: "none" }}>Voir le produit →</Link>}
          </div>
          <Profil p={v.profil} />
          {v.pitch && <div style={{ fontFamily: SERIF, fontSize: 20, lineHeight: 1.3 }}>{v.pitch}</div>}
          {v.astuce && <div style={{ fontSize: 14, padding: "10px 12px", borderLeft: `3px solid ${ACCENT}`, background: "#f2ede4", borderRadius: "0 8px 8px 0" }}><b>Astuce salle.</b> {v.astuce}</div>}
          <Prix v={v} />
          {v.achat && <div style={{ border: `1px dashed ${BORD}`, borderRadius: 10, padding: "8px 12px", fontSize: 13 }}><span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED, fontWeight: 700 }}>Direction</span><br />{v.achat.prix_ht != null ? <>Prix d&apos;achat {eur(v.achat.prix_ht)} HT{v.achat.coefficient != null && <> · coefficient {v.achat.coefficient.toLocaleString("fr-FR")} sur la bouteille</>}</> : "Prix d'achat inconnu (produit sans prix)"}{v.note && <><br /><b>À vérifier :</b> {v.note}</>}</div>}
          <div style={{ borderTop: `1px solid ${BORD}` }}>
            {([["Cépages", v.cepages], ["Région", v.region], ["Millésime", v.millesime ?? "à compléter"], ["Degré", v.degre], ["Garde", v.garde], ["Service", v.service], ["Carafage", v.carafage]] as [string, string | null][]).filter(([, x]) => x).map(([l, x]) => (
              <div key={l} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, padding: "6px 0", borderBottom: `1px solid ${BORD}`, fontSize: 13 }}><span style={{ color: MUTED, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", paddingTop: 2 }}>{l}</span><span>{x}</span></div>
            ))}
          </div>
          {(v.oeil || v.nez || v.bouche) && <div><Cat>Dans le verre</Cat><div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{v.oeil && <><b>Œil.</b> {v.oeil}<br /></>}{v.nez && <><b>Nez.</b> {v.nez}<br /></>}{v.bouche && <><b>Bouche.</b> {v.bouche}</>}</div></div>}
          {v.histoire && <div><Cat>L&apos;histoire</Cat><div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{v.histoire}</div></div>}
          {v.vinification && <details style={{ fontSize: 13 }}><summary style={{ cursor: "pointer", color: ACCENT, fontWeight: 700 }}>Vinification et élevage</summary><div style={{ lineHeight: 1.45, marginTop: 4 }}>{v.vinification}</div></details>}
          <div>
            <Cat>Va avec</Cat>
            {v.accords.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Pas encore d&apos;accord.</div>}
            {v.accords.map((a) => {
              const p = a.plat_popina_id ? platPar.get(a.plat_popina_id) : null;
              return (
                <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderTop: `1px solid ${BORD}`, fontSize: 13.5 }}>
                  <span style={{ fontWeight: 600 }}>{a.plat_nom}</span>
                  {a.raison && <span style={{ color: MUTED, fontSize: 12.5 }}>{a.raison}</span>}
                  <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12, whiteSpace: "nowrap" }}>{p ? `${CATS[p.categorie] ?? p.categorie} · ${eur(p.prix)}` : ""}</span>
                  {donnees.edition && <button type="button" onClick={() => void retirerAccord(a.id)} aria-label="Retirer" style={{ border: 0, background: "none", color: MUTED, cursor: "pointer", padding: 0 }}>×</button>}
                </div>
              );
            })}
            {donnees.edition && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <select value={accordPlat} onChange={(e) => setAccordPlat(e.target.value)} style={{ ...input, width: "auto", flex: "1 1 160px" }}>
                  <option value="">Ajouter un plat…</option>
                  {donnees.plats.map((p) => <option key={p.id} value={p.id}>{CATS[p.categorie] ?? p.categorie} · {p.nom}</option>)}
                </select>
                <input value={accordRaison} onChange={(e) => setAccordRaison(e.target.value)} placeholder="Pourquoi, en une phrase" style={{ ...input, width: "auto", flex: "2 1 200px" }} />
                <button type="button" onClick={() => void ajouterAccord()} style={BTN}>Ajouter</button>
              </div>
            )}
            {v.accords_generiques && <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>Accords génériques : {v.accords_generiques}</div>}
          </div>
          {Array.isArray(v.sources) && v.sources.length > 0 && <div style={{ fontSize: 11.5, color: MUTED }}>{v.sources.length} source{v.sources.length > 1 ? "s" : ""}</div>}
        </div>
      )}
    </VoletDroit>
  );
}

/* ── Service ─────────────────────────────────────────────────────────────── */
function Service({ donnees, onOuvrir }: { donnees: Donnees; onOuvrir: (v: VinCave) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const basculer = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const plats = donnees.plats;
  const choisis = plats.filter((p) => sel.has(p.id));
  const suggestions = (() => {
    if (!choisis.length) return [];
    const score = new Map<string, { n: number; pts: number; pourquoi: [string, string | null][] }>();
    for (const p of choisis) {
      for (const v of donnees.vins) {
        if (!v.sur_carte || (v.stock != null && v.stock <= 0)) continue;
        const a = v.accords.find((x) => x.plat_popina_id === p.id || norm(x.plat_nom) === norm(p.nom));
        if (!a) continue;
        const s = score.get(v.id) ?? { n: 0, pts: 0, pourquoi: [] };
        s.n++; s.pts += Math.max(0, 4 - a.ordre); s.pourquoi.push([p.nom, a.raison]); score.set(v.id, s);
      }
    }
    return [...score.entries()].sort((a, b) => b[1].n - a[1].n || b[1].pts - a[1].pts).slice(0, 3).map(([id, s]) => ({ v: donnees.vins.find((x) => x.id === id)!, ...s }));
  })();
  const meilleur = suggestions[0]?.v;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20, margin: 0 }}>La table a pris…</h2>
        {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} style={{ border: 0, background: "none", color: ACCENT, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>Effacer</button>}
      </div>
      <div style={{ ...CADRE, marginTop: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
          <colgroup><col style={{ width: 6 }} /><col style={{ width: 40 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 70 }} /></colgroup>
          <thead><tr><th style={{ ...TH, padding: 0 }} /><th style={{ ...TH, padding: 0 }} /><th style={TH}>Plat</th><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right" }}>Prix</th></tr></thead>
          <tbody>
            {[...plats].sort((a, b) => joli(a.nom).localeCompare(joli(b.nom), "fr")).map((p) => {
              const cat = p.categorie, c = getCategoryColor(cat), on = sel.has(p.id);
              return (
                <tr key={p.id} className="cave-ligne" onClick={() => basculer(p.id)} style={{ cursor: "pointer", background: on ? "#f4f6f1" : undefined }}>
                  <td style={liseret(c)} />
                  <td style={{ ...TD, padding: "8px 0 8px 12px" }}><input type="checkbox" checked={on} onChange={() => basculer(p.id)} onClick={(e) => e.stopPropagation()} style={{ accentColor: c, width: 16, height: 16, cursor: "pointer" }} /></td>
                  <td style={{ ...TD, fontWeight: on ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{joli(p.nom)}</td>
                  <td style={TD}><span style={pastille(couleurTexteCat(c), alpha(c, 0.14))}>{CATS[cat] ?? cat}</span></td>
                  <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>{eur(p.prix)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!sel.size && <p style={{ color: MUTED, fontSize: 14, margin: "12px 0" }}>Coche un ou plusieurs plats : trois vins à proposer, avec la phrase à dire.</p>}
      {sel.size > 0 && (
        <div style={{ marginTop: 12 }}>
          <Cat>À proposer</Cat>
          {suggestions.length === 0 && <p style={{ color: MUTED, fontSize: 14 }}>Pas d&apos;accord enregistré pour ces plats. La direction peut en ajouter depuis la fiche d&apos;un vin.</p>}
          {suggestions.map(({ v, n, pourquoi }) => (
            <div key={v.id} onClick={() => onOuvrir(v)} style={{ border: `1px solid ${BORD}`, borderRadius: 14, padding: "12px 14px", marginTop: 10, background: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontFamily: OSWALD, fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}><Point couleur={v.couleur} />{v.nom}</div>
                <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", textAlign: "right" }}>{v.prix?.v != null && <>{eur(v.prix.v)} verre<br /></>}{v.prix?.d != null && <>{eur(v.prix.d)} 50 cl<br /></>}{v.prix?.b != null && <>{eur(v.prix.b)} btl</>}</div>
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.3, marginTop: 6 }}>{pourquoi.map(([p, r]) => <span key={p}><b>{p}</b>{r ? ` : ${r}` : ""}<br /></span>)}{sel.size > 1 && n === sel.size && <span style={{ color: VERT, fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>Va avec toute la table</span>}</div>
              {v.pitch && <div style={{ fontSize: 13, marginTop: 8, padding: "8px 10px", borderLeft: `3px solid ${ACCENT}`, background: "#f2ede4", borderRadius: "0 8px 8px 0" }}>{v.pitch}</div>}
              {v.stock != null && v.stock <= 3 && <div style={{ fontSize: 12, color: AMBRE, marginTop: 6 }}>Plus que {v.stock} en cave.</div>}
            </div>
          ))}
          {sel.size >= 2 && meilleur?.prix?.b != null && (
            <div style={{ marginTop: 12, background: ACCENT, color: "#fff", borderRadius: 12, padding: "12px 14px", fontSize: 14 }}>
              <b style={{ fontFamily: OSWALD, fontSize: 16 }}>Propose la bouteille</b><br />{meilleur.nom} à {eur(meilleur.prix.b)} pour la table{meilleur.prix.v != null && <>, contre {eur(sel.size * meilleur.prix.v)} en verres</>}. {sel.size >= 3 ? "Trois plats ou plus : la bouteille part presque toujours." : "« Je vous ouvre une bouteille ? »"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function Cave({ vueInitiale }: { vueInitiale?: "service" | "cave" }) {
  const bureau = useBureau();
  const [vue, setVue] = useState<"service" | "cave">(vueInitiale ?? "service");
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<string>("tous");
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetchApi("/api/cave?tous=1");
        const j = await r.json().catch(() => null);
        if (annule) return;
        if (!r.ok) setErreur(j?.error ?? "Chargement impossible"); else setDonnees(j as Donnees);
      } catch (e) { if (!annule) setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    })();
    return () => { annule = true; };
  }, [version]);
  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  const vins = useMemo(() => {
    if (!donnees) return [];
    const q = norm(recherche);
    const garde = (v: VinCave) => {
      if (filtre === "archive") return !v.sur_carte;
      if (!v.sur_carte) return false;
      if (filtre === "tous") return true;
      if (filtre === "a_valider") return v.statut !== "valide";
      if (filtre === "stock") return v.stock != null && v.stock <= 3;
      return v.couleur === filtre;
    };
    return donnees.vins.filter(garde)
      .filter((v) => !q || norm(`${v.nom} ${v.domaine ?? ""} ${v.cepages ?? ""} ${v.region ?? ""}`).includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [donnees, filtre, recherche]);
  const vinOuvert = donnees?.vins.find((v) => v.id === ouvert) ?? null;
  /** Vin archivé remis en cave active (sur la carte) ; le retour en archive se fait depuis la fiche */
  const remettre = async (v: VinCave) => { const r = await fetchApi("/api/cave", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: v.id, sur_carte: true }) }); if (r.ok) recharger(); };
  const aValider = donnees?.vins.filter((v) => v.sur_carte && v.statut !== "valide").length ?? 0;
  const surCarte = donnees?.vins.filter((v) => v.sur_carte).length ?? 0;
  const stockFaible = donnees?.vins.filter((v) => v.sur_carte && v.stock != null && v.stock <= 3).length ?? 0;
  const basculerFiltre = (f: string) => setFiltre((x) => (x === f ? "tous" : f));
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <h1 style={h1(bureau)}>La cave</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>Le vin de la table, et la phrase pour le vendre.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["service", "cave"] as const).map((t) => <button key={t} type="button" onClick={() => setVue(t)} style={styleFiltre(vue === t)}>{t === "service" ? "Service" : "Cave"}</button>)}
        </div>
      </div>
      {erreur && <p style={{ color: ROUGE }}>{erreur}</p>}
      {!donnees && !erreur && <p style={{ color: MUTED, textAlign: "center", padding: 40 }}>Chargement…</p>}
      {donnees && vue === "service" && <Service donnees={donnees} onOuvrir={(v) => setOuvert(v.id)} />}
      {donnees && vue === "cave" && (
        <div style={{ display: "grid", gap: 10 }}>
          <style>{`.cave-ligne:hover td{background:#f7f3ec}`}</style>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
            <Tuile compacte icone="produit" libelle="À la carte" valeur={surCarte} couleur="#1a1a1a" active={filtre === "tous"} onClick={() => setFiltre("tous")} />
            <Tuile compacte icone="fiche" libelle="Fiches à valider" valeur={aValider} couleur={aValider ? AMBRE : MUTED} active={filtre === "a_valider"} onClick={() => basculerFiltre("a_valider")} />
            <Tuile compacte icone="alerte" libelle="Plus que 3 bouteilles" valeur={stockFaible} couleur={stockFaible ? ROUGE : MUTED} active={filtre === "stock"} onClick={() => basculerFiltre("stock")} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {[...ORDRE, "archive"].map((f) => <Chip key={f} on={filtre === f} onClick={() => basculerFiltre(f)}>{f === "archive" ? "Archive" : COULEURS[f].lib}</Chip>)}
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un vin, un cépage…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 160px", minWidth: 0 }} />
          </div>
          {donnees.edition && aValider > 0 && filtre === "a_valider" && <div style={{ fontSize: 12.5, color: AMBRE }}>Ouvre, relis, puis « Valider la fiche ».</div>}
          <div style={CADRE}>
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 6 }} />{bureau && <col style={{ width: 90 }} />}<col />{bureau && <col style={{ width: 90 }} />}<col style={{ width: bureau ? 120 : 96 }} />{bureau && <col style={{ width: 196 }} />}</colgroup>
              <thead>
                <tr>
                  <th style={{ ...TH, padding: 0 }} />
                  {bureau && <th style={TH}>Couleur</th>}
                  <th style={TH}>Vin</th>
                  {bureau && <th style={{ ...TH, textAlign: "right" }}>Verre</th>}
                  <th style={{ ...TH, textAlign: "right" }}>{bureau ? "Bouteille · cave" : "Prix · cave"}</th>
                  {bureau && <th style={{ ...TH, textAlign: "right" }} />}
                </tr>
              </thead>
              <tbody>
                {vins.map((v) => {
                  const c = COULEURS[v.couleur]?.c ?? MUTED;
                  const stock = v.stock == null ? null : <span style={pastille(v.stock <= 0 ? ROUGE : v.stock <= 3 ? AMBRE : MUTED, v.stock > 3 ? "rgba(0,0,0,0.06)" : undefined)}>{v.stock <= 0 ? "Plus en cave" : `${v.stock} en cave`}</span>;
                  return (
                    <tr key={v.id} className="cave-ligne" onClick={() => setOuvert(v.id)} style={{ cursor: "pointer" }}>
                      <td style={liseret(c)} />
                      {bureau && <td style={{ ...TD, color: MUTED, fontSize: 12 }}>{COULEURS[v.couleur]?.lib ?? v.couleur}</td>}
                      <td style={{ ...TD, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{v.nom}</span>
                          {v.statut !== "valide" && v.sur_carte && <span style={pastille(AMBRE)}>À valider</span>}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[v.cepages, v.region].filter(Boolean).join(" · ")}</div>
                      </td>
                      {bureau && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>{v.prix?.v != null ? eur(v.prix.v) : ""}</td>}
                      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        <div style={{ fontWeight: 600 }}>{v.prix?.b != null ? eur(v.prix.b) : v.prix?.v != null ? `${eur(v.prix.v)} verre` : ""}</div>
                        {stock && <div style={{ marginTop: 2 }}>{stock}</div>}
                      </td>
                      {bureau && (
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                          {v.ingredient_id && <Link href={`/ingredients?edit=${v.ingredient_id}&back=${encodeURIComponent("/cave")}`} style={{ ...BTN, padding: "3px 10px", fontSize: 11.5, color: MUTED, textDecoration: "none", display: "inline-block" }}>Produit</Link>}
                          {donnees.edition && !v.sur_carte && <button type="button" onClick={() => void remettre(v)} style={{ ...BTN, padding: "3px 10px", fontSize: 11.5, marginLeft: 6, color: VERT, borderColor: VERT }}>Remettre</button>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {vins.length === 0 && <EtatVide compact icone="recherche" titre="Aucun vin" texte={recherche ? "Essaie un autre mot." : "Rien dans ce filtre."} />}
          </div>
        </div>
      )}
      {vinOuvert && donnees && <Fiche v={vinOuvert} donnees={donnees} onFermer={() => setOuvert(null)} onRecharger={recharger} />}
    </div>
  );
}
