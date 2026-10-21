/**
 * Minimum de commande en litres (Éric Élien, glaces : 10 L par commande, 21/10/2026).
 * Une ligne commandée en litres compte telle quelle ; commandée au bac (ou à la pièce, au colis),
 * elle compte pour le contenu de l'article (ingredients.piece_volume_ml : bac de 4,5 L = 4500 ml).
 */
export function litresLigne(quantite: number, unite: string | null | undefined, pieceVolumeMl: number | null | undefined): number {
  const q = Number(quantite) || 0;
  if (q <= 0) return 0;
  const u = String(unite ?? "").trim().toLowerCase();
  if (/^(l|litres?)$/.test(u)) return q;
  if (u === "cl") return q / 100;
  if (u === "ml") return q / 1000;
  const ml = Number(pieceVolumeMl) || 0;
  return ml > 0 ? (q * ml) / 1000 : 0;
}

export const totalLitres = (lignes: { quantite: number; unite: string | null | undefined; pieceVolumeMl: number | null | undefined }[]) =>
  Math.round(lignes.reduce((t, l) => t + litresLigne(l.quantite, l.unite, l.pieceVolumeMl), 0) * 100) / 100;

export const fmtLitres = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
