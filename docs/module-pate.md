# Module pâte · Bello Mio

Décisions et règles du module pâte (brief v2 du 01/11/2026, réponses de Paul du 02/11/2026). Le code fait foi ; ce fichier dit pourquoi.

## Phase 1 · calculateur (en ligne)

- Moteur : `src/lib/pateEngine.ts`. Pâte visée = pâtons × poids calculé ; poids calculé = poids détaillé × (1 + marge de perte), 260 g → 264 g à 1,5 %. Farine totale = pâte visée ÷ (1 + eau + sel + miel + huile + levure) : la levure est dans le facteur pour que la pâte pesée tombe juste (168 × 264 = 44 352 g).
- Biga : part de la farine totale (50 %), eau sur la farine de biga (45 %), levure sur la farine de biga (0,5 %). Toute la levure est dans la biga. La biga se remplit en priorité avec la farine désignée (tipo 0), le reste part au pétrissage ; complément au prorata avec avertissement si elle ne suffit pas.
- Eau du pétrissage : eau de départ (80 %, miel dissous dedans) et eau de bassinage (20 %).
- Capacité du pétrin Gammino : 215 pâtons ; au delà, découpe en pétrissages (`decouperLots`).
- Coût de recette : enregistré seulement s'il est complet (tous les ingrédients liés à un article qui a un prix) ; sinon badge « non lié » ou « sans prix » et avertissement.
- Étiquettes de la veille : `/api/empatements/etiquettes` (PDF, une étiquette par contenant).
- Tests : `src/lib/__tests__/pateEngine.test.ts` (valeurs de contrôle du brief).

## Phase 2 · fabrication par lot (blocs 2.1 à 2.4 en ligne)

- Tables `pate_lots`, `pate_lot_etapes` (migration `20261102090000_pate_lots.sql`). La recette est copiée et figée dans `recette_figee` (paramètres, pesées, étapes).
- Numéro de lot : `L-AAAA-MM-JJ-A`, date du pétrissage final (demain pour une biga lancée la veille), lettre suivante si plusieurs lots le même jour.
- Températures : eau de biga = 55 − (farine + cuisine) ; eau de pétrissage = TB − (farine + cuisine + biga). Sous 2 °C « ajouter des glaçons », au dessus de 35 °C avertissement.
- TB (température de base du pétrin) : TB d'un lot = farine + cuisine + eau utilisée + biga. TB appliquée = moyenne des 5 derniers lots du même type sortis dans la cible ; tant qu'il y en a moins de 3, `recipes.tb_manuelle` (56 au départ, valeur de Paul).
- Cibles : biga en sortie de pétrin 20 à 21 °C ; pâte 22 à 24 °C, alerte forte au delà de 25 °C. Fenêtre de la biga 20 à 30 h, cible 24 h.
- Clôture : test du voile coché et température de pâte obligatoires ; commentaire libre.
- Droits : lancer, clôturer et annuler un lot réservés aux pizzaiolos formés (`employes.pate_autorise`, case « Formé à la pâte » dans la fiche) et aux responsables (manager, group_admin). Les étapes : toute personne identifiée. Sur la tablette, l'employé vient du code à 4 chiffres (jeton signé `x-employe-tablette`).
- Écran : onglet Fournée du Mode production de la fiche d'empâtement (`src/components/pate/Fournee.tsx`). API : `/api/pate/lots`, `/api/pate/lots/[id]`.
- Étapes et minuteurs par défaut : `src/lib/pate/fournee.ts` ; modifiables par recette (`recipes.etapes_fournee`).

## Phase 2 · à venir (2.5 à 2.7)

- Bacs : 12 pâtons par bac, répartition chambre froide ou tour décidée au boulage. Fenêtre par type de recette : biga 24 à 48 h, directe 72 à 100 h (`recipes.fenetre_bacs_min_h`, `fenetre_bacs_max_h`), alerte en approche de la fin.
- Ordre de sortie : un bac en alerte de fin de fenêtre d'abord ; puis un bac revenu au froid non entamé ; puis chambre froide avant tour ; à lieu égal le plus âgé ; les restes de directe après les bacs de biga. Sortir et marquer les bacs : toute l'équipe identifiée. Raccourci Bacs sur la page Empâtements.
- Remise en température : rappel « sortir les bacs au moins 1 h avant », vague d'ouverture 3 à 4 bacs le midi, 5 à 6 le soir, puis un bac quand le précédent est à moitié entamé ; relevé facultatif à cœur (abaisser dès 13 à 15 °C).
- Essais : une seule variable (levure, sel, hydratation, ratio de farines, huile, miel, temps à température ambiante après boulage) ; évaluation : couleur, alvéolage du cornicione, goût, tenue à l'emporter, facilité d'abaisse, couleur du dessous, notés de 1 à 5, commentaire.

## Phase 3 · prévision

Pizzas vendues par service (sur place et à emporter), jour de semaine, météo ; cycle : vendredi directe (lundi soir, mardi midi, parfois mardi soir) ; biga lancée lundi matin, boulée mardi 9 h 30 (mardi soir, mercredi midi et soir) ; biga lancée mercredi matin, boulée jeudi (jeudi et vendredi) ; dépannage si manque. Services : soirs du lundi au vendredi, midis du mardi au vendredi. Sortie : pâtons par fournée (160 à 200, capacité 215) et bacs de la vague d'ouverture.

## Phase 4 · journal du four (plus tard)

Moretti Forni serie S, deux chambres, Dual Temp : sole à l'infrarouge (ouverture, après 10 et 30 pizzas), consignes ciel et sole, boosts, grilles.
