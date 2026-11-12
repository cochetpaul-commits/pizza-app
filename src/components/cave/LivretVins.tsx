"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import type { VinCave } from "@/app/api/cave/route";
import { GLOSSAIRE, LIVRET, type Bloc } from "@/lib/livretVins";
import { BORD, BTN, CADRE, CHAMP, INTERTITRE, MUTED, OSWALD, TD, TH, filtre, h1 } from "@/components/ui/charte";

/**
 * Vini d'Italia, le livret de formation salle, dans la Cave (12/11/2026, demande de Paul). Les chapitres sont ceux
 * du livret ; le mémo de la carte et les accords sont lus en direct dans la Cave, donc toujours à jour.
 */
const SERIF = "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif";
const COULEURS: Record<string, { lib: string; c: string }> = { bulles: { lib: "Bulles", c: "#8aa8b8" }, champagne: { lib: "Champagne", c: "#8aa8b8" }, blanc: { lib: "Blancs", c: "#c9a84c" }, rose: { lib: "Rosés", c: "#e09a9a" }, rouge: { lib: "Rouges", c: "#8a2f3a" }, doux: { lib: "Doux", c: "#b7791f" } };
const ORDRE = ["bulles", "blanc", "rose", "rouge", "doux", "champagne"];
const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;
const rang = (c: string) => { const i = ORDRE.indexOf(c); return i < 0 ? 99 : i; };
const sansDoublon = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))];

