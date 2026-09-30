/**
 * Zones de stockage par établissement (table ingredient_zones, colonne rang).
 *
 *   rang 1 = zone principale, rang 2 = zone secondaire, rang null = emplacement supplémentaire
 *   (mémorisé par l'inventaire). ingredients.storage_zone / storage_zone_2 ne sont qu'un miroir
 *   des rangs 1 / 2 de l'établissement de rattachement : pour un établissement donné, toujours
 *   passer par ces fonctions.
 *
 * Lecture : ajouter `ZONES_EMBED` au select de `ingredients`, puis `appliquerZonesEtab(items, etabId)`
 * remplace storage_zone / storage_zone_2 par les zones de cet établissement.
 * Écriture : rpc `set_zone_stockage(p_ingredient, p_etab, p_rang, p_zone)`.
 */

export type ZoneEtabRow = { etablissement_id: string; zone: string; rang: number | null };
export type ZonesProduit = { zone1: string | null; zone2: string | null; autres: string[] };

export const ZONES_EMBED = "ingredient_zones(etablissement_id, zone, rang)";

/** Clé du tableau ingredients.establishments pour un slug d'établissement (bello_mio → bellomio). */
export function cleEtab(slug: string | null | undefined): "bellomio" | "piccola" | null {
  if (!slug) return null;
  if (slug.includes("piccola")) return "piccola";
  if (slug.includes("bello")) return "bellomio";
  return null;
}

/** Zones d'un produit dans un établissement, à partir des lignes ingredient_zones embarquées. */
export function zonesPour(rows: ZoneEtabRow[] | null | undefined, etabId: string | null | undefined): ZonesProduit {
  const mine = (rows ?? []).filter((r) => r.etablissement_id === etabId);
  const zone1 = mine.find((r) => r.rang === 1)?.zone ?? null;
  const zone2 = mine.find((r) => r.rang === 2)?.zone ?? null;
  const autres = [...new Set(mine.filter((r) => r.rang == null).map((r) => r.zone.trim()).filter((z) => z && z !== zone1 && z !== zone2))];
  return { zone1, zone2, autres };
}

type AvecZones = { etablissement_id?: string | null; storage_zone?: string | null; storage_zone_2?: string | null; ingredient_zones?: ZoneEtabRow[] | null };

/**
 * Remplace storage_zone / storage_zone_2 par les zones de l'établissement demandé et retire
 * l'embed. Sans établissement (vue groupe), la fiche garde le miroir (établissement de rattachement).
 */
export function appliquerZonesEtab<T extends AvecZones>(items: T[], etabId: string | null | undefined): T[] {
  return items.map((it) => {
    const { ingredient_zones, ...reste } = it;
    if (!etabId) return reste as T;
    const z = zonesPour(ingredient_zones, etabId);
    return { ...reste, storage_zone: z.zone1, storage_zone_2: z.zone2 } as T;
  });
}
