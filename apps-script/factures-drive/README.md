# iFratelli - Factures Drive (Apps Script)

Chaîne des factures fournisseurs de Bello Mio (SARL SASHA) et Piccola Mia (SARL I FRATELLI) :
toute facture reçue par mail finit dans le bon dossier Drive, donc dans le bon Pennylane, sans intervention.
Rien ne se perd en silence : ce qui est douteux va dans `_À vérifier`, jamais à la poubelle ni au hasard.

Projet Apps Script `iFratelli - Factures Drive` (id `1I9lQ1onLAkeo9jRwNq1Y4G-4MpbIxvMPHyVRi3sYtqw4_Wp32-X3nNLP`,
compte cochetpaulbellomio@gmail.com), géré ici avec [clasp](https://github.com/google/clasp).

## Arborescence

```
src/
  00_config.js       réglages : dossiers, adresses, tables fournisseurs, marqueurs d'établissement
  10_extraction.js   fonctions PURES : date, numéro, montant, établissement, type, fournisseur, nom, décision, anti-doublon
  20_journal.js      Google Sheet « Journal factures » (Journal, Messages traités, Index, Simulation)
  30_gmail.js        lecture Gmail par message, filtres d'expéditeur, pièces jointes
  40_ocr.js          OCR Google Drive (PDF, photos), XML, empreinte MD5
  50_rangement.js    dossiers Drive, écriture des fichiers
  60_traitement.js   extraireFactures, rattrapage, rattrapageReel, alerteAVerifier, installerDeclencheurs
  70_outils.js       indexerExistant, ocrDump, analyserMessage
  90_legacy.js       anciennes fonctions de maintenance (renommage, couleurs…)
  CouleursBelloMio.js  inchangé
tests/
  fixtures/          textes réels de factures + attendus.json
  *.test.js          tests Node (node:test), dont un enchaînement complet sur de faux services Google
tools/ocr_dump.js    texte local d'un PDF pour fabriquer une fixture
```

Apps Script charge tous les fichiers dans un seul espace global : les modules ne s'importent pas,
ils s'appellent directement. Les tests Node rechargent `src/` de la même façon (`tests/charger.js`).

## Logique

1. **Unité de travail = le message**, pas le fil. Les identifiants traités sont dans l'onglet
   `Messages traités` du journal. Le libellé Gmail `traite` reste posé sur le fil, pour la lecture humaine seulement.
2. **Entrée** : tous les messages avec pièce jointe PDF, XML ou image (ou dont l'objet parle de facture),
   sur toutes les adresses de la boîte, depuis 72 h (passe horaire). Les messages envoyés et ceux qui viennent
   de nos adresses sont exclus, sauf les transferts de Pierre et Paul vers facture@.
3. **Classement par le contenu du document** (`analyserDocument`) : type (facture, avoir, ticket, relevé, mandat,
   devis, bon de commande, attestation, autre), établissement (TVA/SIREN puis SASHA / place du Poncel / FRATELLI /
   rue Ville Pépin), fournisseur (table, puis TVA lue sur la facture, puis domaine de l'expéditeur).
4. **Destination** (`decider`) :
   - facture, avoir ou ticket, établissement sûr, montant lu : `Factures iFratelli/<Établissement>/<Fournisseur>/<MM - Mois AAAA>/` (synchronisé Pennylane) ;
   - relevé ou mandat : `_Hors Pennylane/<Établissement>/<Fournisseur>/<Mois>/` ;
   - devis, bon de commande, attestation : rien n'est rangé, une ligne de journal ;
   - tout le reste (OCR raté, établissement inconnu, type incertain, montant introuvable) : `_À vérifier/<Mois>/`,
     la raison et le lien du mail dans la description du fichier.
5. **Anti-doublon** sur les deux établissements (onglet `Index`) : même MD5, ou même fournisseur + numéro,
   ou même fournisseur + date + montant.
6. **Journal** : une ligne par pièce jointe (date, expéditeur, adresse de réception, type, établissement, fournisseur,
   numéro, montant, destination, raison, lien fichier, lien mail).
7. **Alerte** : le lundi à 8 h, si `_À vérifier` contient des fichiers de plus de 3 jours, mail récapitulatif à cochetpaul@bellomio.fr.
8. **Factures dans le corps du mail** (Zenchef, Alan, Mailjet…) sans pièce jointe : ligne `a_verifier` dans le journal avec le lien du mail.

Le nom des fichiers garde le format historique : `AAAA-MM-JJ — Fournisseur — Facture n° XXX — 123.45 EUR.pdf`
(avoirs en négatif, tickets sans numéro, relevés `Relevé n° XXX`).

## Installation (une fois)

```bash
cd apps-script/factures-drive
npm install            # clasp
npm run login          # ouvre le navigateur, compte cochetpaulbellomio@gmail.com
npm test               # les tests doivent passer
npm run push           # = npm test && clasp push (refuse de pousser si un test échoue)
```

Puis, dans l'éditeur Apps Script (`npm run open`), lancer une fois :

1. `installerDeclencheurs` : remplace le déclencheur horaire de `extraireFactures` et ajoute `alerteAVerifier` (lundi 8 h).
   Le premier lancement demande les autorisations (Gmail, Drive, Sheets, envoi de mail).
2. `indexerExistant` : indexe les fichiers déjà rangés (MD5 + nom) dans l'onglet `Index` du journal.
   Relancer jusqu'à « TERMINÉ » dans le journal d'exécution. **Obligatoire avant le rattrapage**, sinon les pièces
   déjà rangées seraient réécrites.

Le journal est le Google Sheet `Factures iFratelli/Journal factures`, créé au premier passage.

## Rattrapage depuis le 01/07/2026

1. `rattrapageDepuisJuillet` (simulation) : rien n'est écrit dans Drive. Relancer jusqu'à « TERMINÉ ».
   Le rapport est dans l'onglet `Simulation` du journal : ce qui serait rangé (et où), ce qui irait en `_À vérifier`
   (avec la raison), les doublons ignorés, les devis et attestations laissés de côté.
2. Paul valide le rapport.
3. `rattrapageReelDepuisJuillet` : même parcours, pour de vrai. Relancer jusqu'à « TERMINÉ ».

`reinitialiserReprises` efface les positions de reprise pour recommencer une simulation de zéro.
Les dossiers existants ne sont ni renommés ni déplacés.

## Tests

```bash
npm test
```

- `tests/extraction.test.js` : chaque fixture de `tests/fixtures/*.txt` est analysée et comparée à `attendus.json`
  (type, établissement, fournisseur, numéro, date, montant, nom, destination, chemin). Cas pièges couverts :
  avoir Maël négatif, relevé Carniato Piccola reçu sur l'adresse Bello, capital social d'Elis (448 544 €),
  « Avoir de prix » dans une légende Cheville 35, « ATTESTATION FACTURE » sur une facture Carniato, devis avec total TTC,
  mandat Prophyl, attestation DSN, ticket Leroy Merlin.
- `tests/rangement.test.js` : règles de destination et clés d'anti-doublon.
- `tests/traitement.test.js` : enchaînement complet sur de faux services Google (`tests/bouchons.js`) :
  facture Maël Piccola dans un fil Bello, même pièce reçue deux fois, mail interne ignoré, transfert de Paul,
  tarifs Maison Hardy, OCR raté, devis, facture dans le corps d'un mail Zenchef, photo de facture, simulation puis réel,
  limite de temps et reprise, alerte, indexation de l'existant.

### Ajouter une facture au jeu de tests

Deux façons d'obtenir le texte :

- **Fidèle à la production** : déposer le PDF dans `Factures iFratelli/_Fixtures OCR`, lancer `ocrDump` dans l'éditeur
  Apps Script, récupérer le `.txt` créé à côté (texte tel que l'OCR Google le lit) et le copier dans `tests/fixtures/`.
- **Rapide, en local** : `npm run ocr:dump -- chemin/facture.pdf` (extraction de texte avec `unpdf`, pas l'OCR Google :
  l'ordre des mots peut différer).

Puis décrire l'attendu dans `tests/fixtures/attendus.json` (mail d'origine + résultat attendu) et lancer `npm test`.

Les fixtures actuelles de Maël, Carniato, Elis, Cheville 35, TerreAzur, Leroy Merlin et Hyg-up viennent des PDF du Drive
(extraction de texte Google, proche de l'OCR). Les trois marquées `synthetique` (mandat Prophyl, devis, attestation DSN)
sont des textes plausibles à remplacer par de vrais documents dès que possible.

## Contraintes respectées

- Aucune suppression de fichier par le script. Au pire, corbeille (fonctions de maintenance), tracée dans le journal d'exécution.
- Rien n'entre dans `Bello Mio` ou `Piccola Mia` qui ne soit une facture, un avoir ou un ticket avec établissement sûr et montant lu.
- Limite des 6 minutes : chaque fonction longue s'arrête à 5 min, mémorise sa position (`PropertiesService`) et reprend au lancement suivant.
- Commentaires, journal et messages en français.