function Tableau({ entetes, lignes }: { entetes: string[]; lignes: React.ReactNode[][] }) {
  return (
    <div style={{ ...CADRE, overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
        <thead><tr>{entetes.map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{lignes.map((l, r) => <tr key={r}>{l.map((c, i) => <td key={i} style={{ ...TD, fontWeight: i === 0 ? 700 : 400, verticalAlign: "top" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Accords({ vins }: { vins: VinCave[] | null }) {
  if (!vins) return <div style={{ color: MUTED, fontSize: 13 }}>Lecture de la Cave…</div>;
  const auVerre = vins.filter((v) => v.prix?.v != null && v.accords.length > 0).sort((a, b) => rang(a.couleur) - rang(b.couleur) || a.nom.localeCompare(b.nom, "fr"));
  if (!auVerre.length) return <div style={{ color: MUTED, fontSize: 13 }}>Aucun accord enregistré dans la Cave pour les vins au verre.</div>;
  return (
    <>
      <Tableau entetes={["Le client commande…", "Suggérez…", "Verre"]} lignes={auVerre.map((v) => [
        <span key="p" style={{ fontWeight: 500 }}>{sansDoublon(v.accords.map((a) => a.plat_nom)).slice(0, 6).join(", ")}</span>,
        <span key="v"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: COULEURS[v.couleur]?.c ?? MUTED, marginRight: 7 }} />{v.nom}</span>,
        <b key="e" style={{ whiteSpace: "nowrap" }}>{eur(v.prix!.v!)}</b>,
      ])} />
      <div style={{ fontSize: 12, color: MUTED }}>Accords et prix lus dans la Cave : ils suivent la carte du moment.</div>
    </>
  );
}

function Memo({ vins }: { vins: VinCave[] | null }) {
  if (!vins) return <div style={{ color: MUTED, fontSize: 13 }}>Lecture de la Cave…</div>;
  const tri = (l: VinCave[]) => [...l].sort((a, b) => rang(a.couleur) - rang(b.couleur) || (a.prix?.b ?? a.prix?.v ?? 0) - (b.prix?.b ?? b.prix?.v ?? 0));
  const auVerre = tri(vins.filter((v) => v.prix?.v != null));
  const bouteilles = ORDRE.map((c) => ({ c, liste: vins.filter((v) => v.couleur === c && v.prix?.b != null).sort((a, b) => (a.prix!.b! - b.prix!.b!)) })).filter((g) => g.liste.length);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={INTERTITRE}>Au verre{auVerre.some((v) => v.prix?.d != null) ? " et en pichet 50 cl" : ""}</div>
      <Tableau entetes={["Vin", "Verre / pichet", "Cépages", "Accord réflexe"]} lignes={auVerre.map((v) => [
        <span key="n"><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 5, background: COULEURS[v.couleur]?.c ?? MUTED, marginRight: 7 }} />{v.nom}</span>,
        <b key="p" style={{ whiteSpace: "nowrap" }}>{eur(v.prix!.v!)}{v.prix?.d != null ? ` / ${eur(v.prix.d)}` : ""}</b>,
        <span key="c" style={{ color: MUTED }}>{v.cepages ?? ""}</span>,
        sansDoublon(v.accords.map((a) => a.plat_nom)).slice(0, 2).join(", "),
      ])} />
      <div style={INTERTITRE}>Bouteilles, du plus accessible au plus prestigieux</div>
      {bouteilles.map((g) => (
        <div key={g.c} style={{ ...CADRE, padding: "10px 14px", boxShadow: `inset 6px 0 0 ${COULEURS[g.c]?.c ?? MUTED}` }}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>{COULEURS[g.c]?.lib ?? g.c} · {eur(g.liste[0].prix!.b!)} à {eur(g.liste[g.liste.length - 1].prix!.b!)}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            {g.liste.map((v, i) => <span key={v.id}>{i > 0 && <span style={{ color: BORD }}> · </span>}{v.nom} <b>{v.prix!.b}</b></span>)}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, color: MUTED }}>Prix lus dans la Cave. En cas de doute en service, la carte fait foi.</div>
    </div>
  );
}

function Rendu({ b, vins }: { b: Bloc; vins: VinCave[] | null }) {
  switch (b.type) {
    case "p": return <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{b.texte}</p>;
    case "h": return <h3 style={{ margin: "8px 0 0", fontFamily: OSWALD, fontWeight: 700, fontSize: 16, textTransform: "uppercase", letterSpacing: ".04em" }}>{b.texte}</h3>;
    case "table": return <Tableau entetes={b.entetes} lignes={b.lignes} />;
    case "encadre": return (
      <div style={{ ...CADRE, padding: "12px 16px", boxShadow: "inset 6px 0 0 #D4775A" }}>
        <div style={{ ...INTERTITRE, color: "#D4775A" }}>{b.titre}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, marginTop: 4 }}>{b.texte}</div>
      </div>
    );
    case "liste": return <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 14.5, lineHeight: 1.55 }}>{b.items.map((x) => <li key={x}>{x}</li>)}</ul>;
    case "qr": return (
      <div style={{ display: "grid", gap: 8 }}>
        {b.items.map((x) => (
          <div key={x.q} style={{ ...CADRE, padding: "10px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{x.q}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 3, color: "#1a1a1a" }}>{x.r}</div>
          </div>
        ))}
      </div>
    );
    case "accords": return <Accords vins={vins} />;
    case "memo": return <Memo vins={vins} />;
  }
}

export function LivretVins() {
  const bureau = useBureau();
  const [chapitre, setChapitre] = useState(LIVRET[0].id);
  const [vins, setVins] = useState<VinCave[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    fetchApi("/api/cave").then((r) => (r.ok ? r.json() : null)).then((j) => setVins(((j?.vins ?? []) as VinCave[]).filter((v) => v.sur_carte))).catch(() => setVins([]));
  }, []);
  const ch = LIVRET.find((c) => c.id === chapitre);
  const mots = useMemo(() => { const n = q.trim().toLowerCase(); return n ? GLOSSAIRE.filter(([m, d]) => `${m} ${d}`.toLowerCase().includes(n)) : GLOSSAIRE; }, [q]);
  const i = LIVRET.findIndex((c) => c.id === chapitre);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={h1(bureau)}>Vini d&apos;Italia</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>Livret de formation salle : comprendre, raconter et vendre les vins de la carte.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href="/cave" style={{ ...BTN, textDecoration: "none" }}>← La cave</Link>
          <Link href="/quiz?theme=vins" style={{ ...BTN, textDecoration: "none", background: "#1a1a1a", color: "#f2ede4", borderColor: "#1a1a1a" }}>S&apos;entraîner</Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {LIVRET.map((c) => <button key={c.id} type="button" onClick={() => setChapitre(c.id)} style={{ ...filtre(chapitre === c.id), flexShrink: 0 }}>{c.court}</button>)}
        <button type="button" onClick={() => setChapitre("glossaire")} style={{ ...filtre(chapitre === "glossaire"), flexShrink: 0 }}>Glossaire</button>
      </div>

      {ch && (
        <article style={{ display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: bureau ? 34 : 28, lineHeight: 1.1 }}>{ch.titre}</h2>
            {ch.chapeau && <p style={{ margin: "6px 0 0", fontFamily: SERIF, fontStyle: "italic", fontSize: 19, lineHeight: 1.35, color: "#6f6a61" }}>{ch.chapeau}</p>}
          </div>
          {ch.blocs.map((b, k) => <Rendu key={k} b={b} vins={vins} />)}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
            {i > 0 ? <button type="button" onClick={() => { setChapitre(LIVRET[i - 1].id); window.scrollTo(0, 0); }} style={BTN}>← {LIVRET[i - 1].court}</button> : <span />}
            <button type="button" onClick={() => { setChapitre(i + 1 < LIVRET.length ? LIVRET[i + 1].id : "glossaire"); window.scrollTo(0, 0); }} style={{ ...BTN, background: "#D4775A", borderColor: "#D4775A", color: "#fff", fontWeight: 700 }}>{i + 1 < LIVRET.length ? LIVRET[i + 1].court : "Glossaire"} →</button>
          </div>
        </article>
      )}

      {chapitre === "glossaire" && (
        <article style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: bureau ? 34 : 28, lineHeight: 1.1 }}>Glossaire · {GLOSSAIRE.length} mots-clés</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un mot…" style={{ ...CHAMP, borderRadius: 20, width: "100%" }} />
          <div style={CADRE}>
            {mots.map(([m, d]) => (
              <div key={m} style={{ display: "grid", gridTemplateColumns: bureau ? "190px 1fr" : "1fr", gap: bureau ? 12 : 2, padding: "9px 14px", borderBottom: `1px solid ${BORD}` }}>
                <b style={{ fontSize: 14.5 }}>{m}</b><span style={{ fontSize: 14.5 }}>{d}</span>
              </div>
            ))}
            {mots.length === 0 && <div style={{ padding: 14, color: MUTED, fontSize: 13 }}>Aucun mot trouvé.</div>}
          </div>
        </article>
      )}
      <div style={{ fontSize: 12, color: MUTED }}>Édition Estate 26, sélection Oenoplaisir, rédaction Paul et Pierre Cochet. Usage interne. Vins alignés sur la carte du 12 novembre 2026.</div>
    </div>
  );
}
