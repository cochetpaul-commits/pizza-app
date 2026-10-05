# iFratelli - Factures Drive (Apps Script)

Chaîne des factures fournisseurs de Bello Mio (SARL SASHA) et Piccola Mia (SARL I FRATELLI) :
toute facture reçue par mail finit dans le bon dossier Drive, donc dans le bon Pennylane, sans intervention.
Rien ne se perd en silence : ce qui est douteux va dans `À vérifier`, jamais à la poubelle ni au hasard.

Projet Apps Script `iFratelli - Factures Drive` (id `1I9lQ1onLAkeo9jRwNq1Y4G-4MpbIxvMPHyVRi3sYtqw4_Wp32-X3nNLP`,
compte cochetpaulbellomio@gmail.com), géré ici avec [clasp](https://github.com/google/clasp).

## Organisation du Drive (complément du 03/10/2026)

```
Factures iFratelli/
  Envoi Pennylane/            seuls dossiers surveillés par Pennylane, à plat
    Bello Mio/                id 180pZHqP2rRX1x281S7QXBREpc4VPROzS
    Piccola Mia/              id 1JCPrEpMPlVeWm9gjLZDR1bU-l38cYEH8
  Bello Mio/<Fournisseur>/<Année>/      archive, plus lue par Pennylane
  Piccola Mia/<Fournisseur>/<Année>/    archive
  _Hors Pennylane/<Établissement>/<Fournisseur>/<Année>/   relevés et mandats (dossier existant, gardé tel quel)
  À vérifier/                 douteux, raison dans la description du fichier
  Rattrapage à valider/<Établissement>/   transit du rattrapage, non surveillé par Pennylane
  Journal factures            Google Sheet (journal, messages traités, index anti-doublon, simulation, réorganisation, types)
  Fournisseurs iFratelli      Google Sheet : liste de référence des fournisseurs
Journaux de caisse iFratelli/ (racine du Drive) : les journaux de clôture de Piccola Mia
```

Parcours d'une facture sûre : créée à plat dans `Envoi Pennylane/<Établissement>` ; après 3 jours (Pennylane scanne
toutes les 8 h) `archiverEnvoisPennylane` la déplace dans `<Établissement>/<Fournisseur>/<Année>` en gardant son
identifiant Drive. Un fichier encore là après 7 jours est signalé dans le journal et dans le mail du lundi.

**Rattrapage (v4.2)** : `rattrapageReel` n'écrit jamais dans `Envoi Pennylane`. Les factures sûres vont dans
`Rattrapage à valider/<Établissement>/`, que Pennylane ne surveille pas. Claude, côté Cowork, compare chaque fichier à
Pennylane (numéro, montant, date) et ne déplace vers `Envoi Pennylane` que les absents ; l'index connaît déjà leur dossier
d'archive, l'archivage automatique suit. La passe horaire, elle, va directement dans `Envoi Pennylane`.

## Arborescence du code

```
src/
  00_config.js            réglages : dossiers, adresses, liste de référence initiale, marqueurs d'établissement
  10_extraction.js        fonctions PURES : date, numéro, montant, établissement, type, nom, décision, anti-doublon
  15_fournisseurs.js      fonctions PURES : résolution d'un fournisseur d'après la liste (identifiant, domaine, nom)
  20_journal.js           Google Sheet « Journal factures »
  25_fournisseurs_sheet.js  Google Sheet « Fournisseurs iFratelli » : lecture, lignes « à compléter », génération
  30_gmail.js             lecture Gmail par message, filtres d'expéditeur, pièces jointes
  40_ocr.js               OCR Google Drive (PDF, photos), XML, empreinte MD5
  50_rangement.js         dossiers Drive, écriture et déplacement des fichiers
  60_traitement.js        extraireFactures, rattrapage, archiverEnvoisPennylane, alerteHebdo, controlerPasses, installerDeclencheurs
  70_outils.js            indexerExistant, reindexerArchive, ocrDump, reorganiserArchive, renommerArchive, reparerTypesFichiers, deplacerJournauxDeCloture
  90_legacy.js            anciennes fonctions de maintenance (renommage, couleurs…)
  CouleursBelloMio.js     inchangé
tests/                    tests Node (node:test) : fixtures réelles + enchaînement complet sur de faux services Google
tools/ocr_dump.js         texte local d'un PDF pour fabriquer une fixture
```

