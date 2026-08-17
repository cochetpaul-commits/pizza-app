# Audit de l'application — 15 août 2026 (nuit)

Audit complet : build de production, code mort, performance, fiabilité.
Fait par Claude ; les éléments cochés sont **déjà corrigés et déployés**.

## Corrigé cette nuit

### Bloquant
- [x] **Les déploiements Vercel échouaient depuis l'après-midi** (5 déploiements
  en erreur) : une erreur de type dans l'inventaire passait inaperçue en dev
  (le serveur de dev ne fait pas le type-check). La prod était figée sur une
  vieille version. → Corrigé, et le build complet fait désormais partie de la
  routine avant push (voir « Règles » plus bas).

### « L'appli recharge sans arrêt » — causes trouvées et corrigées
- [x] Supabase ré-émet un événement `SIGNED_IN` à chaque `getSession()` ;
  `ProfileContext` et `EtablissementContext` rechargeaient alors tout le profil
  et démontaient l'application entière (boucle infinie possible, requêtes en
  rafale). → Garde « même utilisateur = ne rien faire » dans les deux contextes.
- [x] Le service worker qui figeait l'app sur de vieilles versions (corrigé le
  14/08, rappelé ici pour mémoire).
- [x] Les 5 contextes React (profil, établissement, thème, topbar, bottombar)
  recréaient leur valeur à chaque render → tous les menus/gardes se
  re-rendaient en permanence. → Valeurs mémoïsées.

### Poids et vitesse
- [x] Icônes HACCP servies brutes : 2,0 Mo → 292 Ko.
- [x] `optimizePackageImports` (lucide-react, recharts, dnd).
- [x] `next.config.mjs` en doublon supprimé (piège : Next l'ignorait).

### Code mort (~9 000 lignes supprimées)
- [x] 21 composants jamais importés, 4 hooks morts, l'ancien parser IA de
  factures (542 l.), 470 lignes de blocs jamais affichés dans la fiche
  employé, la moitié de SidebarNav.ts, 4 dépendances npm inutilisées.
- [x] Redirections cassées `/bello-mio/planning` et `/piccola-mia/planning`
  (pointaient vers une page inexistante → 404) → redirigent vers /rh/conges.
- [x] `@anthropic-ai/sdk` était en devDependencies alors qu'il sert en prod
  (routes /api/claude) → déplacé.

## À faire ensuite (par ordre d'impact)

### Performance — gros gains restants
1. **Charts en import dynamique** : `chart.js/auto` (~200 Ko) est chargé sur
   7 pages, `recharts` (~300 Ko) sur 4 autres — et les deux libs coexistent.
   Passer les graphiques en `next/dynamic({ ssr: false })` et à terme garder
   une seule lib. C'est LE plus gros gain de vitesse de chargement restant.
   - [x] *(17/08/2026)* Les 3 pages `recharts` sont faites : le graphique de
     chaque page est extrait dans un petit composant dédié
     (`PriceEvolutionChart.tsx`, `PriceVariationsChart.tsx`,
     `FoodCostTrendChart.tsx` + `CategoryProfitChart.tsx`) et chargé via
     `next/dynamic({ ssr: false })` — `ingredients/[id]`,
     `achats` (StatsAchatsContent), `finances`.
   - [ ] **Reste à faire** : les 7 pages `chart.js/auto` (`ventes/marges`,
     `ventes`, `achats`, `tresorerie`, `piccola-mia`, `dashboard`,
     `bello-mio`). Ce sont toutes des utilisations impératives (canvas +
     `useRef`/`useEffect`, pas du JSX déclaratif) — l'extraction est un peu
     plus délicate que pour recharts mais suit le même principe : sortir le
     `<canvas>` + la logique `new Chart(...)` dans un composant `"use
     client"` séparé, importé en `next/dynamic({ ssr: false })` depuis la
     page. À faire une poignée de pages à la fois pour rester dans le budget
     de lignes.
2. **`v_latest_offers` téléchargée en entier** (toutes les offres de tous les
   fournisseurs) à chaque ouverture d'un formulaire de recette — 6 composants
   concernés. Filtrer par les ingrédients affichés, comme le fait déjà
   `/epicerie`.
3. **Requêtes en boucle (N+1)** : `commandes/page.tsx` fait une requête par
   fournisseur (2 boucles), `settings/categories` un update par catégorie…
   Remplacer par `.in(...)` et des upserts de tableau.
4. **Dashboard / bello-mio / piccola-mia / tresorerie** paginent
   `ventes_lignes` par 1000 côté client pour faire de simples sommes →
   déplacer l'agrégation côté serveur (comme `/api/ventes/stats`).
5. Pages géantes à découper (commandes 2852 l., ventes 2667 l., catalogue
   2232 l.…) : extraire onglets/modales en `next/dynamic`.

### Décisions produit (à trancher par Paul/Pierre)
- `/messagerie` (376 l. + hook) : aucune entrée de menu n'y mène. Feature à
  lancer ou à supprimer ?
- `/finances` (601 l.) : doublonnée par /pilotage et /tresorerie ?
- `/stats-achats` (598 l.) : même contenu que /achats et /variations-prix.
- `/ventes/insights` (190 l.) : inaccessible depuis les menus.
- Deux paires de migrations au nom identique (contenu à comparer) :
  `add_ingredient_status` (0204) et `etablissements` (0312/0313).

### Divers
- 40 warnings ESLint restants (variables inutilisées mineures).
- `babel-plugin-react-compiler` en devDeps sans config visible — à confirmer
  puis retirer.
- Vignettes `<img>` brutes dans CatalogueSalleTab et StepsList → `next/image`.

## Règles pour la suite (leçons de cette nuit)

1. **Toujours `npx next build` avant de pousser** un changement non trivial :
   le dev server ne fait ni type-check ni lint bloquant. C'est ce qui a cassé
   la prod aujourd'hui sans que rien ne le signale en local.
2. Ne jamais lancer `next build` pendant que le serveur de dev tourne
   (ils partagent `.next` → build corrompu).
3. Toute nouvelle page doit être ajoutée à `ROUTE_ACCESS` (src/lib/rbac.ts) —
   deny par défaut pour les non-admins.
4. Ne pas retirer les gardes anti-`SIGNED_IN` des contextes.
