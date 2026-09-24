/**
 * Rapprochement ligne de facture → fiche produit. Une seule logique, partagée
 * par le moteur d'import (importEngine) et l'écran « Lignes en attente », pour
 * que « sans fiche » veuille dire la même chose des deux côtés.
 *
 * Ordre : référence fournisseur (toutes les lignes d'un même fournisseur, Mael
 * Bello / Mael Piccola), puis nom exact, nom normalisé, préfixe, nom de base
 * (sans poids ni conditionnement).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeIngredientName } from "@/lib/invoices/categoryDetector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

/** « SAS MAEL », « Mael », « MAEL » : même fournisseur — on ignore la forme juridique */
export const cleFournisseur = (n: string) =>
  normalizeIngredientName(n).replace(/\b(sas|sarl|sa|eurl|sasu|societe|ste|ets|etablissements|france|europe)\b/g, " ").replace(/\s+/g, " ").trim();

/** Correspondance des noms fournisseurs (parser, Pennylane, scan IA) → nom unique dans l'appli. Clé = nom normalisé sans forme juridique. */
const NOMS_FOURNISSEURS: Record<string, string> = {
  "armor emballages": "Armor",
  "mael": "Mael",
  "sas mael": "Mael",
  "carniato europe": "Carniato",
  "societe de distribution de produits fins s d p f": "Sdpf",
  "sdpf": "Sdpf",
  "masse nantes": "Masse",
  "cozigou cote d emeraude": "Cozigou",
  "pomona terreazur": "Pomona Terreazur",
  "terre azur": "Pomona Terreazur",
  "terreazur": "Pomona Terreazur",
  "metro": "Metro",
  "metro france": "Metro",
  "my spirits srls": "My Spirits",
  "my spirits": "My Spirits",
  "s d p f": "Sdpf",
  "societe de distribution de produits fins": "Sdpf",
};
export function canoniserNomFournisseur(nom: string): string {
  const cle = cleFournisseur(nom).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return NOMS_FOURNISSEURS[cle] ?? nom;
}

/** Fournisseur « Interne (sans facture) » : ingrédients sans achat (eau du robinet…). Jamais de facture, de rapprochement ni d'attente. */
export function estFournisseurInterne(nom: string | null | undefined): boolean {
  return /^\s*interne\b/i.test(nom ?? "");
}

/** Ligne de frais (forfait livraison, port, transport…) : ni fiche ni offre, jamais « en attente ». */
export function estLigneDeFrais(nom: string | null | undefined): boolean {
  return /forfait|frais\s+de\s+(port|livraison|transport)|livraison\s+sur\s+seuil|\bport\b.*\bemballage|participation\s+(transport|livraison)|\btransport\b|indexation\s+energie|\bconsigne\b|\bcaution\b|^E\d{3}\s+FUT\b/i.test(nom ?? "");
}

export function baseProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d+\s*%/g, "")                    // remove percentages
    .replace(/\d[\d\s.,xX×]*\s*(g|gr|kg|ml|cl|l|pc|pcs|pce|pces)\b/gi, "")  // remove weight/volume
    .replace(/\d+\s*x\s*\d+/gi, "")             // remove "8 x 200" patterns
    .replace(/\b(c\d+|fb\d+)\b/gi, "")          // remove codes like C1, FB7060
    .replace(/\s+/g, " ")
    .trim();
}

/** Ids des lignes « suppliers » qui désignent le même fournisseur que supplierId (forme juridique et établissement ignorés). */
export async function aliasFournisseur(supabase: Db, supplierId: string, supplierName?: string): Promise<string[]> {
  const { data: aliasRows } = await supabase.from("suppliers").select("id, name");
  const rows = (aliasRows ?? []) as Array<{ id: string; name: string | null }>;
  const nomRef = String(rows.find((r) => r.id === supplierId)?.name ?? supplierName ?? "");
  const cle = cleFournisseur(nomRef);
  const ids = cle ? rows.filter((r) => cleFournisseur(String(r.name ?? "")) === cle).map((r) => r.id) : [];
  if (!ids.includes(supplierId)) ids.push(supplierId);
  return ids;
}

/** Référence « générique » qui n'identifie pas un produit (Mael : RESTO5.5 = taux de TVA sur les lignes hors catalogue). */
export function estRefGenerique(sku: string | null | undefined): boolean {
  return /^RESTO[0-9.,]*$/i.test((sku ?? "").trim());
}

/** Clé d'une ligne pour les alias / ignorés / regroupements : la référence, sinon « n:<libellé normalisé> ». */
export function cleReference(sku: string | null | undefined, nom: string | null | undefined): string {
  const s = (sku ?? "").trim();
  if (s && !estRefGenerique(s)) return s;
  return `n:${normalizeIngredientName((nom ?? "").trim())}`;
}

