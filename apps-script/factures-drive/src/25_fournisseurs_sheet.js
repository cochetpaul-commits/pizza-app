// ============================================================================
// Google Sheet « Fournisseurs iFratelli » (dans « Factures iFratelli ») : lecture à chaque
// exécution (cache mémoire), ajout de lignes « à compléter », génération initiale.
// ============================================================================

var _fournisseurs = { classeur: null, idx: null, aAjouter: [], dejaProposes: {} };

function fournisseursClasseur(creer) {
  if (_fournisseurs.classeur) return _fournisseurs.classeur;
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var it = racine.getFilesByName(CONFIG.fournisseursNom);
  if (it.hasNext()) _fournisseurs.classeur = SpreadsheetApp.open(it.next());
  else if (creer) {
    var c = SpreadsheetApp.create(CONFIG.fournisseursNom);
    DriveApp.getFileById(c.getId()).moveTo(racine);
    var f = c.getSheets()[0];
    f.setName("Fournisseurs");
    f.appendRow(COLONNES_FOURNISSEURS);
    f.setFrozenRows(1);
    _fournisseurs.classeur = c;
  }
  return _fournisseurs.classeur;
}

/** Index des fournisseurs lu dans le Sheet (ou liste par défaut si le Sheet n'existe pas encore) */
function fournisseursIndex() {
  if (_fournisseurs.idx) return _fournisseurs.idx;
  var classeur = fournisseursClasseur(false), liste;
  if (!classeur) {
    Logger.log("Sheet « " + CONFIG.fournisseursNom + " » absent : liste par défaut (lancer genererListeFournisseurs)");
    liste = listeFournisseursParDefaut();
  } else {
    var f = classeur.getSheetByName("Fournisseurs") || classeur.getSheets()[0];
    var n = f.getLastRow();
    liste = n > 1 ? f.getRange(2, 1, n - 1, COLONNES_FOURNISSEURS.length).getValues().map(entreeDepuisLigne).filter(function(e) { return e.nom; }) : [];
  }
  _fournisseurs.idx = indexerFournisseurs(liste);
  _fournisseurs.idx.avertissements.forEach(function(a) { Logger.log("AVERTISSEMENT " + a); journalAvertir(a); });
  return _fournisseurs.idx;
}

/** Propose une ligne « à compléter » (une seule par domaine et par passe), écrite par fournisseursVider() */
function fournisseursProposer(e) {
  var ligne = ligneACompleter(e);
  var cle = (ligne.domaines[0] || "") + "|" + ligne.nom;
  var idx = fournisseursIndex();
  var d0 = ligne.domaines[0] || "";
  // déjà dans le Sheet (même « à compléter ») : on ne redouble pas
  if (d0 && (idx.parDomaine[d0] || idx.parAdresse[d0])) return;
  if (_fournisseurs.dejaProposes[cle]) return;
  _fournisseurs.dejaProposes[cle] = true;
  _fournisseurs.aAjouter.push(ligneDepuisEntree(ligne));
  // dans la même passe, le domaine (ou l'adresse complète) est connu comme « à compléter » (inactif : la pièce reste « À vérifier »)
  if (d0) (d0.indexOf("@") !== -1 ? idx.parAdresse : idx.parDomaine)[d0] = Object.assign({}, ligne, { actif: "non" });
}

function fournisseursVider() {
  if (!_fournisseurs.aAjouter.length) return;
  var classeur = fournisseursClasseur(true);
  var f = classeur.getSheetByName("Fournisseurs") || classeur.getSheets()[0];
  f.getRange(f.getLastRow() + 1, 1, _fournisseurs.aAjouter.length, COLONNES_FOURNISSEURS.length).setValues(_fournisseurs.aAjouter);
  _fournisseurs.aAjouter = [];
}

/**
 * Première version de la liste : CONFIG.fournisseursReference + noms des dossiers actuels de l'archive
 * (Bello Mio, Piccola Mia, Hors Pennylane) ajoutés comme variantes s'ils correspondent à une entrée, sinon
 * comme nouvelles lignes à relire. Ne crée le Sheet que s'il n'existe pas ; sinon complète les lignes manquantes.
 * Les SIRET/TVA lus sur les factures archivées sont ajoutés par completerIdentifiantsFournisseurs().
 */
