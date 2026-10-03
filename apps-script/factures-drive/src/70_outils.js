// ============================================================================
// Outils à lancer à la main depuis l'éditeur Apps Script.
// ============================================================================

/**
 * Indexe les fichiers déjà rangés (Bello Mio, Piccola Mia, _Hors Pennylane, _À vérifier) dans l'onglet « Index »
 * du journal : empreinte MD5 (lue dans Drive), fournisseur, numéro, date, montant tirés du nom normalisé.
 * À lancer AVANT le premier rattrapage. Reprend là où il s'est arrêté : relancer jusqu'à « TERMINÉ ».
 */
function indexerExistant() {
  var debut = Date.now(), racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var index = indexCharger(), dejaIds = {};
  for (var k in index) dejaIds[index[k].fichierId] = true;
  var st = { vus: 0, ajoutes: 0, arret: false };
  var tetes = CONFIG.etablissements.concat([CONFIG.dossiers.horsPennylane, CONFIG.dossiers.aVerifier]);
  for (var i = 0; i < tetes.length && !st.arret; i++) {
    var it = racine.getFoldersByName(tetes[i]);
    if (!it.hasNext()) continue;
    parcourirIndex(it.next(), tetes[i], tetes[i] === CONFIG.dossiers.horsPennylane || tetes[i] === CONFIG.dossiers.aVerifier ? null : tetes[i]);
  }
  journalVider();
  Logger.log("Fichiers vus : " + st.vus + ", ajoutés à l'index : " + st.ajoutes);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");

  function parcourirIndex(dossier, chemin, etab) {
    var fs = dossier.getFiles();
    while (fs.hasNext()) {
      if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; return; }
      var f = fs.next();
      st.vus++;
      if (dejaIds[f.getId()]) continue;
      var md5 = null;
      try { md5 = Drive.Files.get(f.getId(), { fields: "md5Checksum" }).md5Checksum || null; } catch (e) { Logger.log("MD5 illisible " + f.getName() + " : " + e); }
      var n = analyserNomFichier(f.getName()) || {};
      var morceaux = chemin.split("/");
      var etabFichier = etab || (morceaux.length > 1 && CONFIG.etablissements.indexOf(morceaux[1]) !== -1 ? morceaux[1] : null);
      indexAjouter({ fichierId: f.getId(), md5: md5, etablissement: etabFichier, fournisseur: n.fournisseur || (morceaux.length > 1 ? morceaux[etab ? 1 : 2] : null),
                     numero: n.numero || null, date: n.date || dateIso(f.getDateCreated()), montant: n.montant || null, nom: f.getName(), chemin: chemin });
      dejaIds[f.getId()] = true;
      st.ajoutes++;
      if (st.ajoutes % 100 === 0) journalVider();
    }
    var sd = dossier.getFolders();
    while (sd.hasNext() && !st.arret) { var s = sd.next(); parcourirIndex(s, chemin + "/" + s.getName(), etab); }
  }
}

/**
 * Jeu de tests : dépose des PDF (ou photos) dans « Factures iFratelli/_Fixtures OCR », lance ocrDump,
 * un fichier « <nom>.txt » est créé à côté de chaque PDF avec le texte tel que le script le lit (OCR Google).
 * Copier ces .txt dans tests/fixtures du dépôt et décrire l'attendu dans attendus.json.
 */
function ocrDump() {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var dossier = obtenirOuCreerDossier(racine, CONFIG.dossiers.fixtures);
  var fs = dossier.getFiles(), n = 0;
  while (fs.hasNext()) {
    var f = fs.next(), nom = f.getName(), ext = extensionDe(nom);
    if (CONFIG.extensionsPieces.indexOf(ext) === -1) continue;
    var nomTxt = nom.replace(/\.[a-z0-9]+$/i, "") + ".txt";
    if (dossier.getFilesByName(nomTxt).hasNext()) continue;
    var texte = lireTexte(f.getBlob(), ext);
    dossier.createFile(nomTxt, texte || "", "text/plain");
    var a = analyserDocument({ texte: texte, from: "", subject: "", nomPiece: nom, dateMail: dateIso(f.getDateCreated()), extension: "." + ext });
    Logger.log(nom + " -> " + nomTxt + " | " + a.type + " | " + a.etablissement + " | " + a.fournisseur + " | " + a.numero + " | " + a.date + " | " + a.montant);
    n++;
  }
  Logger.log("Textes produits : " + n + " (dossier " + CONFIG.dossiers.fixtures + ")");
}

/** Aperçu sans rien écrire : analyse d'un seul message Gmail par son identifiant (debug) */
function analyserMessage(messageId) {
  var message = GmailApp.getMessageById(messageId);
  piecesDuMessage(message).forEach(function(p) {
    var ext = extensionDe(p.getName());
    var a = analyserDocument({ texte: lireTexte(p, ext), from: message.getFrom(), subject: message.getSubject(), nomPiece: p.getName(),
                               dateMail: dateIso(message.getDate()), extension: "." + ext });
    Logger.log(p.getName() + " -> " + JSON.stringify(a) + "\n  -> " + JSON.stringify(decider(a, message.getDate())));
  });
}
