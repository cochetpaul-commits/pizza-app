"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import { VoletDroit } from "@/components/produits/BaseProduits";
import type { VinCave } from "@/app/api/cave/route";

/**
 * Cave Bello Mio (phase 1, 27/10/2026) : le sommelier de poche de l'équipe.
 * - Service : on coche ce que la table a pris, l'app propose trois vins avec l'argument et la phrase à dire,
 *   et pousse la bouteille dès deux plats ;
 * - Cave : les vins de la carte par couleur, chaque fiche en volet (profil, pitch, astuce, prix, stock à J-1,
 *   accords). La direction édite, valide, ajoute ou retire des accords, voit prix d'achat et coefficient.
 */
type Plat = { id: string; nom: string; categorie: string; prix: number };
type Donnees = { vins: VinCave[]; edition: boolean; argent: boolean; plats: Plat[] };

const ACCENT = "#D4775A", MUTED = "#999", BORD = "#ddd6c8", VERT = "#2f7d4f", ROUGE = "#b3261e", AMBRE = "#b8641b";
const OSWALD = "var(--font-oswald), Oswald, sans-serif", SERIF = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";
const COULEURS: Record<string, { lib: string; c: string }> = { rouge: { lib: "Rouge", c: "#8a2f3a" }, blanc: { lib: "Blanc", c: "#c9a84c" }, rose: { lib: "Rosé", c: "#e09a9a" }, bulles: { lib: "Bulles", c: "#8aa8b8" }, doux: { lib: "Doux", c: "#b7791f" }, champagne: { lib: "Champagne", c: "#8aa8b8" } };
const ORDRE = ["rouge", "blanc", "rose", "bulles", "doux", "champagne"];
const CATS: Record<string, string> = { ANTIPASTI: "Antipasti", PIZZE: "Pizze", CUCINA: "Cucina", DOLCI: "Dolci" };
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const BTN: CSSProperties = { border: `1px solid ${BORD}`, borderRadius: 20, background: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "#1a1a1a", fontWeight: 600, fontFamily: "inherit" };
const Point = ({ couleur }: { couleur: string }) => <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: COULEURS[couleur]?.c ?? MUTED, marginRight: 7, verticalAlign: -1 }} />;
const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick} style={{ ...BTN, padding: "6px 11px", borderColor: on ? ACCENT : BORD, background: on ? "#f5e9e2" : "#fff", fontWeight: on ? 700 : 500 }}>{children}</button>
);
const Cat = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: MUTED, fontWeight: 700, margin: "12px 0 4px" }}>{children}</div>;

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
  const input: CSSProperties = { font: "inherit", fontSize: 14, padding: "7px 10px", border: `1.5px solid ${BORD}`, borderRadius: 9, background: "#faf8f4", width: "100%", boxSizing: "border-box" };
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
            <span style={{ color: v.statut === "valide" ? VERT : AMBRE, border: `1px solid ${v.statut === "valide" ? VERT : AMBRE}`, borderRadius: 8, padding: "2px 8px" }}>{v.statut === "valide" ? "Fiche validée" : "À valider"}</span>
            {v.stock != null && <span style={{ color: v.stock <= 0 ? ROUGE : "#1a1a1a", border: `1px solid ${BORD}`, borderRadius: 8, padding: "2px 8px" }}>{v.stock <= 0 ? "Plus en cave" : `${v.stock.toLocaleString("fr-FR")} en cave`}</span>}
            {v.stock == null && <span style={{ color: MUTED, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>stock inconnu : produit non relié</span>}
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
      {Object.keys(CATS).map((cat) => plats.some((p) => p.categorie === cat) && (
        <div key={cat}><Cat>{CATS[cat]}</Cat><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{plats.filter((p) => p.categorie === cat).map((p) => <Chip key={p.id} on={sel.has(p.id)} onClick={() => basculer(p.id)}>{p.nom}</Chip>)}</div></div>
      ))}
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
    return donnees.vins.filter((v) => (filtre === "archive" ? !v.sur_carte : v.sur_carte && (filtre === "tous" || v.couleur === filtre)))
      .filter((v) => !q || norm(`${v.nom} ${v.domaine ?? ""} ${v.cepages ?? ""} ${v.region ?? ""}`).includes(q))
      .sort((a, b) => ORDRE.indexOf(a.couleur) - ORDRE.indexOf(b.couleur) || (a.prix?.b ?? 0) - (b.prix?.b ?? 0) || a.nom.localeCompare(b.nom, "fr"));
  }, [donnees, filtre, recherche]);
  const vinOuvert = donnees?.vins.find((v) => v.id === ouvert) ?? null;
  const aValider = donnees?.vins.filter((v) => v.sur_carte && v.statut !== "valide").length ?? 0;
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", margin: 0, lineHeight: 1.05 }}>La cave</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>Le vin de la table, et la phrase pour le vendre.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["service", "cave"] as const).map((t) => <button key={t} type="button" onClick={() => setVue(t)} style={{ ...BTN, borderColor: vue === t ? ACCENT : BORD, background: vue === t ? "#f5e9e2" : "#fff", fontWeight: 700 }}>{t === "service" ? "Service" : "Cave"}</button>)}
        </div>
      </div>
      {erreur && <p style={{ color: ROUGE }}>{erreur}</p>}
      {!donnees && !erreur && <p style={{ color: MUTED, textAlign: "center", padding: 40 }}>Chargement…</p>}
      {donnees && vue === "service" && <Service donnees={donnees} onOuvrir={(v) => setOuvert(v.id)} />}
      {donnees && vue === "cave" && (
        <div>
          {donnees.edition && aValider > 0 && <div style={{ fontSize: 12.5, color: AMBRE, marginBottom: 8 }}>{aValider} fiche{aValider > 1 ? "s" : ""} de la carte à valider : ouvre, relis, « Valider la fiche ».</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
            {["tous", ...ORDRE, "archive"].map((f) => <Chip key={f} on={filtre === f} onClick={() => setFiltre(f)}>{f === "tous" ? "Tous" : f === "archive" ? "Archive" : COULEURS[f].lib}</Chip>)}
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un vin, un cépage…" style={{ font: "inherit", fontSize: 14, padding: "7px 10px", border: `1.5px solid ${BORD}`, borderRadius: 20, background: "#fff", flex: "1 1 160px", minWidth: 0 }} />
          </div>
          <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "2px 12px" }}>
            {vins.map((v) => (
              <button key={v.id} type="button" onClick={() => setOuvert(v.id)} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 10, alignItems: "center", width: "100%", padding: "11px 0", borderTop: `1px solid #f0ebe2`, background: "none", border: 0, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f0ebe2", textAlign: "left", cursor: "pointer", font: "inherit", color: "#1a1a1a" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: COULEURS[v.couleur]?.c ?? MUTED }} />
                <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600 }}>{v.nom}</span>{v.statut !== "valide" && v.sur_carte && <span style={{ color: AMBRE, fontSize: 11, marginLeft: 6 }}>à valider</span>}<br /><span style={{ fontSize: 12, color: MUTED }}>{[v.cepages, v.region].filter(Boolean).join(" · ").slice(0, 80)}</span></span>
                <span style={{ fontSize: 12, color: MUTED, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{v.prix?.v != null && <>{eur(v.prix.v)}<br /></>}{v.prix?.b != null && <>{eur(v.prix.b)} btl</>}{v.stock != null && <><br /><span style={{ color: v.stock <= 0 ? ROUGE : v.stock <= 3 ? AMBRE : MUTED }}>{v.stock} en cave</span></>}</span>
              </button>
            ))}
            {vins.length === 0 && <div style={{ padding: 16, color: MUTED, fontSize: 13 }}>Aucun vin.</div>}
          </div>
        </div>
      )}
      {vinOuvert && donnees && <Fiche v={vinOuvert} donnees={donnees} onFermer={() => setOuvert(null)} onRecharger={recharger} />}
    </div>
  );
}
