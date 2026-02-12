// src/lib/pateEngine.ts

export type EmpatementType = "direct" | "biga" | "focaccia";

export type FlourMixItem = {
  name: string; // ex: "Tipo 00"
  percent: number; // ex: 70 (doit totaliser 100)
};

export type RecipePercents = {
  hydration_total: number; // % eau total (sur farine totale)
  salt_percent: number; // % sel (sur farine totale)

  honey_percent?: number | null; // % miel
  oil_percent?: number | null; // % huile

  // direct/focaccia : levure unique (% sur farine totale)
  yeast_percent?: number | null;

  // biga : levure phase 2 (boost frigo) (% sur farine phase2)
  biga_yeast_percent?: number | null;
};

export type CalcParams = {
  type: EmpatementType;
  nbPatons: number; // N
  poidsPaton: number; // G en grammes
  recipe: RecipePercents;

  flourMix?: FlourMixItem[]; // si non fourni -> 100% "Farine"
};

export type IngredientTotals = {
  flour_total_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number; // total levure (direct/focaccia) ou total biga (phase1 + phase2)
};

export type Phase = {
  name: string;
  flour_g: number;
  water_g: number;
  salt_g: number;
  honey_g: number;
  oil_g: number;
  yeast_g: number;
};

export type FlourBreakdown = {
  name: string;
  grams: number;
  percent: number;
};

export type PateResult = {
  summary: {
    type: EmpatementType;
    nbPatons: number;
    poidsPaton_g: number;
    total_dough_g: number;
    factor: number;
    hydration_total_pct: number;
  };

  flour_total_g: number;
  flour_breakdown: FlourBreakdown[];

  totals: IngredientTotals;

  phases: Phase[];

  warnings: string[];
};

/** Constantes BIGA V1 (figées) */
const BIGA_FLOUR_PCT = 50; // % de farine en biga (sur farine totale)
const BIGA_HYDRATION_PCT = 45; // % eau sur farine biga
const BIGA_YEAST_PCT = 0.5; // % levure sur farine biga
const EPS = 1e-9;

function n(v: unknown): number {
  const x =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v)
      : 0;
  return Number.isFinite(x) ? x : 0;
}

function roundG(x: number): number {
  return Math.round(x);
}

function sumMix(mix: FlourMixItem[]): number {
  return mix.reduce((acc, it) => acc + n(it.percent), 0);
}

