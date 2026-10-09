"use client";

import { useBureau } from "@/hooks/useBureau";
import { MUTED } from "./gabarit";

export type SerieBarres = { libelle: string; couleur: string; valeurs: number[]; /** tracée en courbe plutôt qu'en barres */ courbe?: boolean };

/**
 * Graphique en barres (groupées ou empilées) avec quadrillage, étiquettes et légende, en SVG, pleine largeur.
 * Sur téléphone, seules certaines étiquettes de l'axe sont écrites pour rester lisibles.
 */
export function GraphBarres({ etiquettes, series, format, empile, sousEtiquettes, hauteur, libelleAxe }: {
  etiquettes: string[]; series: SerieBarres[]; format: (v: number) => string; empile?: boolean;
  /** Ligne sous l'étiquette (emoji météo, total…) */
  sousEtiquettes?: (string | null)[]; hauteur?: number; libelleAxe?: string;
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
  const L = bureau ? 760 : 380, gauche = bureau ? 56 : 46, droite = 8;
  const H = hauteur ?? (bureau ? 170 : 160), base = H + 16, largeur = L - gauche - droite;
  const hauteurTotale = base + (sousEtiquettes ? 36 : 22);
  const y = (v: number) => base - (v / haut) * H;
  const col = largeur / Math.max(1, n);
  const nbBarres = empile ? 1 : Math.max(1, barres.length);
  const ecart = 2;
  const barre = Math.max(2, Math.min(bureau ? 28 : 22, (col * 0.72 - ecart * (nbBarres - 1)) / nbBarres));
  const pasEtiquette = n <= (bureau ? 16 : 8) ? 1 : Math.ceil(n / (bureau ? 16 : 8));
  const graduations = Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => i * pas);
  const etiquetteValeur = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k` : v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }));
  return (
    <div>
      <svg viewBox={`0 0 ${L} ${hauteurTotale}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={libelleAxe ?? series.map((s) => s.libelle).join(", ")}>
        {graduations.map((g) => (
          <g key={g}>
            <line x1={gauche} x2={gauche + largeur} y1={y(g)} y2={y(g)} stroke="#ddd6c8" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "2 4"} />
            <text x={gauche - 8} y={y(g) + 4} fontSize={10.5} fill={MUTED} textAnchor="end">{etiquetteValeur(g)}</text>
          </g>
        ))}
        {etiquettes.map((e, i) => {
          const x0 = gauche + i * col, milieu = x0 + col / 2;
          const groupe = nbBarres * barre + ecart * (nbBarres - 1);
          let cumul = 0;
          return (
            <g key={`${e}-${i}`}>
              {barres.map((s, k) => {
                const v = s.valeurs[i] ?? 0;
                if (v <= 0) return null;
                const x = empile ? milieu - barre / 2 : milieu - groupe / 2 + k * (barre + ecart);
                const yHaut = empile ? y(cumul + v) : y(v);
                const h = empile ? y(cumul) - yHaut : base - yHaut;
                if (empile) cumul += v;
                return <rect key={s.libelle} x={x} y={yHaut} width={barre} height={h} rx={empile ? 2 : 4} fill={s.couleur}><title>{`${e} · ${s.libelle} : ${format(v)}`}</title></rect>;
              })}
              {i % pasEtiquette === 0 && <text x={milieu} y={base + 14} fontSize={10.5} fill={MUTED} textAnchor="middle">{e}</text>}
              {sousEtiquettes?.[i] && i % pasEtiquette === 0 && <text x={milieu} y={base + 30} fontSize={12} textAnchor="middle">{sousEtiquettes[i]}</text>}
            </g>
          );
        })}
        {courbes.map((s) => {
          const points = s.valeurs.map((v, i) => `${gauche + i * col + col / 2},${y(v)}`).join(" ");
          return (
            <g key={s.libelle}>
              <polyline points={points} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.valeurs.map((v, i) => <circle key={i} cx={gauche + i * col + col / 2} cy={y(v)} r={2.5} fill={s.couleur}><title>{`${etiquettes[i]} · ${s.libelle} : ${format(v)}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: MUTED, marginTop: 4, flexWrap: "wrap" }}>
        {series.map((s) => {
          const total = s.valeurs.reduce((t, v) => t + v, 0);
          return <span key={s.libelle}><i style={{ display: "inline-block", width: 10, height: s.courbe ? 3 : 10, borderRadius: 3, background: s.couleur, marginRight: 5, verticalAlign: s.courbe ? 3 : -1 }} />{s.libelle}{s.courbe ? "" : ` · ${format(total)}`}</span>;
        })}
      </div>
    </div>
  );
}
