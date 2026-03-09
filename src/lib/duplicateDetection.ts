import type { Ingredient, LatestOffer } from "@/types/ingredients";

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

export interface DuplicatePair {
  a: Ingredient;
  b: Ingredient;
  score: number;
  pairKey: string;
}

export function detectDuplicates(
  ingredients: Ingredient[],
  offersByIngredientId: Map<string, LatestOffer>,
  ignoreKeys: Set<string>,
  threshold = 0.80
): DuplicatePair[] {
  // Only active ingredients
  const active = ingredients.filter((i) => i.is_active);

  // Group by supplier_id (null → own group)
  const bySupplier = new Map<string | null, Ingredient[]>();
  for (const ing of active) {
    const key = offersByIngredientId.get(ing.id)?.supplier_id ?? ing.supplier_id ?? null;
    const group = bySupplier.get(key);
    if (group) {
      group.push(ing);
    } else {
      bySupplier.set(key, [ing]);
    }
  }

  const pairs: DuplicatePair[] = [];

  for (const group of bySupplier.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const [id1, id2] = [a.id, b.id].sort();
        const pairKey = `${id1}|${id2}`;
        if (ignoreKeys.has(pairKey)) continue;
        const score = similarity(a.name, b.name);
        if (score >= threshold) {
          pairs.push({ a, b, score, pairKey });
        }
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  return pairs;
}