function normalizeMix(mix?: FlourMixItem[]): FlourMixItem[] {
  if (!mix || mix.length === 0) return [{ name: "Farine", percent: 100 }];

  const cleaned = mix
    .map((it) => ({ name: (it.name || "Farine").trim(), percent: n(it.percent) }))
    .filter((it) => it.percent > 0);

  if (cleaned.length === 0) return [{ name: "Farine", percent: 100 }];
  return cleaned;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function calculerPate(params: CalcParams): PateResult {
  const warnings: string[] = [];

  const type = params.type;
  const N = n(params.nbPatons);
  const G = n(params.poidsPaton);
  const T = N * G;

  assert(N > 0 && Number.isFinite(N), "nbPatons invalide");
  assert(G > 0 && Number.isFinite(G), "poidsPaton invalide");
  assert(T > 0, "Poids total de pâte invalide");

  const recipe = params.recipe;
  const hydration = n(recipe.hydration_total);
  const salt = n(recipe.salt_percent);
  const honey = n(recipe.honey_percent ?? 0);
  const oil = n(recipe.oil_percent ?? 0);

  // direct/focaccia
  const yeast = n(recipe.yeast_percent ?? 0);

  // biga : levure phase2 (boost frigo) - exprimée sur farine phase2
  const bigaYeastP2Pct = n(recipe.biga_yeast_percent ?? 0);

  assert(hydration >= 0, "Hydratation invalide");
  assert(salt >= 0, "Sel invalide");
  assert(honey >= 0, "Miel invalide");
  assert(oil >= 0, "Huile invalide");
  if (type === "direct" || type === "focaccia") {
    assert(yeast >= 0, "Levure invalide");
  }
  if (type === "biga") {
    assert(bigaYeastP2Pct >= 0, "Levure (phase 2) invalide");
  }

  const mix = normalizeMix(params.flourMix);
  const mixSum = sumMix(mix);

  // Ici : on est strict, mais on évite de te casser l’UI sur des micro-arrondis
  if (Math.abs(mixSum - 100) > 1e-6) {
    warnings.push("Mix farines ≠ 100% (corrigé côté UI / sauvegarde).");
  }

  // 1) Facteur
  let factor: number;

  if (type === "direct" || type === "focaccia") {
    factor = 1 + (hydration + salt + yeast + honey + oil) / 100;
  } else {
    // BIGA: on inclut la levure de phase 2 dans le poids final (levure phase 1 = constante faible, on la laisse hors facteur)
    factor = 1 + (hydration + salt + honey + oil) / 100;
  }

  assert(factor > 1 - EPS, "Facteur invalide");

  // 2) Farine totale
  const flourTotal = T / factor;
  assert(flourTotal > 0, "Farine totale invalide");

  // 3) Totaux
  const waterTotal = flourTotal * (hydration / 100);
  const saltTotal = flourTotal * (salt / 100);
  const honeyTotal = flourTotal * (honey / 100);
  const oilTotal = flourTotal * (oil / 100);

  // 4) Détail farines
  const flourBreakdown: FlourBreakdown[] = mix.map((it) => ({
    name: it.name,
    percent: it.percent,
    grams: flourTotal * (it.percent / 100),
  }));

  // 5) Phases
  const phases: Phase[] = [];
  let totalsYeast: number;

  if (type === "biga") {
    const flourBiga = flourTotal * (BIGA_FLOUR_PCT / 100);
    const waterBiga = flourBiga * (BIGA_HYDRATION_PCT / 100);
    const yeastBiga = flourBiga * (BIGA_YEAST_PCT / 100);

    const flourP2 = flourTotal - flourBiga;

    // eau phase2 = eau totale - eau biga (peut devenir négative pendant saisie → on clamp + warning)
    let waterP2 = waterTotal - waterBiga;
    if (waterP2 < 0) {
      warnings.push("Hydratation trop basse pour BIGA : eau phase 2 négative (corrigé à 0).");
      waterP2 = 0;
    }

    // levure phase2 (boost frigo) : % sur farine phase2
    const yeastP2 = flourP2 * (bigaYeastP2Pct / 100);

    phases.push({
      name: "Phase 1 - Biga",
      flour_g: flourBiga,
      water_g: waterBiga,
      salt_g: 0,
      honey_g: 0,
      oil_g: 0,
      yeast_g: yeastBiga,
    });

    phases.push({
      name: "Phase 2 - Final",
      flour_g: flourP2,
      water_g: waterP2,
      salt_g: saltTotal,
      honey_g: honeyTotal,
      oil_g: oilTotal,
      yeast_g: yeastP2, // <-- levure phase 2 affichée si tu en mets
    });

    totalsYeast = yeastBiga + yeastP2;
  } else {
    const yeastTotal = flourTotal * (yeast / 100);
    phases.push({
      name: "Empâtement unique",
      flour_g: flourTotal,
      water_g: waterTotal,
      salt_g: saltTotal,
      honey_g: honeyTotal,
      oil_g: oilTotal,
      yeast_g: yeastTotal,
    });
    totalsYeast = yeastTotal;
  }

  // 6) Sortie (arrondie)
  const result: PateResult = {
    summary: {
      type,
      nbPatons: N,
      poidsPaton_g: G,
      total_dough_g: T,
      factor,
      hydration_total_pct: hydration,
    },

    flour_total_g: roundG(flourTotal),
    flour_breakdown: flourBreakdown.map((f) => ({
      name: f.name,
      percent: f.percent,
      grams: roundG(f.grams),
    })),

    totals: {
      flour_total_g: roundG(flourTotal),
      water_g: roundG(waterTotal),
      salt_g: roundG(saltTotal),
      honey_g: roundG(honeyTotal),
      oil_g: roundG(oilTotal),
      yeast_g: roundG(totalsYeast),
    },

    phases: phases.map((p) => ({
      name: p.name,
      flour_g: roundG(p.flour_g),
      water_g: roundG(p.water_g),
      salt_g: roundG(p.salt_g),
      honey_g: roundG(p.honey_g),
      oil_g: roundG(p.oil_g),
      yeast_g: roundG(p.yeast_g),
    })),

    warnings,
  };

  // Sanity: somme farine phases
  const flourPhases = result.phases.reduce((acc, p) => acc + p.flour_g, 0);
  if (Math.abs(flourPhases - result.totals.flour_total_g) > 2) {
    result.warnings.push("Incohérence d’arrondis sur la farine (phases).");
  }

  return result;
}