// src/lib/pateEngine.ts
//
// Moteur de calcul des empâtements (réécrit le 01/11/2026, brief « module pâte »).
// Tout se calcule en pourcentages boulanger sur la farine totale :
//   pâte visée = pâtons × poids calculé, poids calculé = poids détaillé × (1 + marge de perte)
//   farine totale = pâte visée ÷ (1 + eau + sel + miel + huile + levure), la levure comprise pour que la pâte
//   pesée tombe exactement sur la pâte visée (brief v2, 01/11/2026)
// Biga : une part de la farine totale (biga_percent) part dans la biga, remplie en priorité avec la
// farine désignée ; toute la levure va dans la biga. Le reste des farines part au pétrissage final,
// dont l'eau se sépare en eau de départ (avec le miel dissous) et eau de bassinage.

export type EmpatementType = "direct" | "biga" | "focaccia";

export type FlourMixItem = {
  name: string; // ex: "Tipo 0 Soffio"
  percent: number; // part de la farine totale (doit totaliser 100)
  ingredient_id?: string | null;
};

export type RecipePercents = {
  hydration_total: number; // % eau total (sur farine totale)
  salt_percent: number; // % sel (sur farine totale)
  honey_percent?: number | null; // % miel
  oil_percent?: number | null; // % huile

  /** direct / focaccia : levure sur la farine totale */
  yeast_percent?: number | null;

  /** biga : part de la farine totale qui va dans la biga (défaut 50) */
  biga_percent?: number | null;
  /** biga : eau sur la farine de biga (défaut 45) */
  biga_hydration?: number | null;
  /** biga : levure fraîche sur la farine de biga (défaut 0,5). Toute la levure est dans la biga. */
  biga_yeast_percent?: number | null;
  /** biga : nom de la farine qui remplit la biga en priorité (défaut : la première du mélange) */
  biga_flour?: string | null;

  /** part de l'eau du pétrissage final versée au départ, le reste en bassinage (défaut 80) */
  water_start_pct?: number | null;
  /** marge de perte sur le poids du pâton, en % (défaut 0 ; 1,5 chez Bello Mio) */
  loss_margin_pct?: number | null;
  /** capacité du pétrin en pâtons ; au delà, on propose deux pétrissages (0 = pas de limite) */
  mixer_max_balls?: number | null;
};

export type CalcParams = {
  type: EmpatementType;
  nbPatons: number; // N
  poidsPaton: number; // poids détaillé d'un pâton, en grammes
  recipe: RecipePercents;
  flourMix?: FlourMixItem[]; // si non fourni -> 100 % "Farine"
};

export type IngredientTotals = {
  flour_total_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number; // levure totale (dans la biga pour une biga)
};

export type FlourBreakdown = { name: string; grams: number; percent: number; ingredient_id?: string | null };

export type Phase = {
  name: string;
  /** « biga », « final » (pétrissage final d'une biga) ou « unique » (directe, focaccia) */
  kind: "biga" | "final" | "unique";
  flour_g: number;
  /** farines de la phase, par nom */
  flours: FlourBreakdown[];
  water_g: number;
  /** pétrissage : eau versée au départ (avec le miel dissous) et eau de bassinage ; absents pour la biga */
  water_start_g?: number;
  water_bassinage_g?: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number;
};

export type PateResult = {
  summary: {
    type: EmpatementType;
    nbPatons: number;
    /** poids détaillé d'un pâton (ex. 260) */
    poidsPaton_g: number;
    /** poids retenu pour le calcul, marge comprise (ex. 264) */
    poidsCalcule_g: number;
    loss_margin_pct: number;
    /** pâte visée : pâtons × poids calculé */
    total_dough_g: number;
    /** tout ce qui est pesé, levure comprise */
    total_ingredients_g: number;
    factor: number;
    hydration_total_pct: number;
    /** capacité du pétrin et découpe proposée au delà */
    mixer_max_balls: number;
    lots: number[];
  };

  flour_total_g: number;
  flour_breakdown: FlourBreakdown[];
  totals: IngredientTotals;
  phases: Phase[];
  warnings: string[];
};

const EPS = 1e-9;

function n(v: unknown): number {
  const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(x) ? x : 0;
}
const roundG = (x: number) => Math.round(x);
const sumMix = (mix: FlourMixItem[]) => mix.reduce((acc, it) => acc + n(it.percent), 0);

