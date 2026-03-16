# Brief Module RH — BelloMio (iFratelli Group)

> **Date** : 16 mars 2026
> **Branche** : `claude/hr-module-planning-JWYSf`
> **Stack** : Next.js 16, React 19, TypeScript, Supabase, Tailwind CSS v4

---

## Vue d'ensemble

Module complet de gestion RH et planning pour deux établissements :

| Établissement | Convention | IDCC |
|---------------|-----------|------|
| **Bello Mio** | Hôtels, Cafés, Restaurants | 1979 |
| **Piccola Mia** | Restauration Rapide | 1501 |

**34 fichiers** · **~6 500 lignes** · **46 tests (tous verts)**

---

## Étape 1 — Schéma de données

**9 migrations SQL** (`supabase/migrations/`)

| Table | Description |
|-------|-------------|
| `profiles` | Profils utilisateur, rôles (admin/direction/cuisine), accès multi-établissements |
| `etablissements` | Convention, SIRET, APE, médecin du travail, paramètres CP, objectifs |
| `employes` | Identité complète, civilité, numéro sécu, nationalité, coordonnées |
| `contrats` | CDI, CDD, extra, TNS, intérim, apprenti, stagiaire — heures, rémunération |
| `shifts` | Planning : date, horaires, poste, pause, statut (brouillon/publié), note |
| `postes` | Rôles restaurant : nom, couleur, emoji, ordre |
| `absences` | Maladie, CP, sans solde — avec code SILAE, dates, nb jours |
| `notifications` | In-app : type, titre, corps, lien deep-link, lu/non-lu |
| `conversations` / `messages` | Messagerie interne : canaux groupe/DM, membres, temps réel |

Toutes les tables sont protégées par **RLS** via `user_has_etablissement_access()`.

---

## Étape 2 — Hooks métier

| Hook | Rôle |
|------|------|
| `useEmployes` | Liste employés actifs + contrats, subscription temps réel |
| `useContrats` | CRUD contrats par employé |
| `useShifts` | CRUD shifts, publication, duplication semaine, temps réel |
| `useConventionLegale` | **Moteur légal** : calcul heures normales/sup HCR & RAPIDE, alertes |
| `usePlanningLegal` | Bilans hebdo par employé (alertes, coûts, totaux) |
| `useSettings` | Paramètres établissement (convention, SIRET, charges, CP) |
| `usePopina` | Intégration POS : CA, couverts, ratios productivité |
| `useNotifications` | Notifications temps réel, marquer lu, supprimer |
| `useMessagerie` | Conversations + messages temps réel |

---

## Étape 3 — Page Équipe (`/rh/equipe`)

- Liste employés avec **filtres** : équipe (Cuisine/Salle/Shop) + type contrat
- Carte par employé : nom, poste, contrat, heures
- Bouton **"+ Nouveau collaborateur"** → modal onboarding
- Accès rapide fiche employé

---

## Étape 4 — Fiche employé (`/rh/employe/[id]`)

**6 onglets :**

| Onglet | Contenu |
|--------|---------|
| Infos | Identité, coordonnées, numéro sécu, nationalité |
| Contrats | Liste contrats, ajout, type/heures/rémunération |
| Temps | Bilan mensuel heures, heures sup, alertes légales |
| Congés | Solde CP, historique absences |
| Documents | (placeholder pour GED future) |
| Permissions | Rôle, accès établissements |

---

## Étape 5 — Modal onboarding (`AddCollaborateurModal`)

**Formulaire en 4 étapes :**

1. **Identité** : civilité, prénom, nom, nom d'usage, nationalité, date/lieu/dept naissance, numéro sécu
2. **Coordonnées** : email, téléphone, adresse complète
3. **Contrat** : type, équipe, emploi, qualification, heures/semaine, rémunération
4. **DPAE** : checklist conformité (SIRET `91321738600014`, APE `5610A`, médecin `MT090`)

---

## Étape 6 — Planning (`/plannings`)

- **Grille hebdomadaire** : colonnes = jours, lignes = employés
- **Shifts visuels** : couleur poste, horaires, durée, badge brouillon
- **Actions** : ajouter/modifier shift, publier semaine, dupliquer semaine
- **Alertes légales** en temps réel (amplitude, repos, durée max)
- **Intégration Popina** : CA, couverts, ratio productivité

---

## Étape 7 — Moteur légal (`useConventionLegale`)

**755 lignes** — cœur du module.

### HCR IDCC 1979
| Tranche | Taux |
|---------|------|
| 0 → 35h | Normal |
| 35 → 43h | +25% |
| > 43h | +50% |

### RAPIDE IDCC 1501
| Tranche | Taux |
|---------|------|
| 0 → 35h | Normal |
| 35 → 39h | +10% |
| 39 → 43h | +20% |
| > 43h | +50% |

### Alertes générées
- Amplitude journalière > 13h
- Durée nette jour > 10h
- Repos entre 2 jours < 11h
- Semaine > 48h
- 6 jours consécutifs travaillés

---

## Étape 8 — Rapports légaux (`/rh/rapports`)

- **Bilan mensuel** par employé : heures travaillées, normales, sup par tranche
- **Export SILAE** : fichier CSV (`;` séparateur) avec codes EV-A01, HS-HS25, HS-HS50, AB-xxx
- Format matricule : zéro-paddé sur 5 chiffres
- Gestion absences avec codes SILAE + dates spécifiques
- Solde RC (repos compensateur)