Apps Script charge tous les fichiers dans un seul espace global : les modules s'appellent directement.
Les tests Node rechargent `src/` de la même façon (`tests/charger.js`, `tests/bouchons.js`).

## Logique

1. **Unité de travail = le message**, pas le fil (onglet `Messages traités`). Le libellé Gmail `traite` reste posé sur le fil, pour la lecture humaine.
2. **Entrée** : tous les messages avec pièce jointe PDF, XML ou image, sur toutes les adresses de la boîte, depuis la dernière
   passe terminée moins 24 h (curseur, v4.6), au minimum 72 h. Les messages envoyés et ceux qui viennent de nos adresses sont
   exclus, sauf les transferts de Pierre et Paul vers facture@.
3. **Classement par le contenu du document** : type (facture, avoir, ticket, relevé, mandat, devis, bon de commande,
   attestation, autre), établissement (TVA/SIREN, puis SASHA / place du Poncel / FRATELLI / rue Ville Pépin),
   fournisseur **uniquement d'après le Sheet « Fournisseurs iFratelli »** : identifiant lu sur la facture, puis domaine
   de l'expéditeur, puis nom ou variante dans l'objet. Le domaine ne sert jamais à inventer un nom.
4. **Destination** :
   - facture, avoir ou ticket, établissement sûr, montant lu, fournisseur connu : `Envoi Pennylane/<Établissement>/` ;
   - relevé ou mandat : `_Hors Pennylane/<Établissement>/<Fournisseur>/<Année>/` ;
   - devis, bon de commande, attestation (y compris attestation employeur France Travail), catalogue (tarifs, offres,
     promotions, mercuriales, d'après l'objet du mail, le nom de la pièce ou le texte) : rien n'est rangé, une ligne de journal ;
   - tout le reste (OCR raté, établissement ou fournisseur inconnu, montant introuvable, type incertain) : `À vérifier/`.
     Un fournisseur inconnu ajoute aussi une ligne « à compléter » dans le Sheet des fournisseurs (nom proposé, domaine, identifiants lus).
5. **Anti-doublon** (onglet `Index`) : même MD5, ou même fournisseur + numéro, ou même fournisseur + établissement + type
   (facture / avoir / relevé) + date + montant ; deux pièces qui ont chacune un numéro doivent avoir le même numéro.
   Les anciennes graphies de nom (Maeldistribution) sont ramenées au nom de la liste.
6. **Journal** : une ligne par pièce jointe, plus les archivages, les blocages et les factures reçues dans le corps d'un mail
   (destination `corps_mail`, hors `À vérifier`). L'établissement lu dans la liste de référence est marqué « (liste) ».
7. **Alerte** du lundi 8 h : `À vérifier` de plus de 3 jours, `Envoi Pennylane` de plus de 7 jours, et une section à part
   pour les factures reçues dans le corps d'un mail ces 7 derniers jours.

Règles d'extraction notables (v4.2) :
- relevé : « relevé client / mensuel / de factures », « récapitulatif de factures », « état récapitulatif », ou un tableau
  d'au moins 4 lignes « numéro, date, montant » avec un total ; un relevé ne va jamais vers Pennylane ;
