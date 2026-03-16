# BRIEF TECHNIQUE — Module RH BelloMio

> **Ce fichier est un brief technique complet à fournir en contexte à Claude Code.**
> **Date** : 16 mars 2026 · **Branche** : `claude/hr-module-planning-JWYSf`

---

## PROJET

- **App** : BelloMio — Gestion restaurant (iFratelli Group)
- **Stack** : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend** : Supabase (PostgreSQL + Auth + RLS)
- **Hébergement** : Vercel · **Repo** : `cochetpaul-commits/pizza-app`
- **Design** : Oswald (titres), DM Sans (corps), Cormorant Garamond (chiffres), primaire `#D4775A`
- **Pas de** : shadcn/ui, modals réutilisables — composants custom `.input`, `.btn`, `.btnPrimary`

## ÉTABLISSEMENTS

| Slug | Nom | Convention | IDCC |
|------|-----|-----------|------|
| `bello_mio` | Bello Mio | HCR | 1979 |
| `piccola` | Piccola Mia | Restauration Rapide | 1501 |

**DPAE** : SIRET `91321738600014` · APE `5610A` · Médecin `MT090`

---

## SCHÉMA BASE DE DONNÉES (13 tables RH)

### profiles
```
id UUID PK → auth.users(id), role TEXT ('admin'|'direction'|'cuisine'),
display_name TEXT, is_group_admin BOOLEAN, etablissements_access UUID[],
created_at, updated_at
```
- Trigger `on_auth_user_created` → auto-crée profil
- RLS : lecture propre profil + admin full access

### etablissements
```
id UUID PK, slug TEXT UNIQUE, nom TEXT, adresse TEXT, telephone TEXT, email TEXT,
popina_location_id TEXT, couleur TEXT, logo_url TEXT, actif BOOLEAN,
convention TEXT ('HCR_1979'|'RAPIDE_1501'), code_ape TEXT, siret TEXT,
medecin_travail TEXT, pause_defaut_minutes INT(30),
objectif_cout_ventes NUMERIC(37), objectif_productivite NUMERIC(50),
cotisations_patronales NUMERIC(35), ajouter_cp_taux_horaire BOOLEAN,
base_calcul_cp NUMERIC(6), acquisition_mensuelle_cp NUMERIC(2.5),
type_indemnisation_repas TEXT('AN'), valeur_avantage_nature NUMERIC(3.57),
created_at
```

### employes
```
id UUID PK, etablissement_id UUID FK→etablissements, prenom TEXT, nom TEXT,
initiales TEXT (auto-trigger), email TEXT, tel_mobile TEXT, tel_fixe TEXT,
adresse TEXT, code_postal TEXT, ville TEXT,
civilite TEXT('M'|'Mme'), nom_usage TEXT, genre TEXT,
date_naissance DATE, lieu_naissance TEXT, departement_naissance TEXT,
nationalite TEXT('France'), situation_familiale TEXT, nb_personnes_charge INT,
contact_urgence_prenom/nom/lien/tel TEXT,
numero_secu TEXT, handicap BOOLEAN, type_handicap TEXT,
date_visite_medicale DATE, visite_renforcee BOOLEAN, prochaine_visite_medicale DATE,
iban TEXT, bic TEXT, titulaire_compte TEXT,
matricule TEXT, date_anciennete DATE, travailleur_etranger BOOLEAN,
avatar_url TEXT, actif BOOLEAN,
equipe_access TEXT[], role TEXT('employe'|'manager'|'proprietaire'),
poste_rh TEXT, contrat_type TEXT('CDI'|'CDD'|'extra'|'interim'|'apprenti'|'stagiaire'|'TNS'),
heures_semaine NUMERIC, created_at
```

### contrats
```
id UUID PK, employe_id UUID FK→employes,
type TEXT('CDI'|'CDD'|'extra'|'interim'|'apprenti'|'stagiaire'),
date_debut DATE, date_fin DATE, remuneration NUMERIC,
emploi TEXT, qualification TEXT, heures_semaine NUMERIC, jours_semaine INT(5),
actif BOOLEAN, created_at
```