function normalizeMix(mix?: FlourMixItem[]): FlourMixItem[] {
  if (!mix || mix.length === 0) return [{ name: "Farine", percent: 100 }];
  const cleaned = mix
    .map((it) => ({ name: (it.name || "Farine").trim(), percent: n(it.percent), ingredient_id: it.ingredient_id ?? null }))
    .filter((it) => it.percent > 0);
  if (cleaned.length === 0) return [{ name: "Farine", percent: 100 }];
  return cleaned;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Poids de calcul d'un pâton : poids détaillé plus la marge de perte, au gramme */
export function poidsCalcule(poidsPaton: number, lossMarginPct: number): number {
  return Math.round(n(poidsPaton) * (1 + n(lossMarginPct) / 100));
}

/** Découpe en pétrissages quand le pétrin ne prend pas tout : parts égales, les premières plus grosses d'un pâton */
export function decouperLots(nbPatons: number, max: number): number[] {
  const N = Math.max(0, Math.floor(n(nbPatons)));
  const M = Math.floor(n(max));
  if (N === 0) return [];
  if (M <= 0 || N <= M) return [N];
  const k = Math.ceil(N / M);
  const base = Math.floor(N / k), reste = N - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < reste ? 1 : 0));
}

/**
 * Répartition des farines entre la biga et le pétrissage final.
 * La biga (bigaG grammes) se remplit en priorité avec la farine désignée ; s'il en manque, le complément
 * se prend sur les autres farines au prorata, et on le signale.
 */
export function repartirFarines(
  breakdown: FlourBreakdown[], bigaG: number, bigaFlour: string | null | undefined,
): { biga: FlourBreakdown[]; final: FlourBreakdown[]; complement: boolean } {
  const cible = bigaFlour?.trim().toLowerCase();
  const designee = (cible && breakdown.find((f) => f.name.trim().toLowerCase() === cible)) || breakdown[0];
  const biga: FlourBreakdown[] = [];
  const final: FlourBreakdown[] = [];
  const prisDesignee = Math.min(designee.grams, bigaG);
  let manque = bigaG - prisDesignee;
  const autres = breakdown.filter((f) => f !== designee);
  const dispoAutres = autres.reduce((t, f) => t + f.grams, 0);
  const complement = manque > EPS && dispoAutres > EPS;
  for (const f of breakdown) {
    let pris = 0;
    if (f === designee) pris = prisDesignee;
    else if (complement) pris = Math.min(f.grams, manque * (f.grams / dispoAutres));
    if (pris > EPS) biga.push({ ...f, grams: pris, percent: f.percent * (pris / f.grams) });
    const reste = f.grams - pris;
    if (reste > EPS) final.push({ ...f, grams: reste, percent: f.percent * (reste / f.grams) });
  }
  if (!complement) manque = 0;
  return { biga, final, complement };
}