- numéro : jamais un numéro de client (« client », « code client », « destinataire code ») ni une date ;
- avoir : montant négatif, ou « avoir » dans le titre du document (« FACTURE/AVOIR » d'en-tête ne compte pas) ;
- montant : HT + TVA = TTC dans le bloc des totaux, le total répété l'emporte sur TTC + consigne ; au delà de 10 000 € un
  montant n'est retenu qu'avec un triplet cohérent ; jamais au delà de 100 000 € ;
- date : « facture n° X du », « date de facture », « émise le », « L'équipe Alan, le » avant « date : » et « date » seuls ;
  les dates qui suivent « échéance », « prélèvement », « à payer avant » sont ignorées, ainsi que toute date plus de 3 jours
  après le mail ; une facture de plus de 90 jours va dans `À vérifier` (« ancienne facture ») ;
- établissement : lu sur le document, sinon colonne « Établissement par défaut » du Sheet si elle vaut Bello ou Piccola ;
- OCR : « User rate limit exceeded » -> nouveaux essais après 2 s, 5 s, 15 s ; si l'erreur persiste, le message n'est pas
  marqué traité, la passe s'arrête et reprend au lancement suivant ; en rattrapage, 1 s de pause entre deux OCR ;
- pièces jointes : les images au nom générique (image001.png, logo, signature, Outlook-…) sont ignorées, IMG_xxxx.jpg est gardé.

Règles ajoutées en v4.3 :
- consigne : un total qui vaut un autre total + une consigne (fûts, emballages, caution) est écarté (Cozigou : 506,65 et non 536,65) ;
- mots clés de total supplémentaires : « TTC à payer », « net à payer en EUR », « à payer : » (Elis via Esker) ;
- colonne « Établissement par défaut » : bello, bello mio, sasha, bm / piccola, piccola mia, fratelli, pm ; « Les deux » ou vide
  laisse la pièce à vérifier, et la raison affiche la valeur lue (« établissement inconnu (liste : « Les deux ») ») ;
- expéditeurs qui n'envoient jamais de factures (`CONFIG.expediteursJournalSeul`) : DocuSign -> contrat, notifications Pennylane,
  Vinted, La Poste, JDC -> notification, Up Coop -> bon de commande : journal seul ;
- contrats signés (DocuSign, signature électronique) et épreuves d'imprimeur (PDF de contrôle, bon à tirer : Diazo) reconnus
  dans le texte : journal seul ;
- messageries de particuliers (gmail, hotmail, icloud, wanadoo, live…) : sans SIRET, ni TVA, ni montant, la pièce est un
  « courrier » (devis client, CV, réservation) au journal seul ; avec un montant ou un identifiant, traitement normal.

Règles ajoutées en v4.4 :
- montant : le « net à payer » prime sur le TTC, c'est ce que Pennylane retient quand consignes et déconsignes s'en mêlent
  (Cozigou 6080101689 : TTC 729,25, consigne +30, déconsigne -64,20, net à payer 695,05) ; dans sa fenêtre, d'abord un montant
  cohérent HT + TVA, sinon un montant répété ailleurs sur le document ; « 0,00 » n'est jamais un total ;
- « Bon de commande n° » en tête de document (Hyg'Up) : bon de commande, journal seul, même avec un total TTC ; une facture
  qui cite un numéro de commande reste une facture.

Règles ajoutées en v4.5 (nettoyage du Sheet « Fournisseurs iFratelli ») :
- index des fournisseurs : une ligne active l'emporte toujours sur une ligne inactive de même clé (nom, variante, domaine,
  identifiant), quel que soit l'ordre des lignes ; deux lignes actives de même clé : la première est gardée et un
  avertissement est écrit dans le journal (destination `avertissement`) ; une ligne inactive ne donne plus de nom canonique ;
- colonne « Établissement par défaut », valeurs libres : `perso`, `pas besoin` -> ligne inactive (quoi que dise la colonne Actif) ;
  `bon de commande` -> toutes les pièces du fournisseur vont au journal seul ; autre valeur non reconnue -> avertissement et
  établissement vide ; variantes `bello`, `bello mio`, `sasha`, `bm` / `piccola`, `piccola mia`, `fratelli`, `pm` / `les deux` ;
- messageries grand public (`CONFIG.domainesParticuliers` : gmail, hotmail, outlook, live, yahoo, wanadoo, orange, free, icloud,
  laposte.net, sfr…) : seule une adresse complète (`sdpfcompta@hotmail.com`) identifie un fournisseur ; un tel domaine seul dans
  le Sheet est ignoré avec un avertissement ; la ligne « à compléter » proposée pour un inconnu porte l'adresse complète ;
  une variante égale au domaine (« Wanadoo ») n'est plus cherchée dans l'adresse de l'expéditeur ;
- numéro de facture : jamais un numéro de TVA (`FR` + 11 chiffres), ni un SIRET ou un SIREN présent sur le document ;
- « BC n° » et « Purchase order » en tête de document comptent comme « Bon de commande n° » ;
- réorganisation : la cible d'un fichier comprend son nouveau nom (fournisseur canonique, même format), écrit dans la colonne
  « Nouveau nom » de l'onglet `Réorganisation` ; `reorganiserArchiveReel` renomme en plus de déplacer ; les dossiers d'un
  fournisseur inactif sont laissés en place (ligne « ignoré (fournisseur inactif) ») en attendant la décision sur `_Perso`.

Règles ajoutées en v4.6 (audit du 06/10 : archive comparée à Pennylane, Journal, Index, revue du code) :
- **montants** : une colonne isolée collée par l'OCR à la base HT (« 5 121,58 », « 2 105,40 ») ne fait plus un montant : les deux
  lectures (collée, non collée) sont produites et seule celle qui forme un triplet HT + TVA = TTC est gardée, la lecture collée
  n'étant acceptée que si aucun triplet n'existe sans elle (SDPF FA071465 : 128,27 et non 5 121,58 ; Maël FB9280 : 111,20 ;
  Le Père Billard : 4 388,91 gardé) ; espaces fines U+202F / U+2009 et « O » lu pour un zéro normalisés (Elien D63834 : 1 072,56) ;
  un signe moins n'est retenu que collé au nombre ou suivi d'un « € » / d'une fin de ligne (« 128,27 - Echéance » reste positif) ;
  un avoir imprimé en positif prend un montant négatif ; « solde antérieur », « nouveau solde » ne sont jamais le total (Self Stockage : 90,00) ;
- **sûreté** : verrou `LockService` sur chaque point d'entrée ; Index, Journal et Messages traités écrits après chaque message ;
  limite de temps vérifiée avant chaque pièce (une pièce déjà rangée est dans l'Index, la reprise la voit en doublon) ;
- **archivage** : l'âge d'un fichier de `Envoi Pennylane` se compte depuis son ARRIVÉE (colonne « Dans Envoi depuis » de l'Index),
  un fichier déplacé à la main depuis `À vérifier` ou le transit est daté du jour où il est vu et attend 3 jours pleins ; un fichier
  inconnu de l'Index y est ajouté ; noms suffixés « (2) » reconnus ; une erreur sur un fichier n'arrête pas les autres ;
- `rattrapageBascule` retiré (copies non indexées, la bascule est faite) ;
- **pièces jointes** : une pièce écartée (zip, p7m, docx, sans extension ni type connu…) est journalisée (destination `ignoree`) ;
  un PDF sans extension est reconnu par son type MIME ; Factur-X : l'XML joint à un PDF est journalisé seulement ;
- **fournisseurs** : une ligne « à compléter » est inactive tant que Paul ne l'a pas relue (c'est ainsi qu'étaient nés « Cmb »,
  « Indy », « Esker ») ; plateformes de facturation (`CONFIG.domainesPlateformes` : facture.cmb.fr, esker.com, indy.fr,
  mon-expert-en-gestion.fr, notifications.pennylane.com) : le domaine n'est jamais le fournisseur, il faut un identifiant ou un nom
  complet lu dans le document, sinon `À vérifier` (« plateforme, fournisseur non lu ») et jamais de ligne « à compléter » ;
  `completerIdentifiantsFournisseurs` ne retient que le groupe d'identifiants de l'émetteur (jamais les nôtres, SIRET compris,
  jamais un identifiant déjà porté par une autre ligne : avertissement) ; les noms ne sont reconnus qu'en entier (« Apple Pay »
  n'est pas Apple, « masse » n'est pas Masse ; nom affiché de l'expéditeur dès 4 caractères, objet dès 6, document dès 5) ;
- **établissement** : bloc d'adresse de facturation (« Facturé à », « Client : »…) cherché d'abord ; un document qui cite les
  deux sociétés est contradictoire : l'adresse de réception (facture@bellomio.fr / facture@piccolamia.fr) départage, sinon
  `À vérifier` sans appliquer l'établissement par défaut de la liste ; majorité nette (deux marqueurs contre un) acceptée ;
  « SASHA I FRATELLI AND CO » (nom complet de la SARL SASHA) ne désigne pas Piccola ;
- **bons de livraison** (« Bon de livraison », « BL n° », « BDL… ») : journal seul, règle placée avant celle des factures
  (« facturée » perd son accent dans la normalisation) ;
- **types MIME** : une pièce est écrite dans Drive avec le type de son extension, jamais celui du mail (« application/others ») ;
  `reparerTypesFichiers` (simulation, onglet `Types`) / `reparerTypesFichiersReel` corrigent l'existant par une nouvelle
  révision (même identifiant) ;
- **Index** : colonnes au format texte (« 00113789 » reste un texte), écriture par identifiant de fichier (un tri de l'onglet ne
  trompe plus `indexDeplacer`), `indexRenommer` relit fournisseur, numéro, date et montant dans le nouveau nom,
  `deplacerJournauxDeCloture` met l'Index à jour, `reindexerArchive` reconstruit l'Index depuis le Drive ;
- **OCR** : une erreur passagère (hors quota) donne un nouvel essai après 2 s, puis « texte illisible (OCR : <erreur>) » ;
- **contrôle quotidien** `controlerPasses` (7 h) : mail à Paul si la dernière passe terminée date de plus de 24 h.

Le nom des fichiers garde le format historique : `AAAA-MM-JJ — Fournisseur — Facture n° XXX — 123.45 EUR.pdf`
(avoirs en négatif, tickets sans numéro, relevés `Relevé n° XXX`).

## Installation (une fois)

```bash
cd apps-script/factures-drive
npm install            # clasp
npm run login          # navigateur, compte cochetpaulbellomio@gmail.com
npm run push           # = npm test && clasp push (refuse de pousser si un test échoue)
```

Puis, dans l'éditeur Apps Script (`npm run open`), dans cet ordre :

1. `genererListeFournisseurs` : crée le Sheet « Fournisseurs iFratelli » (liste initiale + noms des dossiers existants
   ajoutés comme variantes ou comme lignes « à relire »). **Paul relit la liste** : noms propres, variantes, établissement par défaut,
   colonne Actif. `completerIdentifiantsFournisseurs` (optionnel, relancer jusqu'à « TERMINÉ ») lit un PDF archivé par
   fournisseur pour remplir SIRET / TVA.
2. `installerDeclencheurs` : `extraireFactures` toutes les heures, `archiverEnvoisPennylane` chaque nuit, `controlerPasses` chaque
   matin, `alerteHebdo` le lundi. Le premier lancement demande les autorisations. À relancer après la v4.6 (nouveau déclencheur).
3. `indexerExistant` : indexe les fichiers déjà rangés (Envoi Pennylane, archives, _Hors Pennylane, À vérifier).
   Relancer jusqu'à « TERMINÉ ». **Obligatoire avant tout rattrapage.**
4. Paul bascule la source Google Drive de chaque société Pennylane sur `Envoi Pennylane/<Établissement>`.

## Rattrapages, dans l'ordre

1. **Bascule Pennylane** (faite le 04/10, fonction retirée en v4.6).
2. **Mails depuis le 01/07/2026** : `rattrapageDepuisJuillet` (simulation, onglet `Simulation` du journal : ce qui irait en
   transit `Rattrapage à valider` et où il sera archivé, ce qui irait en `À vérifier` avec la raison, les doublons ignorés).
   Paul valide, puis `rattrapageReelDepuisJuillet`. Relancer chaque fonction jusqu'à « TERMINÉ » (un arrêt « QUOTA OCR »
   se relance de la même façon). Claude (Cowork) vide ensuite `Rattrapage à valider` vers `Envoi Pennylane` après comparaison
   avec Pennylane.
3. **Réorganisation de l'archive** : `reorganiserArchive` (simulation) remplit l'onglet `Réorganisation` du journal :
   pour chaque fichier, ancien chemin, nouveau chemin `<Établissement>/<Fournisseur de la liste>/<Année>` et méthode.
   Les dossiers doublons sont fusionnés (Metro et Metro-gsc, SC M2 et Sc-m2…), les dossiers fourre-tout (Facture,
   Invoicing, Transfert Pierre, Yahoo, Wanadoo, Indy, Bellomio…) sont vidés d'après le contenu des PDF (OCR), les relevés
   égarés dans l'archive repartent vers `_Hors Pennylane`, l'illisible va en `À vérifier`. Relancer jusqu'à « TERMINÉ »
   (les fichiers déjà planifiés ne sont pas relus). Paul valide l'onglet, puis `reorganiserArchiveReel` exécute les
   lignes « simulation » (déplacement, et renommage si la colonne « Nouveau nom » diffère), les marque « fait » et met les
   dossiers vides à la corbeille.
4. `deplacerJournauxDeCloture` : `Piccola Mia/Journaux de clôture` part dans `Journaux de caisse iFratelli/Piccola Mia`.
5. **Renommage de l'archive déjà réorganisée** (v4.5) : `renommerArchive` (simulation, aucun OCR) parcourt `Bello Mio`,
   `Piccola Mia` et `_Hors Pennylane` et écrit dans l'onglet `Réorganisation`, méthode « renommage », les fichiers dont le
   nom porte un ancien fournisseur (« Wanadoo » dans `Self Stockage`, « Indy » dans `Alain Pedron Nettoyage`, « Hyg-up »…),
   avec le nouveau nom. Les lignes « fait » de la réorganisation (déplacements) ne dispensent pas un fichier d'être relu :
   seule une ligne « renommage » ou « ignoré » le fait (v4.5.1). Les dossiers d'un fournisseur inactif de la liste donnent une ligne « ignoré ». Paul relit l'onglet,
   puis `renommerArchiveReel` ne fait que renommer (rien n'est déplacé ni supprimé, identifiants conservés, index mis à jour).

6. **Après la v4.6**, dans cet ordre : `reparerTypesFichiers` (simulation, onglet `Types`) puis `reparerTypesFichiersReel` ;
   `reindexerArchive` (vide et reconstruit l'Index depuis le Drive, relancer jusqu'à « TERMINÉ ») ; `renommerArchive` puis
   `renommerArchiveReel` pour les noms et montants restés faux. On relit chaque onglet avant le passage réel.

`reinitialiserReprises` efface les positions de reprise pour recommencer une simulation de zéro.
Les fichiers ne sont jamais supprimés par ces fonctions (déplacés ou renommés seulement, identifiant conservé).

### Elis

Les fichiers Elis déjà archivés portent le capital social (448 544 EUR) dans leur nom ; Pennylane a les bons montants.
`reverifierFactures` (90_legacy.js) relit ces fichiers et renomme seulement.

## Tests

```bash
npm test
```

- `tests/extraction.test.js` : chaque fixture de `tests/fixtures/*.txt` est analysée et comparée à `attendus.json`.
  Cas pièges : avoir Maël négatif, relevé Carniato Piccola reçu sur l'adresse Bello, capital social d'Elis,
  « Avoir de prix » dans une légende Cheville 35, « ATTESTATION FACTURE » sur une facture Carniato, devis avec total TTC,
  mandat Prophyl, attestation DSN, ticket Leroy Merlin, fournisseur inconnu, entrée inactive, anciennes graphies,
  relevé mensuel TerreAzur (13 factures, code client 329789), Alan (échéance future, capital social), Cozigou
  (« FACTURE/AVOIR », consigne), Elien (facture de janvier reçue en juin), attestation employeur France Travail ;
  v4.6 : BR Nuisibles via Crédit Mutuel, Le Père Billard via Mon Expert en Gestion, bon de livraison, SDPF et Maël (colonne
  collée), Elien (espace fine, O pour 0), Self Stockage (solde), Elis 982324 via Esker.
- `tests/rangement.test.js` : règles de destination et clés d'anti-doublon.
- `tests/traitement.test.js` : enchaînement complet sur de faux services Google : facture Maël Piccola dans un fil Bello,
  même pièce reçue deux fois, mail interne ignoré, transfert de Paul, tarifs Maison Hardy, OCR raté, devis, facture dans
  le corps d'un mail, photo de facture, fournisseur inconnu (ligne « à compléter »), simulation puis réel, limite de temps,
  archivage après 3 jours, blocage après 7 jours et alerte, indexation de l'existant, réorganisation simulée puis réelle,
  journaux de clôture, génération de la liste, quota OCR (nouvel essai, arrêt, reprise), transit du rattrapage, établissement
  par défaut, images de signature ; v4.6 : verrou, curseur, limite de temps au milieu d'un message, pièces écartées, PDF sans
  extension, Factur-X, plateforme, OCR muet, réparation des types, réindexation, Index trié, journaux, renommage.

### Ajouter une facture au jeu de tests

- **Fidèle à la production** : déposer le PDF dans `Factures iFratelli/_Fixtures OCR`, lancer `ocrDump` dans l'éditeur,
  copier le `.txt` créé dans `tests/fixtures/`.
- **Rapide, en local** : `npm run ocr:dump -- chemin/facture.pdf` (extraction de texte, pas l'OCR Google).

Puis décrire l'attendu dans `tests/fixtures/attendus.json` et lancer `npm test`. Les fixtures Maël, Carniato, Elis,
Cheville 35, TerreAzur, Leroy Merlin et Hyg'Up viennent des PDF du Drive ; les trois marquées `synthetique`
(mandat Prophyl, devis, attestation DSN) sont à remplacer par de vrais documents.

## Contraintes respectées

- Aucune suppression de fichier par le script. Au pire, corbeille des dossiers vides, tracée dans le journal d'exécution.
- Rien n'entre dans `Envoi Pennylane` qui ne soit une facture, un avoir ou un ticket avec établissement sûr, montant lu
  et fournisseur de la liste de référence.
- Limite des 6 minutes : chaque fonction longue s'arrête à 5 min, mémorise sa position et reprend au lancement suivant.
- Commentaires, journal et messages en français.