---

## Étape 9 — Masse salariale (`/rh/masse-salariale`)

- **Coût mensuel par employé** : brut + charges patronales + avantage repas
- **Ratios productivité** : coût/couvert, CA/heure travaillée
- **Intégration Popina** : données de vente pour analyse croisée
- **Vue consolidée** : total masse salariale vs objectifs

---

## Étape 10 — Notifications

- **Table `notifications`** : type (info/planning/rh/alerte/message), deep-link
- **`NotificationBell`** dans NavBar : badge compteur, dropdown 8 dernières
- **Page `/notifications`** : liste complète, badges couleur par type, supprimer
- **Temps réel** via Supabase channels

---

## Étape 11 — Mes Shifts (`/mes-shifts`)

- **Vue employé** (lecture seule) de son planning personnel
- Carte par jour : shift avec poste/couleur/durée, ou REPOS si vide
- **Summary cards** : heures totales, nombre de shifts, repas
- Navigation semaine (précédent/suivant/aujourd'hui)
- Notes de shift affichées

---

## Étape 12 — Messagerie (`/messagerie`)

- **Tables** : `conversations`, `conversation_members`, `messages`
- **Sidebar** : liste conversations, indicateurs non-lu, dernier message
- **Chat panel** : bulles envoi/réception, horodatage, scroll auto
- **Création** de canaux (direction/admin uniquement)
- **Temps réel** : messages en direct via Supabase channels

---

## Étape 13 — PWA

| Élément | Détail |
|---------|--------|
| `manifest.json` | Nom "BelloMio", shortcuts (Planning, Équipe, Mes Shifts), theme `#D4775A` |
| `sw.js` | Cache shell, network-first API, cache-first assets statiques |
| `ServiceWorkerRegistrar` | Enregistrement auto dans Providers |
| Metadata | Branding BelloMio dans layout, apple-web-app capable |

---

## Étape 14 — Tests SILAE

**46 tests au total (tous verts)**

| Fichier | Tests | Couverture |
|---------|-------|-----------|
| `useConventionLegale.test.ts` | 29 | Utilitaires, HCR 1979 sup, RAPIDE 1501 sup, export CSV |
| `silae-nonregression.test.ts` | 17 | HCR alertes (5 cas), RAPIDE sup, export CDI/extra/absences/RC/CSV |

### Scénarios couverts
- Semaine standard 39h (pas de sup HCR = 4h @25%)
- Semaine 45h (8h @25% + 2h @50%)
- Alertes : amplitude >13h, durée >10h, repos <11h, semaine >48h
- RAPIDE 1501 : sup 10% et 20%
- Export : matricule paddé, codes SILAE, format CSV `;`, absences multi-types
- Non-régression : formatValeur, formatDateFR, CSV parseable

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Dashboard (cartes RH + Planning)
│   ├── rh/
│   │   ├── equipe/page.tsx         # Liste employés
│   │   ├── employe/[id]/page.tsx   # Fiche détaillée (6 onglets)
│   │   ├── rapports/page.tsx       # Export SILAE mensuel
│   │   └── masse-salariale/page.tsx # Analyse coûts
│   ├── plannings/page.tsx          # Grille planning hebdo
│   ├── mes-shifts/page.tsx         # Vue employé
│   ├── notifications/page.tsx      # Centre notifications
│   └── messagerie/page.tsx         # Chat interne
├── hooks/
│   ├── useEmployes.ts              # CRUD employés/contrats
│   ├── useShifts.ts                # CRUD shifts + publication
│   ├── useConventionLegale.ts      # Moteur légal (755 lignes)
│   ├── usePlanningLegal.ts         # Bilans planning
│   ├── useSettings.ts              # Paramètres établissement
│   ├── usePopina.ts                # Intégration POS
│   ├── useNotifications.ts         # Notifications temps réel
│   ├── useMessagerie.ts            # Conversations + messages
│   └── __tests__/
│       ├── useConventionLegale.test.ts
│       └── silae-nonregression.test.ts
├── components/
│   ├── rh/AddCollaborateurModal.tsx # Onboarding 4 étapes
│   ├── NotificationBell.tsx         # Cloche NavBar
│   └── ServiceWorkerRegistrar.tsx   # PWA registration
└── public/
    ├── manifest.json                # PWA manifest
    └── sw.js                        # Service worker
```

---

## Sécurité

- **RLS** sur toutes les tables HR via `user_has_etablissement_access()`
- **Rôles** : `admin` (tout), `direction` (écriture), `cuisine` (lecture seule)
- Pas d'injection SQL (requêtes Supabase paramétrées)
- Pas de données sensibles côté client (numéro sécu chiffré côté DB)

---

## Pistes d'évolution

- [ ] Formulaire DPAE complet avec envoi URSSAF
- [ ] Workflow demandes d'absence (employé → validation direction)
- [ ] Compteurs CP/RTT automatiques
- [ ] Dashboard RH synthétique (effectif, alertes, KPIs)
- [ ] Push notifications (Web Push API via service worker)
- [ ] Export planning CSV pour import SILAE
- [ ] Gestion documentaire (contrats PDF, bulletins)