function genererListeFournisseurs() {
  var classeur = fournisseursClasseur(true);
  var f = classeur.getSheetByName("Fournisseurs") || classeur.getSheets()[0];
  var n = f.getLastRow();
  var existantes = n > 1 ? f.getRange(2, 1, n - 1, COLONNES_FOURNISSEURS.length).getValues().map(entreeDepuisLigne) : [];
  var liste = existantes.length ? existantes : listeFournisseursParDefaut();
  var idx = indexerFournisseurs(liste), ajoutees = 0, variantesAjoutees = 0;
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var tetes = CONFIG.etablissements.concat([CONFIG.dossiers.horsPennylane]);
  tetes.forEach(function(tete) {
    var it = racine.getFoldersByName(tete);
    if (!it.hasNext()) return;
    var sous = it.next().getFolders();
    while (sous.hasNext()) {
      var nomDossier = sous.next().getName();
      if (CONFIG.etablissements.indexOf(nomDossier) !== -1) {   // Hors Pennylane/<Etab>/<Fournisseur>
        var sous2 = racine.getFoldersByName(tete).next().getFoldersByName(nomDossier).next().getFolders();
        while (sous2.hasNext()) integrerDossier(sous2.next().getName());
      } else integrerDossier(nomDossier);
    }
  });
  function integrerDossier(nomDossier) {
    if (CONFIG.dossiersFourreTout.indexOf(nomDossier) !== -1 || nomDossier === CONFIG.dossiers.journauxCloture) return;
    var k = cleFournisseur(nomDossier);
    if (!k) return;
    var e = idx.parCle[k];
    if (e) {
      if (e.nom !== nomDossier && e.variantes.indexOf(nomDossier) === -1) { e.variantes.push(nomDossier); variantesAjoutees++; }
      return;
    }
    var nouvelle = { nom: nomDossier, variantes: [], domaines: [], identifiants: [], etab: "", pennylaneBello: "", pennylanePiccola: "", actif: "oui", remarque: "dossier existant, à relire" };
    liste.push(nouvelle);
    idx.parCle[k] = nouvelle;
    ajoutees++;
  }
  liste.sort(function(a, b) { return cleFournisseur(a.nom).localeCompare(cleFournisseur(b.nom)); });
  if (f.getLastRow() > 1) f.deleteRows(2, f.getLastRow() - 1);
  f.getRange(2, 1, liste.length, COLONNES_FOURNISSEURS.length).setValues(liste.map(ligneDepuisEntree));
  _fournisseurs.idx = null;
  Logger.log("Liste « " + CONFIG.fournisseursNom + " » : " + liste.length + " fournisseurs (" + ajoutees + " dossiers ajoutés à relire, " + variantesAjoutees + " variantes ajoutées) — " + classeur.getUrl());
}

/**
 * Complète la colonne SIRET / TVA en lisant (OCR) une facture archivée par fournisseur sans identifiant.
 * Relancer jusqu'à « TERMINÉ ».
 */
function completerIdentifiantsFournisseurs() {
  var debut = Date.now();
  var classeur = fournisseursClasseur(true);
  var f = classeur.getSheetByName("Fournisseurs") || classeur.getSheets()[0];
  var n = f.getLastRow();
  if (n < 2) { Logger.log("Liste vide : lancer genererListeFournisseurs"); return; }
  var lignes = f.getRange(2, 1, n - 1, COLONNES_FOURNISSEURS.length).getValues();
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), st = { lus: 0, trouves: 0, arret: false };
  for (var i = 0; i < lignes.length; i++) {
    if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; break; }
    var e = entreeDepuisLigne(lignes[i]);
    if (e.identifiants.length || /^(non|fait|aucun)$/i.test(e.remarque)) continue;
    var fichier = premierFichierDuFournisseur(racine, [e.nom].concat(e.variantes));
    if (!fichier) { lignes[i][8] = e.remarque || "aucun fichier archivé"; continue; }
    st.lus++;
    var ids = listerIdentifiants(lireTexte(fichier.getBlob(), extensionDe(fichier.getName())));
    if (ids.length) { lignes[i][3] = ids.join("; "); st.trouves++; } else lignes[i][8] = (e.remarque ? e.remarque + " ; " : "") + "aucun identifiant lu";
  }
  f.getRange(2, 1, lignes.length, COLONNES_FOURNISSEURS.length).setValues(lignes);
  _fournisseurs.idx = null;
  Logger.log("Factures lues : " + st.lus + ", identifiants trouvés : " + st.trouves);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");
}

/** Premier PDF trouvé dans un dossier d'archive portant un des noms donnés (Bello Mio puis Piccola Mia) */
function premierFichierDuFournisseur(racine, noms) {
  for (var e = 0; e < CONFIG.etablissements.length; e++) {
    var itE = racine.getFoldersByName(CONFIG.etablissements[e]);
    if (!itE.hasNext()) continue;
    var etab = itE.next();
    for (var i = 0; i < noms.length; i++) {
      var it = etab.getFoldersByName(noms[i]);
      while (it.hasNext()) {
        var f = premierPdf(it.next(), 0);
        if (f) return f;
      }
    }
  }
  return null;
}

function premierPdf(dossier, profondeur) {
  var fs = dossier.getFiles();
  while (fs.hasNext()) { var f = fs.next(); if (/\.pdf$/i.test(f.getName())) return f; }
  if (profondeur > 3) return null;
  var sd = dossier.getFolders();
  while (sd.hasNext()) { var r = premierPdf(sd.next(), profondeur + 1); if (r) return r; }
  return null;
}