export type IndexFiches = {
  /** Références (ou clés « n:… ») ignorées : produits abandonnés, jamais de fiche */
  ignorees: Set<string>;
  /** Références connues de chaque fiche (supplier_sku + alias) : une ligne qui porte une AUTRE réf. ne s'y rattache pas par le nom */
  refsParFiche: Map<string, Set<string>>;
  skuToIngId: Map<string, string>;
  nameToIngId: Map<string, string>;
  normalizedToIngId: Map<string, string>;
  baseNameToIngId: Map<string, string>;
};

/**
 * Charge l'index des fiches : références du fournisseur (et de ses alias) + toutes
 * les fiches actives, quel que soit le propriétaire ou l'établissement (par tranches).
 */
export async function chargerIndexFiches(supabase: Db, supplierId: string, supplierAliasIds: string[], skus: string[]): Promise<IndexFiches> {
  const refsParFiche = new Map<string, Set<string>>();
  const ajouterRef = (ingId: string, sku: string | null | undefined) => { const k = String(sku ?? "").trim(); if (!k || estRefGenerique(k) || k.startsWith("n:")) return; if (!refsParFiche.has(ingId)) refsParFiche.set(ingId, new Set()); refsParFiche.get(ingId)!.add(k); };
  const skuToIngId = new Map<string, string>();
  for (let i = 0; i < skus.length; i += 200) {
    const { data: bySku, error: eSku } = await supabase
      .from("ingredients")
      .select("id,supplier_sku,is_active,supplier_id")
      .in("supplier_id", supplierAliasIds)
      .in("supplier_sku", skus.slice(i, i + 200));
    if (eSku) throw new Error(eSku.message);
    // Priorité : fiche active, puis fiche rattachée au fournisseur exact
    const rows = ((bySku ?? []) as Array<{ id: string; supplier_sku: string | null; is_active: boolean; supplier_id: string }>)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || Number(b.supplier_id === supplierId) - Number(a.supplier_id === supplierId));
    for (const r of rows) {
      const k = String(r.supplier_sku ?? "").trim();
      if (k && !skuToIngId.has(k)) skuToIngId.set(k, r.id);
    }
  }
  // Alias par libellé (« n:… ») : lignes sans référence (Elien, Bar Spirits) rattachées à une fiche depuis l'écran ou à la main
  {
    const { data: aliasNoms, error: eNoms } = await supabase.from("ingredient_supplier_refs").select("sku, ingredient_id").in("supplier_id", supplierAliasIds).like("sku", "n:%").range(0, 1999);
    if (eNoms) throw new Error(eNoms.message);
    for (const r of (aliasNoms ?? []) as Array<{ sku: string; ingredient_id: string }>) { if (!skuToIngId.has(r.sku)) skuToIngId.set(r.sku, r.ingredient_id); ajouterRef(r.ingredient_id, r.sku); }
  }
  // Références multiples (alias) : Terre Azur / Mael changent de code selon origine ou calibre
  for (let i = 0; i < skus.length; i += 200) {
    const { data: alias, error: eAlias } = await supabase
      .from("ingredient_supplier_refs")
      .select("sku, ingredient_id")
      .in("supplier_id", supplierAliasIds)
      .in("sku", skus.slice(i, i + 200));
    if (eAlias) throw new Error(eAlias.message);
    for (const r of (alias ?? []) as Array<{ sku: string; ingredient_id: string }>) {
      const k = String(r.sku ?? "").trim();
      if (k && !skuToIngId.has(k)) skuToIngId.set(k, r.ingredient_id);
      ajouterRef(r.ingredient_id, k);
    }
  }

  const nameToIngId = new Map<string, string>();
  const normalizedToIngId = new Map<string, string>();
  const baseNameToIngId = new Map<string, string>();
  const allExisting: Array<{ id: string; name: string; import_name: string | null; supplier_sku?: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: ePage } = await supabase
      .from("ingredients")
      .select("id,name,import_name,supplier_sku")
      .eq("is_active", true)
      .order("created_at")
      .range(from, from + 999);
    if (ePage) throw new Error(ePage.message);
    allExisting.push(...((page ?? []) as Array<{ id: string; name: string; import_name: string | null }>));
    if (!page || page.length < 1000) break;
  }
  for (const r of allExisting) {
    ajouterRef(r.id, r.supplier_sku);
    // Clé primaire = import_name (stable) ; si absent, fallback sur name
    const primary = ((r.import_name ?? r.name) ?? "").trim();
    nameToIngId.set(primary.toLowerCase(), r.id);
    normalizedToIngId.set(normalizeIngredientName(primary), r.id);
    const bn = baseProductName(primary);
    if (bn.length >= 3 && !baseNameToIngId.has(bn)) baseNameToIngId.set(bn, r.id);
    if (r.import_name && r.name) {
      const legacy = (r.name ?? "").trim();
      if (legacy.toLowerCase() !== primary.toLowerCase()) {
        nameToIngId.set(legacy.toLowerCase(), r.id);
        normalizedToIngId.set(normalizeIngredientName(legacy), r.id);
        const bnLegacy = baseProductName(legacy);
        if (bnLegacy.length >= 3 && !baseNameToIngId.has(bnLegacy)) baseNameToIngId.set(bnLegacy, r.id);
      }
    }
  }
  const ignorees = new Set<string>();
  {
    const { data: ign, error: eIgn } = await supabase.from("supplier_refs_ignorees").select("sku").in("supplier_id", supplierAliasIds).range(0, 4999);
    if (eIgn) throw new Error(eIgn.message);
    for (const r of (ign ?? []) as Array<{ sku: string }>) ignorees.add(String(r.sku));
  }
  return { ignorees, refsParFiche, skuToIngId, nameToIngId, normalizedToIngId, baseNameToIngId };
}