### contrat_elements
```
id UUID PK, contrat_id UUID FK→contrats,
type TEXT('prime'|'transport'|'acompte'|'mutuelle_dispense'),
libelle TEXT, montant NUMERIC, code_silae TEXT,
date_debut DATE, date_fin DATE, created_at
```

### postes
```
id UUID PK, etablissement_id UUID FK→etablissements,
equipe TEXT('Cuisine'|'Salle'|'Shop'),
nom TEXT, couleur TEXT, emoji TEXT, actif BOOLEAN, created_at
```

### shifts
```
id UUID PK, employe_id UUID FK→employes, etablissement_id UUID FK→etablissements,
poste_id UUID FK→postes, date DATE, heure_debut TIME, heure_fin TIME,
pause_minutes INT(30), note TEXT,
statut TEXT('brouillon'|'publié'|'validé'),
heures_reelles_debut TIME, heures_reelles_fin TIME, pause_reelle_minutes INT,
created_at
```
Index : `(date)`, `(employe_id, date)`, `(etablissement_id, date)`

### absences
```
id UUID PK, employe_id UUID FK, etablissement_id UUID FK,
date_debut DATE, date_fin DATE,
type TEXT('CP'|'maladie'|'RTT'|'absence_injustifiee'|'ferie'|'repos_compensateur'|'formation'|'evenement_familial'),
nb_jours NUMERIC, statut TEXT('demande'|'approuvé'|'refusé'),
code_silae TEXT, note TEXT, created_at
```

### compteurs_employe
```
id UUID PK, employe_id UUID FK, periode TEXT,
heures_contractuelles/travaillees/normales NUMERIC,
heures_comp_10/comp_25/supp_10/supp_20/supp_25/supp_50 NUMERIC,
jours_feries_travailles NUMERIC, jours_travailles INT,
solde_rc NUMERIC, nb_repas INT, created_at
UNIQUE(employe_id, periode)
```

### notifications
```
id UUID PK, user_id UUID FK→auth.users,
type TEXT('info'|'planning'|'rh'|'alerte'|'message'),
titre TEXT, corps TEXT, lien TEXT, lu BOOLEAN(false), created_at
```
Index : `(user_id, lu, created_at DESC)` · RLS : propre user_id uniquement

### conversations
```
id UUID PK, etablissement_id UUID FK→etablissements,
titre TEXT, type TEXT('group'|'direct'),
created_by UUID FK→auth.users, created_at
```

### conversation_members
```
id UUID PK, conversation_id UUID FK, user_id UUID FK→auth.users,
last_read_at TIMESTAMPTZ, UNIQUE(conversation_id, user_id)
```

### messages
```
id UUID PK, conversation_id UUID FK, user_id UUID FK→auth.users,
contenu TEXT, created_at
```
Index : `(conversation_id, created_at DESC)`

### Fonctions RLS

```sql
user_role() → TEXT                          -- retourne le rôle du profil courant
user_has_etablissement_access(UUID) → BOOL  -- vérifie accès via is_group_admin OU etablissements_access
generate_initiales() → TRIGGER              -- auto-génère initiales employé
handle_new_user() → TRIGGER                 -- auto-crée profil à l'inscription
```

---

## HOOKS — SIGNATURES EXACTES

### useEmployes.ts
```ts
type EmployeAvecContrat = Employe & { contrat_actif: Contrat | null }

useEmployes(etablissementId: string | null): {
  employes: EmployeAvecContrat[], loading, error,
  refetch, create(data) → Employe | null, update(id, data) → boolean, archive(id) → boolean
}

useContrats(employeId: string | null): {
  contrats: Contrat[], loading, error,
  create(data) → boolean, update(id, data) → boolean, clore(id, dateFin) → boolean
}
```

### useShifts.ts
```ts
useShifts(etablissementId: string | null, dateDebut: string, dateFin: string): {
  shifts: Shift[], byEmployeDay: Record<string, Record<string, Shift[]>>,
  loading, error, refetch,
  createShift(data) → Shift | null, updateShift(id, data) → boolean, deleteShift(id) → boolean,
  publishWeek(dateDebut, dateFin) → number, dupliquerSemaine(opts) → number
}
```

