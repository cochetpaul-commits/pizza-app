# CLAUDE.md — Pizza App

## Projet

App de gestion pour restaurants iFratelli Group (Bello Mio + Piccola Mia).
Recettes, ingredients, fournisseurs, commandes, evenements, pilotage, RH/planning, finances.

## Stack

- **Next.js 16** App Router, **React 19**, **TypeScript 5** strict
- **Supabase** (PostgreSQL + Auth + Storage)
- **CSS inline** (pas de Tailwind en runtime). Max-width 900px, pas d'emoji sauf demande explicite
- **Fonts** : Oswald 700 pour titres (#1a1a1a), DM Sans pour body, Cormorant Garamond pour display
- **Couleurs** : terracotta #D4775A, creme #f2ede4, dark #1a1a1a, border #ddd6c8, muted #999
- **PDF** : `@react-pdf/renderer` (generation), `pdfjs-dist` (parsing)
- **DnD** : `@hello-pangea/dnd`
- **Deploiement** : Vercel (auto-deploy main + develop)

## Commandes

```bash
npm run dev            # Serveur dev
npm run build          # Build prod
npm run lint           # ESLint
npm run build:check    # ESLint --max-warnings 0 + build (bloque push main)
```

## Pre-push hook

`.githooks/pre-push` execute `npm run build:check` sur push vers main.
Activer : `git config core.hooksPath .githooks`

## Variables d'environnement (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENWEATHER_API_KEY
```

## Architecture cle

### Routes principales

| Route | Description |
|---|---|
| `/carte` | Carte : touches Popina (prix, cout, food cost, lien fiche/produit), fiches techniques, preparations, vue equipe. Remplace /recettes, /catalogue, /admin/popina-catalogue (redirections) |
| `/recettes/*` | Recettes v2 (pizza, cuisine, cocktail, empatement) |
| `/ingredients` | Catalogue ingredients |
| `/fournisseurs` | Fiches fournisseurs |
| `/invoices/{supplier}` | Import factures (9 fournisseurs) |
| `/commandes` | Commandes fournisseurs |
| `/evenements` | Evenements (mariage, seminaire...) |
| `/pilotage` | KPIs, CA, marges |
| `/finances` | P&L, food cost |
| `/rh/equipe` | Liste employes |
| `/rh/employe/[id]` | Fiche employe (identite, contrat, absences, admin) |
| `/rh/rapports` | Bilans mensuels, export SILAE |
| `/plannings` | Planning hebdo drag & drop |
| `/admin` | Utilisateurs, roles |

### Composants v2 vs legacy

**TOUJOURS modifier les composants v2** pour les changements sur les recettes :
- `src/components/v2/PizzaFormV2.tsx`, `CuisineFormV2.tsx`, `CocktailFormV2.tsx`, `EmpatementFormV2.tsx`
- Routes v2 : `/recettes/pizza/[id]`, `/recettes/cuisine/[id]`, etc.
- Legacy (`/pizzas/*`, `/kitchen/*`, `/cocktails/*`, `/recipes/*`) : ne plus modifier

### Libs importantes

| Fichier | Role |
|---|---|
| `src/lib/supabaseClient.ts` | Client Supabase cote navigateur |
| `src/lib/supabaseAdmin.ts` | Client Supabase cote serveur (service role) |
| `src/lib/ProfileContext.tsx` | `useProfile()` → role, isAdmin, isDirection, canWrite |
| `src/lib/EtablissementContext.tsx` | `useEtablissement()` → current, isGroupView |
| `src/lib/rbac.ts` | Routes access par role (admin, direction, cuisine) |
| `src/lib/offerPricing.ts` | Calcul prix (CpuByUnit, conversions unites) |
| `src/lib/pdfToText.ts` | Extraction texte PDF (pdfjs-dist) |
| `src/lib/invoices/importEngine.ts` | Import factures unifie |
| `src/hooks/useConventionLegale.ts` | Calculs RH (heures sup, alertes, export SILAE) |
| `src/components/NavBar.tsx` | Navigation avec EtablissementSelector |
| `src/components/RequireRole.tsx` | Guard `<RequireRole allowedRoles={["admin","direction"]}>` |

## Conventions importantes

### Unites canoniques (recettes v2)
- `g` (grammes), `cL` (centilitres), `pcs` (pieces)
- `normalizeUnit()` dans `IngredientListDnD.tsx`

### Pricing
- `CpuByUnit = { g?: number, ml?: number, pcs?: number }` (EUR/unite)
- Pipeline : offre fournisseur → `offerToCpu()` → `enrichCpuWithConversions()` (densite, poids piece)
- Fallbacks : purchase_price → cost_per_unit → cout recette liee
- `cost_per_unit` est une colonne **GENERATED** — ne jamais insert/update directement, utiliser `purchase_price` + `purchase_unit` + `purchase_unit_label`

### Marge
- DB : `margin_rate` (0-1). Lecture coeff : `1 / (1 - margin_rate)`
- Ex: margin_rate=0.70 → coeff=3.33

### Multi-etablissement
- `establishments` (ARRAY) sur kitchen_recipes, prep_recipes
- `establishment` (TEXT, 'both'/'bellomio'/'piccola') sur supplier_offers
- Toujours filtrer par `etab.id` via `useEtablissement()`

### photo_url
- `pizza_recipes.photo_url` ✓
- `kitchen_recipes.photo_url` ✓
- `prep_recipes.photo_url` ✓
- `cocktails.image_url` (PAS photo_url)
- `recipes` (pate) : pas de photo

### PDF generation pattern
```tsx
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
const el = MyPdfDocument({ data }) as unknown as React.ReactElement<DocumentProps>;
const buffer = await renderToBuffer(el);
return new NextResponse(new Uint8Array(buffer), {
  headers: { "Content-Type": "application/pdf" },
});
```

### Conventions legales (RH)
- Bello Mio : HCR IDCC 1979 (seuils 35h/39h/43h, HS 10%/20%/50%)
- Piccola Mia : RAPIDE IDCC 1501 (seuils 35h/39h/43h, HS 10%/20%/50%)

## Tables Supabase (principales)

### Recettes
`pizza_recipes`, `pizza_ingredients`, `kitchen_recipes`, `kitchen_recipe_lines`, `prep_recipes`, `prep_recipe_lines`, `cocktails`, `cocktail_ingredients`, `recipes`, `recipe_phases`, `recipe_ingredients`, `recipe_flours`

### Catalogue & Prix
`ingredients`, `supplier_offers`, `suppliers`, `supplier_invoices`, `supplier_invoice_lines`

### Commandes
`commande_sessions` (status: brouillon→en_attente→validee→recue), `commande_lignes`

### Evenements
`events`, `event_recipes`, `event_documents`

### RH & Planning
`employes`, `contrats`, `contrat_elements`, `postes`, `shifts`, `absences`, `compteurs_employe`, `signatures`

### 17 vues SQL (couts recettes)
`v_latest_offers`, `v_recipe_cost_*`, `v_recipe_lines_*`, `v_recipe_totals_v3`, etc.

## Import factures

9 fournisseurs : METRO, MAEL, VINOFLO, COZIGOU, CARNIATO, BAR SPIRITS, SUM, ARMOR, MASSE
- Parsers : `src/lib/invoices/{nom}.ts`
- Routes API : `src/app/api/invoices/{nom}/route.ts`
- Pages UI : `src/app/invoices/{nom}/page.tsx`
- Flux : FormData → pdfToText → parser → importEngine → Supabase

## Direction artistique (charte, 29/10/2026)

Référence : Base produits et Carte. Tokens et styles partagés dans `src/components/ui/charte.ts`
(BORD, MUTED, FAIBLE, ACCENT, BON, ATTENTION, MAUVAIS, INFO, CADRE, TH, TD, liseret, BTN, filtre,
pastille, h1, INTERTITRE, CHAMP). Toute nouvelle page les utilise ; ne pas redéfinir des couleurs locales.

- **Couleurs** : fond crème #f2ede4, cartes blanches, texte #1a1a1a. Les couleurs vives sont réservées
  aux **catégories** (CAT_COLORS, barres `styleBarreCategorie`) et aux **fournisseurs** (couleur de la fiche).
  Partout ailleurs, code neutre : sombre #1a1a1a (chiffre principal), BON #4a6741, ATTENTION #b7791f,
  MAUVAIS #b4443a, INFO #2563EB, terracotta #D4775A seulement pour l'action principale et le filtre actif.
- **Titres** : h1 Oswald 700 capitales, 28 bureau / 22 téléphone (`h1(bureau)`), sous-titre MUTED 13.
  Intertitres fins en capitales 11px espacées (`INTERTITRE`, `TH`). Titre de cadre : `Cadre` (analyse/Blocs).
- **Tuiles** : `Tuile` (`@/components/ui/Tuile`), fond fondu à la couleur de l'indicateur, chiffre Oswald ;
  cliquables quand elles filtrent (bordure sombre active). Quatre par ligne sur bureau, deux sur téléphone.
- **Cadres** : blanc, bord 1px BORD, rayon 14 (`CADRE`). Pas d'ombre, pas de bord 1,5 ou 2px, pas de fond coloré :
  un état se montre par un liseré 6px à gauche (`boxShadow: inset 6px 0 0 couleur`) et une pastille.
- **Tableaux** : en-tête fin capitales sur fond légèrement teinté #faf7f1 (`TH`), cellules `TD`, première cellule = liseré 6px (`liseret(couleur)`)
  à la couleur de la catégorie ou de l'état, survol #f7f3ec, clic sur la ligne. Téléphone : `TableauMobile`.
- **Barres de catégorie** : `styleBarreCategorie` (dégradé plein, titre blanc Oswald, pastille blanche, chevron) ;
  le contenu s'accroche dessous dans un cadre aux coins du bas arrondis.
- **Pastilles** : pleines, 11px gras, rayon 8, fond teinté 12 % + texte couleur (`pastille(couleur)`) ;
  blanches sur une barre (`stylePastilleBarre`). Seulement pour les exceptions et les états.
- **Boutons** : pilules (`BTN`, rayon 20, bord BORD), action principale terracotta pleine, validation BON pleine,
  danger texte MAUVAIS. Filtres : `filtre(actif)` (bord terracotta, fond #f5e9e2 quand actif).
- **Champs** : `CHAMP` (36px, rayon 10, bord 1px) ; recherche en pilule (rayon 20).
- **Volets** : `VoletDroit` à droite sur bureau, feuille plein écran sur téléphone. Modals : rayon 16.
- **États vides** : `EtatVide` (icône ronde, titre, phrase, action). Chargement : texte MUTED centré.
- **Responsive** : `useBureau()` ; page max-width 900 (1100 pour l'analyse), padding 18/28 bureau, 12/14 téléphone.
- Pas d'emoji, pas de dégradés hors barres de catégorie, pas de couleur par page.

## Patterns UI (rappels)

- Pages : `"use client"`, inline CSS
- Guard : `<RequireRole permission="…">` ou `allowedRoles`
- Listes : clic sur la ligne → volet ou `router.push`
- Modals : overlay fixed + div centrée, border-radius 16, box-shadow

## StepperInput component
```tsx
<StepperInput value={qty} onChange={setQty} step={0.5} min={0} placeholder="0" />
```
Props : `{ value: number | "", onChange: (v: number | "") => void, step?, min?, max?, placeholder?, disabled? }`