/** Fiche correspondant à une ligne (référence puis nom), ou null = « sans fiche ». Mémorise les correspondances trouvées par repli. */
/** Libellés Winopos (Bar Spirits) : « 0,7L | Cynar » → « Cynar » — la contenance en préfixe empêche le rapprochement par nom */
function sansPrefixeContenance(nom: string): string {
  return nom.replace(/^\s*[\d.,]+\s*(?:L|CL|ML)\s*\|\s*/i, "").trim();
}

export function trouverFiche(idx: IndexFiches, skuBrut: string | null | undefined, nomBrut: string | null | undefined): string | null {
  const direct0 = trouverFicheBrut(idx, skuBrut, nomBrut);
  if (direct0) return direct0;
  const nettoye = sansPrefixeContenance((nomBrut ?? "").trim());
  return nettoye && nettoye !== (nomBrut ?? "").trim() ? trouverFicheBrut(idx, skuBrut, nettoye) : null;
}

function trouverFicheBrut(idx: IndexFiches, skuBrut: string | null | undefined, nomBrut: string | null | undefined): string | null {
  const sku = (skuBrut ?? "").trim();
  const nm = (nomBrut ?? "").trim().toUpperCase();
  if (!nm && !sku) return null;
  if (sku && !estRefGenerique(sku) && idx.skuToIngId.has(sku)) return idx.skuToIngId.get(sku)!;
  if (!nm) return null;
  // Ligne sans référence : alias par libellé exact (clé « n:<libellé normalisé> »)
  { const cle = cleReference(sku, nm); if (cle.startsWith("n:") && idx.skuToIngId.has(cle)) return idx.skuToIngId.get(cle)!; }
  // Une ligne qui porte une vraie référence ne se rattache pas PAR LE NOM à une fiche qui en
  // connaît une autre (Moretti 7001 ≠ Moretti Zero 7024 ; Piment rouge 114185 ≠ Peperoncini).
  const coherent = (id: string | undefined | null): string | null => {
    if (!id) return null;
    if (sku && !estRefGenerique(sku)) { const refs = idx.refsParFiche.get(id); if (refs && refs.size && !refs.has(sku)) return null; }
    return id;
  };
  const direct = coherent(idx.nameToIngId.get(nm.toLowerCase())) ?? coherent(idx.normalizedToIngId.get(normalizeIngredientName(nm)));
  if (direct) return direct;
  // Repli 1 : préfixe — un nom de fiche est le début du libellé (ou l'inverse)
  const nmLower = nm.toLowerCase();
  for (const [existingName, existingId] of idx.nameToIngId) {
    if ((nmLower.startsWith(existingName + " ") || existingName.startsWith(nmLower + " ")) && coherent(existingId)) {
      idx.nameToIngId.set(nmLower, existingId);
      idx.normalizedToIngId.set(normalizeIngredientName(nm), existingId);
      return existingId;
    }
  }
  // Repli 2 : nom de base sans poids ni conditionnement (« BURRATA DE VACHE »)
  const bn = baseProductName(nm);
  const matchId = coherent(bn.length >= 3 ? idx.baseNameToIngId.get(bn) : undefined);
  if (matchId) {
    idx.nameToIngId.set(nmLower, matchId);
    idx.normalizedToIngId.set(normalizeIngredientName(nm), matchId);
    return matchId;
  }
  return null;
}