### useConventionLegale.ts (755 lignes — CŒUR MÉTIER)
```ts
type ShiftInput = { date, heure_debut, heure_fin, pause_minutes, heures_reelles_debut?, heures_reelles_fin?, pause_reelle_minutes? }
type ContratInput = { type, heures_semaine, convention: 'HCR_1979' | 'RAPIDE_1501' }
type Convention = 'HCR_1979' | 'RAPIDE_1501'
type Alerte = { type: 'amplitude_max'|'repos_insuffisant'|'duree_max_jour'|'duree_max_semaine', employe_id, date, message, valeur_constatee, valeur_max }
type BilanSemaine = { heures_travaillees, heures_normales, heures_supp_25, heures_supp_50, heures_supp_10, heures_supp_20, heures_comp_10, heures_comp_25, delta_contrat, rc_acquis, nb_repas, alertes: Alerte[] }
type BilanMensuel = BilanSemaine & { jours_travailles, bilans_semaines: BilanSemaine[] }
type ExportSilaeRow = { matricule, code, valeur, date_debut, date_fin }

// Fonctions pures (export)
calculerBilanSemaine(shifts, contrat, employeId) → BilanSemaine
calculerBilanMensuel(shifts, contrat, employeId) → BilanMensuel
genererExportSilae(bilan, matricule, contratType, dateDebut, dateFin, absences?, soldeRC?) → ExportSilaeRow[]
exportSilaeToCSV(rows) → string
timeToMinutes(time) → number
shiftDureeNette(shift) → number
shiftDureeBrute(shift) → number
formatHeures(h) → string
formatDateFR(dateISO) → string  // YYYY-MM-DD → DD/MM/YYYY
formatValeur(v) → string
getISOWeekKey(dateStr) → string

// Hook React
useConventionLegale(): { calculerBilanSemaine, calculerBilanMois, hasAlerteJour, dureeShift, isJourFerie, genererExportSilae, exportSilaeToCSV, VALEUR_REPAS_AN }

// Constantes
JOURS_FERIES_2026: Set<string>
VALEUR_REPAS_AN: number
CONSTANTS: { HCR_SEUIL_LEGAL:35, HCR_SEUIL_SUP_25:43, HCR_AMPLITUDE_MAX:13, HCR_REPOS_MIN:11, HCR_DUREE_MAX_JOUR:10, HCR_DUREE_MAX_SEMAINE:48, RAPIDE_SEUIL_LEGAL:35, RAPIDE_SEUIL_SUP_10:39, RAPIDE_SEUIL_SUP_20:43 }
```

**Règles heures sup :**

| Convention | Tranche | Taux |
|-----------|---------|------|
| HCR 1979 | 0→35h normal | 35→43h +25% | >43h +50% |
| RAPIDE 1501 | 0→35h normal | 35→39h +10% | 39→43h +20% | >43h +50% |

**Alertes :** amplitude >13h, durée nette >10h, repos <11h, semaine >48h

### usePlanningLegal.ts
```ts
type BilanEmployeSemaine = { employe_id, nom, bilan: BilanSemaine, heures_travaillees, delta_contrat, nb_repas, has_alerte, nb_alertes }
type BilanSemainePlanning = { bilans: BilanEmployeSemaine[], total_heures, total_repas, total_heures_supp, cout_estime, alertes_par_jour, employes_en_alerte }

usePlanningLegal({ employes, shifts, lundiISO, convention, tauxHoraire, tauxCharges }) → BilanSemainePlanning
useBilanEmploye(bilans, employeId) → BilanEmployeSemaine | undefined
```

### useSettings.ts
```ts
type Settings = { id, etablissement_id, convention, code_ape, siret, medecin_travail, adresse, pause_defaut_minutes, objectif_ratio_ms, objectif_productivite, cp_base('ouvrables'|'ouvres'), cp_acquisition_mensuelle, cp_periode_debut, cp_periode_fin, repas_type('AN'|'IR'|'TR'|'PP'), repas_valeur_an, charges_patronales, taux_accident_travail, taux_horaire_moyen, cp_dans_taux, popina_location_id, ... }

useSettings(etablissementId) → { settings, draft, loading, saving, error, isDirty, values, update(patch), save(), reset() }
useConvention(etablissementId) → 'HCR_1979' | 'RAPIDE_1501'
useObjectifs(etablissementId) → { ratio_ms, productivite, charges, taux_at, taux_horaire, cp_dans_taux, repas_an, taux_cout }
useParamsCP(etablissementId) → { base, mensuel, annuel, periode_debut, periode_fin }
```

