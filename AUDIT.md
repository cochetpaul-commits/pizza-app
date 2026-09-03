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
   - [x] *(24/08/2026)* `bello-mio` et `piccola-mia` : le graphique « CA par
     jour » (bar chart Chart.js identique sur les deux pages, seule la
     couleur change) est extrait dans un composant partagé
     `src/components/charts/DailyCaBarChart.tsx`, chargé via
     `next/dynamic({ ssr: false })`. `import Chart from "chart.js/auto"` et
     les `useRef`/`useEffect` associés ont disparu de ces deux pages.
   - [x] *(31/08/2026)* `dashboard` : le graphique « CA par jour » (multi-
     établissements, barres empilées) extrait dans
     `src/components/charts/DashboardCaBarChart.tsx`, chargé via
     `next/dynamic({ ssr: false })`. `import Chart from "chart.js/auto"` et
     le `useRef`/`useEffect` de dessin ont disparu de la page (au passage,
     l'import mort `AiInsightCard` a été retiré, -1 warning ESLint).
   - [ ] **Reste à faire** : `tresorerie` n'utilise déjà plus `chart.js/auto`
     (vérifié — rien à faire dessus). Restent 3 pages : `ventes/marges`,
     `ventes`, `achats`. Même principe que ci-dessus : sortir le `<canvas>`
     + la logique `new Chart(...)` dans un composant `"use client"` séparé,
     importé en `next/dynamic({ ssr: false })` depuis la page. Ces 3 pages
     sont plus grosses (1250 à 2700 lignes) — probablement une page par
     exécution pour rester dans le budget de lignes.
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

## Vagues 1 et 2 — 3 septembre 2026 (déployées)

### Vague 1 — sécurité
- [x] `src/middleware.ts` : toute route `/api/*` refuse (401) sans jeton Supabase valide.
  Liste blanche : `/api/version`, `/api/client-error`, `/api/cron/*`, `GET /api/pennylane/sync`,
  `GET /api/meteo?action=fetch` (gardes cron propres). Cache 60 s des jetons validés.
- [x] `src/lib/cronAuth.ts` : gardes cron **fermées par défaut** (`CRON_SECRET` obligatoire, sinon 503).
  `cronOrAdminUnauthorized` pour les tâches lançables à la main par un admin (factures-auto).
  Job pg_cron `popina-sync-horaire` envoie le secret. **À faire par Paul : créer `CRON_SECRET`
  dans Vercel (même valeur que `.env.local`) puis redéployer — sinon les crons restent en 503.**
- [x] `etabAccessDenied` / `roleDenied` (lib/getEtablissement.ts) sur Rentabilité, Marges, Stats,
  Pilotage annuel/objectifs, Tendances, Registre du personnel (admins ou managers de l'étab).
- [x] Identifiants de portail fournisseur : table `supplier_portal_credentials` (RLS sans policy =
  service role seulement) + `/api/fournisseurs/portal` (admins/managers). Colonnes `suppliers.portal_*`
  vidées et plus jamais sélectionnées côté client.
- [x] RLS activée sur `charges_mensuelles` ; routes `admin/sync-role`, `admin/setup-ventes`,
  `admin/clean-names`, `pennylane/diagnostic` supprimées.
- [x] 68 `fetch("/api…")` → `fetchApi` (jeton + établissement automatiques) ; PDF ouverts via
  `openApiFile` (lib/fetchApi.ts) au lieu de liens sans jeton. **Règle : tout nouvel appel API côté
  client passe par `fetchApi`/`openApiFile`, sinon 401.**

### Vague 2 — fiabilité et vitesse
- [x] `bello-mio` / `piccola-mia` : agrégats SQL (`ventes_ca_tickets`, `ventes_par_jour_categorie`,
  `ventes_par_produit`) — fin de la pagination navigateur qui saturait Safari.
- [x] Transactions : `facture_replace_lignes`, `devis_replace_lignes`, `inventaire_replace_movements`.
- [x] Erreurs d'écriture visibles : paramètres établissement (7), duplication de fiche, création de
  catégorie, lignes de facture/devis à la création, compteur combo-sync.
- [x] `src/lib/supabaseChunks.ts` (`inChunks`, paquets de 150 en parallèle) appliqué à epicerie,
  commandes (+ N+1 par alias supprimés), catalogue (lignes pizzas), stock/sync-ventes, cron/stock-sync,
  useIngredientsData. **Règle : jamais de `.in()` sur une liste non bornée sans `inChunks`.**
- [x] Catalogue : `ventes_articles_distincts` (RPC) au lieu de relire toutes les ventes.
- [x] Chart.js en import dynamique sur Ventes (256→186 Ko), Achats (251→181), Marges (245→176).
- [x] Push : clé VAPID invalide journalisée au lieu de lever une erreur serveur.
- [ ] Non fait, volontairement : filtrer `v_latest_offers` dans les 6 formulaires de recette — la vue
  ne fait que 1 249 lignes et les formulaires ont besoin des prix de tous les candidats à l'ajout ;
  à revoir seulement si la vue grossit (>5 000 lignes).

## Vague 4 — 3 septembre 2026 (alléger)
- [x] 31 pages orphelines supprimées (aucun lien entrant, vérifié une par une) : 13 `/invoices/<fournisseur>`
  (les routes API homonymes restent), 4 `/recettes/new/*`, `/ventes/{insights,live,performances,articles}`,
  `/rh/rapports`, `/admin/utilisateurs`, `/settings/pointeuse`, `/settings/employes/{acces,contrat,import,roles}`,
  `/bello-mio/planning`, `/piccola-mia/{planning,evenements}`. Messagerie / Finances / Stats achats supprimées
  la veille sur décision de Paul. HACCP laissé en l'état (décision produit en attente).
- [x] Base : 2 index en double supprimés, index créés sur toutes les clés étrangères qui n'en avaient pas,
  `search_path` figé sur 20 fonctions, fonctions SECURITY DEFINER retirées au rôle `anon` (13) et outils
  d'administration (schéma, recalcul des coûts, purge) réservés au service role.
- [x] `scripts/verify-parsers.ts` : re-parse toutes les factures en base (raw_text) et signale tout écart
  lignes ↔ total HT > 1 € — à lancer après toute modification d'un parser (`npx tsx scripts/verify-parsers.ts [fournisseur]`).
  Les PDF ne sont jamais commités (dépôt public).
- [x] Clés VAPID régénérées (sans « = ») — **à coller dans Vercel** : `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  puis redéployer et ré-autoriser les notifications sur chaque téléphone (l'ancien abonnement est invalidé).
- [ ] Reste (au fil de l'eau) : découpage de commandes/page.tsx, ventes/page.tsx, CatalogueTab.tsx ; Next 16 ;
  33 tables avec policies RLS redondantes (à consolider table par table, pas en bloc) ; 22 vues SECURITY DEFINER
  (à passer en invoker une par une en vérifiant les droits) ; protection « mots de passe compromis » à activer
  dans le tableau de bord Supabase (Auth → Settings).
