# Décisions techniques — Calcul des prix recettes

## Unités canoniques dans les fiches recettes

Les formulaires V2 (Pizza, Cuisine, Cocktail) utilisent 3 unités canoniques :
- **g** (grammes)
- **cL** (centilitres — stocké comme `"cL"`, comparé en lowercase `"cl"`)
- **pcs** (pièces)

La fonction `normalizeUnit()` (`IngredientListDnD.tsx`) convertit toute unité
en l'une de ces 3 :
- `g`, `kg` → `"g"`
- `ml`, `cl`, `l` → `"cL"`
- `pc`, `pcs`, `pce`, `piece`, `pièce` → `"pcs"`

## Structure des prix : CpuByUnit

Le type `CpuByUnit` (défini dans `offerPricing.ts`) stocke le coût par unité de base :
```ts
{ g?: number;   // €/g
  ml?: number;  // €/ml
  pcs?: number; // €/pcs }
```

## Pipeline de calcul du prix

### 1. Conversion offre → CpuByUnit (`offerToCpu`)
| Unité offre | Résultat CpuByUnit |
|---|---|
| `kg` | `{ g: prix / 1000 }` |
| `g` | `{ g: prix }` |
| `l` | `{ ml: prix / 1000 }` |
| `ml` | `{ ml: prix }` |
| `pc/pcs/…` | `{ pcs: prix }` |
| `pack/colis/…` | Décomposé via `cpuFromPack` puis reconverti |

### 2. Enrichissement croisé (`enrichCpuWithConversions`)
Si `density_kg_per_l` est disponible sur l'offre :
- `cpu.g` existe, `cpu.ml` manquant → `cpu.ml = cpu.g × densité`
- `cpu.ml` existe, `cpu.g` manquant → `cpu.g = cpu.ml / densité`

Si `piece_weight_g` est disponible :
- `cpu.pcs` existe, `cpu.g` manquant → `cpu.g = cpu.pcs / piece_weight_g`

### 3. Fallbacks dans les formulaires (CuisineFormV2, PizzaFormV2, CocktailFormV2)
Si aucune offre fournisseur n'existe :
1. **purchase_price / purchase_unit** de l'ingrédient → converti comme `offerToCpu`
2. **cost_per_unit** legacy → mappé à `{ g: cost_per_unit }`
3. **kitchen_recipes / prep_recipes** → coût/kg de la recette liée

### 4. Calcul du coût d'une ligne (`computeCost` dans IngredientListDnD)
| Unité ligne | CPU utilisé | Facteur |
|---|---|---|
| `g` | `cpu.g` | × qty |
| `kg` | `cpu.g` | × qty × 1000 |
| `cl` | `cpu.ml` | × qty × 10 |
| `ml` | `cpu.ml` | × qty |
| `l` | `cpu.ml` | × qty × 1000 |
| `pcs` | `cpu.pcs` | × qty |

### 5. Traitement spécifique cocktails (`CocktailFormV2`)
- Unité canonique liquide = `cL` (pas ml)
- Conversion pcs → ml via `piece_volume_ml` pour les bouteilles
- Le cL est le standard d'affichage pour les fiches cocktail
- **Ne pas toucher à cette logique.**

## Bug corrigé : conversion croisée g ↔ ml manquante

### Problème
Ingrédient catalogué en `L` ou `kg` → `CpuByUnit` n'a qu'une dimension
(soit `g`, soit `ml`). Si la fiche recette utilise l'autre dimension,
`computeCost` retournait `null` → prix affiché "—".

Cas concret : huile d'olive vendue au litre → `{ ml: 0.0085 }`.
Recette saisie en `g` → `cpu.g` undefined → pas de prix.

### Cause
Les fallbacks (purchase_price, cost_per_unit) ne passaient pas par
`enrichCpuWithConversions`, contrairement au chemin principal (`offerRowToCpu`).
La densité `density_g_per_ml` de l'ingrédient n'était pas exploitée.

### Correction
Exporter `enrichCpuWithConversions` depuis `offerPricing.ts` et l'appliquer
dans les 3 fallbacks des formulaires V2 en utilisant `density_g_per_ml` de
l'ingrédient (numériquement identique à `density_kg_per_l` : 1 kg/L = 1 g/mL).