### usePopina.ts
```ts
type PopinaDataRange = { locationId, date_debut, date_fin, total_ca_ht, total_ca_ttc, total_couverts, ticket_moyen, par_jour[] }
type RatiosSemaine = { ca_ht, ca_ttc, nb_couverts, ticket_moyen, heures_travaillees, cout_shifts_brut, cout_shifts_charges, nb_repas, cout_repas_an, productivite, ratio_masse_salariale, heures_supp, alerte_productivite, alerte_masse_salariale }

usePopina({ locationId, dateDebut, dateFin, enabled? }) → { data, loading, error, refetch, isConfigured }
useRatiosSemaine({ popinaData, heures_travaillees, nb_repas, heures_supp, objectifs }) → RatiosSemaine
```

### useNotifications.ts
```ts
type Notification = { id, user_id, type: 'info'|'planning'|'rh'|'alerte'|'message', titre, corps?, lien?, lu, created_at }

useNotifications() → { notifications, unreadCount, loading, error, markAsRead(id), markAllAsRead(), remove(id), refetch() }
```
Realtime via Supabase channel `notifications:{userId}`

### useMessagerie.ts
```ts
type Conversation = { id, etablissement_id, titre?, type: 'group'|'direct', created_by?, created_at }
type Message = { id, conversation_id, user_id, contenu, created_at }
type ConversationWithLastMessage = Conversation & { last_message?, last_message_at?, unread }

useConversations() → { conversations, loading, error, create(etabId, titre, memberIds) → string|null, refetch() }
useMessages(conversationId) → { messages, loading, error, send(contenu) → boolean, refetch() }
```
Realtime via Supabase channel `messages:{conversationId}`

### useAuth.tsx
```ts
type Role = 'admin' | 'direction' | 'cuisine'
type Profile = { id, role, display_name?, is_group_admin, etablissements_access, created_at, updated_at }

useAuth() → { session, user, profile, loading, error, signInWithEmail(email, pwd), signOut(), refreshProfile() }
useHasAccess(etablissementId) → boolean
useIsGroupAdmin() → boolean
```

### Contextes
```ts
useProfile() → { role, displayName, loading, isAdmin, isDirection, isGroupAdmin, canWrite }
useEtablissement() → { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin, loading }
```

---

## PAGES

### `/` — Dashboard
Imports : `useProfile`, `useEtablissement`, Popina API
Cartes KPI : recettes, ingrédients, fournisseurs, RH, planning, finances. CA du jour (auto-refresh 5 min). Role-gated (cuisine voit moins).

### `/rh/equipe` — Liste employés
Imports : `useEmployes`, `useProfile`, `useEtablissement`, `AddCollaborateurModal`
Filtres équipe (Cuisine/Salle/Shop) + type contrat. Recherche nom/email. KPI cards (total, par équipe). Click → fiche employé.

### `/rh/employe/[id]` — Fiche employé (6 onglets)
Imports : `useContrats`, `useProfile`, Supabase direct
Onglets : Infos (identité/coordonnées/santé/banque), Contrats (CRUD), Temps (bilan mensuel), Congés (historique), Documents (placeholder), Permissions (rôle/accès). Mode édition toggle. Archive avec confirmation.

### `/rh/rapports` — Export SILAE mensuel
Imports : `useEmployes`, `useShifts`, `useSettings`, `useConventionLegale`
Bilan mensuel par employé (heures, sup, repas, alertes). Navigation mois. Export CSV SILAE (`;` séparateur, codes EV-A01/HS-HS25/HS-HS50/AB-xxx). Filtre TNS exclus, matricule requis.