export function calculerPate(params: CalcParams): PateResult {
  const warnings: string[] = [];

  const type = params.type;
  const N = n(params.nbPatons);
  const G = n(params.poidsPaton);
  const recipe = params.recipe;
  const marge = Math.max(0, n(recipe.loss_margin_pct ?? 0));
  const Gc = poidsCalcule(G, marge);
  const T = N * Gc;

  assert(N > 0 && Number.isFinite(N), "nbPatons invalide");
  assert(G > 0 && Number.isFinite(G), "poidsPaton invalide");
  assert(T > 0, "Poids total de pâte invalide");

  const hydration = n(recipe.hydration_total);
  const salt = n(recipe.salt_percent);
  const honey = n(recipe.honey_percent ?? 0);
  const oil = n(recipe.oil_percent ?? 0);
  const yeast = n(recipe.yeast_percent ?? 0);
  const bigaPct = recipe.biga_percent == null ? 50 : n(recipe.biga_percent);
  const bigaHyd = recipe.biga_hydration == null ? 45 : n(recipe.biga_hydration);
  const bigaYeast = recipe.biga_yeast_percent == null ? 0.5 : n(recipe.biga_yeast_percent);
  const waterStartPct = recipe.water_start_pct == null ? 80 : Math.max(0, Math.min(100, n(recipe.water_start_pct)));
  const mixerMax = Math.max(0, Math.floor(n(recipe.mixer_max_balls ?? 0)));

  assert(hydration >= 0, "Hydratation invalide");
  assert(salt >= 0, "Sel invalide");
  assert(honey >= 0, "Miel invalide");
  assert(oil >= 0, "Huile invalide");
  assert(yeast >= 0, "Levure invalide");
  if (type === "biga") {
    assert(bigaPct > 0 && bigaPct <= 100, "Part de biga invalide");
    assert(bigaHyd >= 0, "Hydratation de la biga invalide");
    assert(bigaYeast >= 0, "Levure de biga invalide");
  }

  const mix = normalizeMix(params.flourMix);
  const mixSum = sumMix(mix);
  if (Math.abs(mixSum - 100) > 1e-6) warnings.push("Le mélange de farines ne fait pas 100 %.");

  // 1) Facteur, levure comprise : pour une biga, la levure est un % de la farine de biga, elle même un % de la farine totale
  const yeastShare = type === "biga" ? (bigaPct / 100) * (bigaYeast / 100) : yeast / 100;
  const factor = 1 + (hydration + salt + honey + oil) / 100 + yeastShare;
  assert(factor > 1 - EPS, "Facteur invalide");

  // 2) Farine totale et totaux
  const flourTotal = T / factor;
  assert(flourTotal > 0, "Farine totale invalide");
  const waterTotal = flourTotal * (hydration / 100);
  const saltTotal = flourTotal * (salt / 100);
  const honeyTotal = flourTotal * (honey / 100);
  const oilTotal = flourTotal * (oil / 100);

  // 3) Détail farines (sur le total)
  const flourBreakdown: FlourBreakdown[] = mix.map((it) => ({
    name: it.name, percent: it.percent, ingredient_id: it.ingredient_id ?? null, grams: flourTotal * (it.percent / mixSum),
  }));

  // 4) Phases
  const phases: Phase[] = [];
  let totalsYeast: number;
  const splitWater = (w: number) => ({ water_start_g: w * (waterStartPct / 100), water_bassinage_g: w * (1 - waterStartPct / 100) });

  if (type === "biga") {
    const flourBiga = flourTotal * (bigaPct / 100);
    const waterBiga = flourBiga * (bigaHyd / 100);
    const yeastBiga = flourBiga * (bigaYeast / 100);
    const rep = repartirFarines(flourBreakdown, flourBiga, recipe.biga_flour);
    if (rep.complement) {
      const nomDesignee = recipe.biga_flour?.trim() || flourBreakdown[0].name;
      warnings.push(`La farine ${nomDesignee} ne suffit pas à remplir la biga : complétée avec les autres farines au prorata.`);
    }

    const flourP2 = flourTotal - flourBiga;
    let waterP2 = waterTotal - waterBiga;
    if (waterP2 < 0) {
      warnings.push("Hydratation trop basse pour la biga : plus d'eau au pétrissage final (ramenée à 0).");
      waterP2 = 0;
    }

    phases.push({ name: "Phase 1 - Biga", kind: "biga", flour_g: flourBiga, flours: rep.biga, water_g: waterBiga, salt_g: 0, honey_g: 0, oil_g: 0, yeast_g: yeastBiga });
    phases.push({
      name: "Phase 2 - Pâte finale", kind: "final", flour_g: flourP2, flours: rep.final, water_g: waterP2, ...splitWater(waterP2),
      salt_g: saltTotal, honey_g: honeyTotal, oil_g: oilTotal, yeast_g: 0,
    });
    totalsYeast = yeastBiga;
  } else {
    const yeastTotal = flourTotal * (yeast / 100);
    phases.push({
      name: "Empâtement unique", kind: "unique", flour_g: flourTotal, flours: flourBreakdown.map((f) => ({ ...f })), water_g: waterTotal, ...splitWater(waterTotal),
      salt_g: saltTotal, honey_g: honeyTotal, oil_g: oilTotal, yeast_g: yeastTotal,
    });
    totalsYeast = yeastTotal;
  }

  // 5) Capacité du pétrin
  const lots = decouperLots(N, mixerMax);
  if (lots.length > 1) warnings.push(`${N} pâtons dépassent la capacité du pétrin (${mixerMax}) : couper en ${lots.length} pétrissages de ${lots.join(" et ")} pâtons.`);

  const totalIngredients = flourTotal + waterTotal + saltTotal + honeyTotal + oilTotal + totalsYeast;
  const arrondir = (f: FlourBreakdown): FlourBreakdown => ({ ...f, grams: roundG(f.grams), percent: Math.round(f.percent * 100) / 100 });

  const result: PateResult = {
    summary: {
      type, nbPatons: N, poidsPaton_g: G, poidsCalcule_g: Gc, loss_margin_pct: marge,
      total_dough_g: T, total_ingredients_g: roundG(totalIngredients), factor, hydration_total_pct: hydration,
      mixer_max_balls: mixerMax, lots,
    },
    flour_total_g: roundG(flourTotal),
    flour_breakdown: flourBreakdown.map(arrondir),
    totals: {
      flour_total_g: roundG(flourTotal), water_g: roundG(waterTotal), salt_g: roundG(saltTotal),
      honey_g: roundG(honeyTotal), oil_g: roundG(oilTotal), yeast_g: roundG(totalsYeast),
    },
    phases: phases.map((p) => ({
      ...p,
      flour_g: roundG(p.flour_g), flours: p.flours.map(arrondir), water_g: roundG(p.water_g),
      ...(p.water_start_g != null ? { water_start_g: roundG(p.water_start_g) } : {}),
      ...(p.water_bassinage_g != null ? { water_bassinage_g: roundG(p.water_bassinage_g) } : {}),
      salt_g: roundG(p.salt_g), honey_g: roundG(p.honey_g), oil_g: roundG(p.oil_g), yeast_g: roundG(p.yeast_g),
    })),
    warnings,
  };

  const flourPhases = result.phases.reduce((acc, p) => acc + p.flour_g, 0);
  if (Math.abs(flourPhases - result.totals.flour_total_g) > 2) result.warnings.push("Incohérence d'arrondis sur la farine (phases).");

  return result;
}
