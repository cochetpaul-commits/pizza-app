# BelloMio — iFratelli Group

## Projet

- **App** : Gestion restaurant (recettes, ingredients, factures, planning, RH)
- **Stack** : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend** : Supabase (PostgreSQL + Auth + RLS)
- **Hébergement** : Vercel
- **Branche de déploiement** : `main`

## URLs

- **Supabase projet** : `https://qdraedqtdlcjqlbxksqt.supabase.co`
- **Supabase dashboard** : `https://supabase.com/dashboard/project/qdraedqtdlcjqlbxksqt`
- **Vercel** : `https://vercel.com/cochetpaul-commits-projects/pizza-app`
- **GitHub** : `https://github.com/cochetpaul-commits/pizza-app`

## Établissements

| Slug | Nom | Convention |
|------|-----|------------|
| `bellomio` | Bello Mio | HCR IDCC 1979 |
| `piccola` | Piccola Mia | RAPIDE IDCC 1501 |

## DPAE — Infos employeur

- SIRET : `91321738600014`
- APE : `5610A`
- Médecin du travail : `MT090`

## Conventions

- **Langue** : français dans l'UI, anglais dans le code
- **Design system** : Oswald (titres), DM Sans (corps), Cormorant Garamond (chiffres)
- **Couleur primaire** : `#D4775A` (terre)
- **Pas de shadcn/ui** — composants custom avec classes `.input`, `.btn`, `.btnPrimary`
- **Pas de modals réutilisables** — inline overlays au cas par cas
- **RLS** : toutes les tables avec `user_has_etablissement_access()` ou `user_role()`
- **Rôles** : `admin`, `direction` (écriture), `cuisine` (lecture seule)
- **Migrations** : `supabase/migrations/YYYYMMDDHHMMSS_nom.sql`

## Commandes

```bash
npm run dev          # Dev server
npx tsc --noEmit     # Type check
npx vitest run       # Tests unitaires
```