### `/rh/masse-salariale` — Analyse coûts
Imports : `useEmployes`, `useShifts`, `useSettings`, `usePopina`, `useConventionLegale`
Coût par employé (brut + charges + repas). Ratios : coût/couvert, CA/heure. Intégration Popina. Simulateur paramétrable (taux horaire, charges, repas).

### `/plannings` — Planning hebdomadaire
Imports : `useProfile`, `useEtablissement`, `useShifts`, `useEmployes`, `usePlanningLegal`, `usePopina`, `useSettings`
Grille 7 jours × N employés. Shifts couleur poste. KPIs (heures, coût, ratio MS, productivité, alertes). Actions : CRUD shift, publier semaine, dupliquer. Filtre équipe.

### `/mes-shifts` — Vue employé (lecture seule)
Imports : `useAuth`, `useEtablissement`, `useShifts`, Supabase direct (postes, employes match)
Mon planning semaine. Summary cards (heures, shifts, repas). Jour par jour avec REPOS si vide. Navigation semaine.

### `/notifications` — Centre notifications
Imports : `useNotifications`, `useRouter`
Liste toutes notifs. Badge type couleur. Marquer lu, supprimer. Deep-link click. "Tout marquer lu".

### `/messagerie` — Chat interne
Imports : `useAuth`, `useProfile`, `useEtablissement`, `useConversations`, `useMessages`
2 panneaux : sidebar (conversations, unread, dernier msg) + chat (bulles, horodatage, scroll auto). Création canaux (direction/admin). Send Enter ou bouton. Realtime.

---

## COMPOSANTS

### `AddCollaborateurModal` (642 lignes)
4 étapes : Identité → Coordonnées → Contrat → DPAE checklist. Crée employé + contrat + met à jour `contrat_type`/`heures_semaine` dénormalisés.

### `NotificationBell` (193 lignes)
Dans NavBar. Cloche SVG + badge compteur. Dropdown 8 dernières notifs. Type icons/couleurs. Click → markAsRead + navigation lien. "Tout marquer lu". Click outside → ferme.

### `ServiceWorkerRegistrar` (15 lignes)
Enregistre `/sw.js` au mount. Dans Providers.

---

## PWA

- **manifest.json** : nom "BelloMio", shortcuts (Planning, Équipe, Mes Shifts), theme `#D4775A`
- **sw.js** : cache shell (`/`, `/plannings`, `/rh/equipe`, `/mes-shifts`, `/notifications`), network-first API, cache-first assets, skip Supabase
- **Layout** : `themeColor: #D4775A`, `apple-web-app: capable`

---

## TESTS — 46 total (tous verts)

### useConventionLegale.test.ts (29 tests)
- `timeToMinutes` : 09:00→540, 23:30→1410, 00:00→0
- `shiftDureeNette` : standard, nuit (cross-midnight), 0 pause
- `formatHeures` : entier, décimal, 0
- `formatDateFR` : ISO→FR, fin de mois
- `getISOWeekKey` : lundi, dimanche, 1er janvier
- HCR 1979 : 35h(0 sup), 39h(4h@25%), 44h(8h@25%+1h@50%)
- RAPIDE 1501 : 35h(0 sup), 40h(4h@10%+1h@20%), 44h(4h@10%+4h@20%+1h@50%)
- Export SILAE : employé standard, extras, absences, pas de 0
- CSV format : header + rows, `;` separator

### silae-nonregression.test.ts (17 tests)
- HCR 1979 : 39h standard(4h@25%), 45h(8h@25%+2h@50%), alertes amplitude/durée/repos/semaine
- RAPIDE 1501 : 40h(4h@10%+1h@20%)
- Export complet : CDI avec sup, extra code spécifique, 0 sup → pas de HS, absence maladie AB-300, multi-absences, RC=0 exclus
- Helpers : formatValeur (entiers/décimales), formatDateFR, CSV parseable/stable

---

## ARBORESCENCE

