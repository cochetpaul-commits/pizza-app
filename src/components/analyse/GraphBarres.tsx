"use client";

import { useBureau } from "@/hooks/useBureau";
import { MUTED, FAIBLE } from "./gabarit";

export type SerieBarres = { libelle: string; couleur: string; valeurs: number[]; /** tracée en courbe plutôt qu'en barres */ courbe?: boolean; /** aire légère sous la courbe (lecture d'un volume, pas d'un seuil) */ aire?: boolean };

/**
 * Graphique en barres (groupées ou empilées) avec quadrillage, étiquettes et légende, en SVG, pleine largeur.
 * Charte 29/10/2026 : barres larges aux coins arrondis, valeur écrite au-dessus quand la place le permet,
 * courbe lissée avec une aire légère, quadrillage discret. Sur téléphone, seules certaines étiquettes
 * de l'axe sont écrites pour rester lisibles.
 */
export function GraphBarres({ etiquettes, series, format, empile, sousEtiquettes, hauteur, libelleAxe, sansValeurs }: {
  etiquettes: string[]; series: SerieBarres[]; format: (v: number) => string; empile?: boolean;
  /** Ligne sous l'étiquette (emoji météo, total…) */
  sousEtiquettes?: (string | null)[]; hauteur?: number; libelleAxe?: string;
  /** Ne pas écrire la valeur au-dessus des barres */
  sansValeurs?: boolean;
}) {
  const bureau = useBureau();
  const n = etiquettes.length;
  const barres = series.filter((s) => !s.courbe);
  const courbes = series.filter((s) => s.courbe);
  const totaux = etiquettes.map((_, i) => empile ? barres.reduce((t, s) => t + (s.valeurs[i] ?? 0), 0) : Math.max(0, ...barres.map((s) => s.valeurs[i] ?? 0)));
  const maxV = Math.max(1, ...totaux, ...courbes.flatMap((s) => s.valeurs));
  const brut = maxV / 4;
  const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? puissance;
  const haut = Math.ceil(maxV / pas) * pas;
  const L = bureau ? 760 : 380, gauche = bureau ? 54 : 44, droite = 10;
  const H = hauteur ?? (bureau ? 190 : 160), marge = 18, base = H + marge, largeur = L - gauche - droite;
  const hauteurTotale = base + (sousEtiquettes ? 38 : 24);
  const y = (v: number) => base - (v / haut) * H;
  // Colonnes : au plus 110 px chacune sur bureau pour que peu de barres ne s'étalent pas sur toute la largeur
  const col = Math.min(largeur / Math.max(1, n), bureau ? 110 : 80);
  const decalage = (largeur - col * n) / 2;
  const nbBarres = empile ? 1 : Math.max(1, barres.length);
  const ecart = nbBarres > 1 ? 3 : 0;
  const barre = Math.max(3, Math.min(bureau ? 48 : 30, (col * 0.66 - ecart * (nbBarres - 1)) / nbBarres));
  const pasEtiquette = n <= (bureau ? 16 : 8) ? 1 : Math.ceil(n / (bureau ? 16 : 8));
  const graduations = Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => i * pas);
  const etiquetteValeur = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }));
  // Valeur écrite au-dessus des barres quand il y a assez de place (≤ 12 colonnes sur bureau, ≤ 6 sur téléphone)
  const ecrireValeurs = !sansValeurs && n <= (bureau ? 12 : 6) && barres.length > 0;
  const xMilieu = (i: number) => gauche + decalage + i * col + col / 2;
  // Barre à coins arrondis en haut seulement (le bas repose sur l'axe ou sur la barre dessous)
  const cheminBarre = (x: number, yh: number, w: number, h: number, r: number) => {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${yh + h} V${yh + rr} Q${x},${yh} ${x + rr},${yh} H${x + w - rr} Q${x + w},${yh} ${x + w},${yh + rr} V${yh + h} Z`;
  };
  // Courbe lissée (Catmull-Rom → Bézier)
  const cheminCourbe = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : "";
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };
  return (
    <div>
      <svg viewBox={`0 0 ${L} ${hauteurTotale}`} style={{ width: "100%", height: "auto", display: "block", fontFamily: "inherit" }} role="img" aria-label={libelleAxe ?? series.map((s) => s.libelle).join(", ")}>
        <style>{`.gb-col:hover .gb-barre{filter:brightness(.92)} .gb-barre{transition:filter .12s}`}</style>
        {graduations.map((g) => (
          <g key={g}>
            <line x1={gauche} x2={gauche + largeur} y1={y(g)} y2={y(g)} stroke={g === 0 ? "#cfc7b8" : "#ece6db"} strokeWidth={1} strokeDasharray={g === 0 ? undefined : "3 5"} />
            <text x={gauche - 8} y={y(g) + 3.5} fontSize={10.5} fill={FAIBLE} textAnchor="end">{etiquetteValeur(g)}</text>
          </g>
        ))}
        {etiquettes.map((e, i) => {
          const milieu = xMilieu(i);
          const groupe = nbBarres * barre + ecart * (nbBarres - 1);
          let cumul = 0;
          const total = totaux[i];
          return (
            <g key={`${e}-${i}`} className="gb-col">
              {barres.map((s, k) => {
                const v = s.valeurs[i] ?? 0;
                if (v <= 0) return null;
                const x = empile ? milieu - barre / 2 : milieu - groupe / 2 + k * (barre + ecart);
                const yHaut = empile ? y(cumul + v) : y(v);
                const h = empile ? y(cumul) - yHaut : base - yHaut;
                if (empile) cumul += v;
                // Empilé : seule la dernière couche visible a les coins arrondis
                const dernier = !empile || barres.slice(k + 1).every((t) => (t.valeurs[i] ?? 0) <= 0);
                return <path key={s.libelle} className="gb-barre" d={cheminBarre(x, yHaut, barre, h, dernier ? 6 : 0)} fill={s.couleur}><title>{`${e} · ${s.libelle} : ${format(v)}`}</title></path>;
              })}
              {ecrireValeurs && total > 0 && <text x={milieu} y={y(total) - 5} fontSize={10.5} fontWeight={600} fill={MUTED} textAnchor="middle">{etiquetteValeur(total)}</text>}
              {i % pasEtiquette === 0 && <text x={milieu} y={base + 15} fontSize={10.5} fill={MUTED} textAnchor="middle">{e}</text>}
              {sousEtiquettes?.[i] && i % pasEtiquette === 0 && <text x={milieu} y={base + 31} fontSize={12} textAnchor="middle">{sousEtiquettes[i]}</text>}
            </g>
          );
        })}
        {courbes.map((s) => {
          const pts = s.valeurs.map((v, i) => ({ x: xMilieu(i), y: y(v) }));
          // Un seul point : un trait de niveau sur la largeur de la colonne, au lieu d'un point perdu
          const d = pts.length === 1 ? `M${pts[0].x - col * 0.4},${pts[0].y} H${pts[0].x + col * 0.4}` : cheminCourbe(pts);
          const aire = s.aire && pts.length > 1 ? `${d} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z` : "";
          return (
            <g key={s.libelle}>
              {aire && <path d={aire} fill={s.couleur} opacity={0.07} />}
              <path d={d} fill="none" stroke={s.couleur} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke={s.couleur} strokeWidth={2}><title>{`${etiquettes[i]} · ${s.libelle} : ${format(s.valeurs[i])}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "6px 16px", fontSize: 12, color: MUTED, marginTop: 6, flexWrap: "wrap" }}>
        {series.map((s) => {
          const total = s.valeurs.reduce((t, v) => t + v, 0);
          return <span key={s.libelle} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ display: "inline-block", width: s.courbe ? 14 : 10, height: s.courbe ? 3 : 10, borderRadius: 3, background: s.couleur }} /><span style={{ fontWeight: 600, color: "#1a1a1a" }}>{s.libelle}</span>{s.courbe ? "" : <span>{format(total)}</span>}</span>;
        })}
      </div>
    </div>
  );
}