```
src/
├── app/
│   ├── page.tsx                         # Dashboard
│   ├── rh/
│   │   ├── layout.tsx                   # Wrapper
│   │   ├── equipe/page.tsx              # Liste employés (356L)
│   │   ├── employe/[id]/page.tsx        # Fiche détaillée (908L)
│   │   ├── rapports/page.tsx            # Export SILAE (506L)
│   │   └── masse-salariale/page.tsx     # Analyse coûts (568L)
│   ├── plannings/page.tsx               # Grille planning (659L)
│   ├── mes-shifts/page.tsx              # Vue employé (279L)
│   ├── notifications/page.tsx           # Centre notifs (163L)
│   └── messagerie/page.tsx              # Chat interne (282L)
├── hooks/
│   ├── useAuth.tsx                      # Auth + profil (~100L)
│   ├── useEmployes.ts                   # CRUD employés/contrats (112L)
│   ├── useShifts.ts                     # CRUD shifts (142L)
│   ├── useConventionLegale.ts           # Moteur légal (755L)
│   ├── usePlanningLegal.ts              # Bilans planning (155L)
│   ├── useSettings.ts                   # Paramètres étab (260L)
│   ├── usePopina.ts                     # Intégration POS (~200L)
│   ├── useNotifications.ts              # Notifications RT (81L)
│   ├── useMessagerie.ts                 # Conversations+messages (189L)
│   └── __tests__/
│       ├── useConventionLegale.test.ts  # 29 tests (460L)
│       └── silae-nonregression.test.ts  # 17 tests (312L)
├── components/
│   ├── NavBar.tsx                       # + NotificationBell intégrée
│   ├── TopNav.tsx                       # Header pages
│   ├── Providers.tsx                    # Auth>Guard>Profile>Etab>SW
│   ├── rh/AddCollaborateurModal.tsx     # Onboarding 4 étapes (642L)
│   ├── NotificationBell.tsx             # Cloche NavBar (193L)
│   └── ServiceWorkerRegistrar.tsx       # PWA registration (15L)
├── lib/
│   ├── supabase.ts                      # Client + types (Employe, Contrat, Shift, Poste)
│   ├── ProfileContext.tsx               # role, canWrite, isAdmin, isDirection
│   └── EtablissementContext.tsx         # current étab, setCurrent, isGroupView
├── public/
│   ├── manifest.json                    # PWA manifest + shortcuts
│   └── sw.js                            # Service worker cache
└── supabase/migrations/
    ├── 20260310000000_create_profiles.sql
    ├── 20260310100000_fix_profiles_rls.sql
    ├── 20260312000000_hr_module_tables.sql     # employes, contrats, shifts, postes, absences, compteurs
    ├── 20260312200000_etablissements.sql       # enrichissement convention/settings
    ├── 20260312220000_ensure_admin_group_access.sql
    ├── 20260314000000_multi_etab_scission.sql  # etablissement_id partout
    ├── 20260314000000_hr_seed_employes.sql     # données démo
    ├── 20260316000000_notifications.sql
    └── 20260316100000_messagerie.sql
```

---

## SÉCURITÉ

- **RLS** sur toutes les tables via `user_has_etablissement_access(etab_id)` (SECURITY DEFINER)
- **Rôles profils** : `admin` (tout), `direction` (écriture RH), `cuisine` (lecture seule)
- **Rôles employés** : `employe`, `manager`, `proprietaire` (TNS)
- **Group admin** : `is_group_admin=true` → accès tous établissements + suppression
- Pas d'injection (requêtes Supabase paramétrées), pas de données sensibles côté client

---

## COMMANDES

```bash
npm run dev          # Dev server
npx tsc --noEmit     # Type check (0 erreurs)
npx vitest run       # 46 tests (tous verts)
```

---

## PISTES D'ÉVOLUTION

- [ ] DPAE complet (formulaire + envoi URSSAF)
- [ ] Workflow demandes d'absence (employé → validation direction)
- [ ] Compteurs CP/RTT automatiques avec décompte
- [ ] Dashboard RH synthétique (effectif, alertes, KPIs globaux)
- [ ] Push notifications (Web Push API via SW existant)
- [ ] Export planning CSV pour import SILAE direct
- [ ] Gestion documentaire (contrats PDF, bulletins de paie)
- [ ] Pointeuse temps réel (heures_reelles_debut/fin déjà en DB)
