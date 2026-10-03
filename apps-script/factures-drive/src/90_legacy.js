// ============================================================================
// Anciennes fonctions de maintenance (à lancer à la main). Conservées depuis la v3 ;
// les fonctions ponctuelles à identifiants codés en dur (corbeille du 18/09, reclassement
// manuel, Maël mars 2026) ont été retirées. Rien ici ne supprime de fichier.
// ============================================================================

/** Nom au format historique à partir d'un texte OCR (ancienne signature construireNom(texte, fournisseur, dateSecours, extension)) */
function nommerDepuisTexte(texte, fournisseur, dateSecours, extension) {
  var montant = texte ? trouverMontantTTC(texte) : null;
  var type = texte ? detecterTypeDocument(texte, montant) : "facture";
  return construireNom({ type: type, date: texte ? trouverDateFacture(texte) : null, dateSecours: dateSecours, fournisseur: fournisseur,
                         numero: texte ? trouverNumeroFacture(texte) : null, montant: montant }, extension);
}

function setFolderColors() {
  var RED = "#ac725e", ORANGE = "#d06b64", GREEN = "#16a765", TEAL = "#7bd148", BLUE = "#4986e7", PURPLE = "#9a9cff";
  var parentId = "1XZvEPR8mAo_BtftJ5qsoi-5dZ4Hr1s1o";
  var folders = DriveApp.getFolderById(parentId).getFolders();
  var colorMap = {
    "Carniato": RED, "Distrimalo": RED, "Buffet Plus": RED, "Flamigni": RED,
    "La Via del Te": RED, "Labovida": RED, "Lucangeli": RED, "Vinoegusto": RED,
    "Masse": RED, "Metro": RED, "Mael Distribution": RED, "Thermifroid": RED,
    "Armor Emballages": ORANGE, "Mon Emballage": ORANGE, "Papiers Service": ORANGE,
    "Cheville 35": TEAL, "Combohr": TEAL, "Hyg Up": TEAL, "Verisure": TEAL,
    "Gastrotiger": TEAL, "Deuba24": TEAL, "SUM Online": TEAL, "EDF": TEAL,
    "Pennylane": BLUE, "Groupe GCA": BLUE, "Inforegistre": BLUE, "Bimpli": BLUE,
    "Restoflash": BLUE, "PST35": BLUE, "SC M2": BLUE, "RME": BLUE,
    "Storycie": BLUE, "APR35": BLUE, "AME Hasle": BLUE,
    "Bellomio": GREEN, "Piccola Mia": GREEN, "Agence": GREEN, "Transfert Pierre": GREEN,
    "Autres": PURPLE, "Pack Prélèvements": PURPLE
  };
  var count = 0;
  while (folders.hasNext()) {
    var f = folders.next(), c = colorMap[f.getName()];
    if (c) { Drive.Files.update({ folderColorRgb: c }, f.getId()); count++; Logger.log(c + " -> " + f.getName()); }
  }
  Logger.log("Done: " + count + " folders updated");
}

// Renomme les fichiers encore au format "Fournisseur_JJMMAAAA.pdf". Relancer jusqu'à "TERMINÉ".
function renommerFacturesExistantes() {
  var debut = Date.now();
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var stats = { renommes: 0, sansMontant: 0, arret: false };
  (function parcourir(dossier) {
    var fichiers = dossier.getFiles();
    while (fichiers.hasNext()) {
      if (Date.now() - debut > CONFIG.limiteMs) { stats.arret = true; return; }
      var f = fichiers.next();
      var m = f.getName().match(/^(.+)_(\d{2})(\d{2})(\d{4})\.(pdf|xml)$/i);
      if (!m) continue;
      var extension = "." + m[5].toLowerCase();
      var nom = nommerDepuisTexte(extension === ".pdf" ? lireTextePdf(f.getBlob()) : null, m[1], m[4] + "-" + m[3] + "-" + m[2], extension);
      f.setName(nom);
      stats.renommes++;
      if (nom.indexOf(" EUR") === -1) stats.sansMontant++;
      Logger.log(m[0] + "  ->  " + nom);
    }
    var sous = dossier.getFolders();
    while (sous.hasNext() && !stats.arret) parcourir(sous.next());
  })(racine);
  Logger.log("Renommés : " + stats.renommes + " (dont " + stats.sansMontant + " sans montant trouvé)");
  Logger.log(stats.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");
}

// Relit les fichiers incomplets ou suspects (pas de numéro, pas de montant, montant >= 10 000 EUR) avec les règles actuelles.
function reverifierFactures() {
  var debut = Date.now();
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var st = { revus: 0, modifies: 0, arret: false };
  (function parcourir(dossier) {
    var fichiers = dossier.getFiles();
    while (fichiers.hasNext()) {
      if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; return; }
      var f = fichiers.next(), nom = f.getName();
      var m = nom.match(/^(\d{4}-\d{2}-\d{2}) — (.+?) — (?:Facture|Relevé)(?: n° [^—]+?)?(?: — (-?[\d.]+) EUR)?\.pdf$/);
      if (!m || f.getDescription() === "nommage-v4") continue;
      var suspect = nom.indexOf(" n° ") === -1 || !m[3] || Math.abs(parseFloat(m[3])) >= 10000;
      if (!suspect) continue;
      var nouveau = nommerDepuisTexte(lireTextePdf(f.getBlob()), m[2], m[1], ".pdf");
      f.setDescription("nommage-v4");
      st.revus++;
      if (nouveau !== nom) { f.setName(nouveau); st.modifies++; Logger.log(nom + "  ->  " + nouveau); }
    }
    var sous = dossier.getFolders();
    while (sous.hasNext() && !st.arret) parcourir(sous.next());
  })(racine);
  Logger.log("Relus : " + st.revus + ", modifiés : " + st.modifies);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");
}

// Liste (sans rien toucher) les documents sans numéro ni montant : candidats non-factures.
function listerNonFactures() {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), n = 0;
  (function parcourir(d, chemin) {
    var fs = d.getFiles();
    while (fs.hasNext()) {
      var f = fs.next(), nom = f.getName();
      if (/ — (Facture|Relevé)\.pdf$/.test(nom)) { n++; Logger.log(chemin + " | " + nom + " | " + Math.round(f.getSize() / 1024) + " Ko | " + f.getId()); }
    }
    var sd = d.getFolders();
    while (sd.hasNext()) { var s = sd.next(); parcourir(s, chemin + "/" + s.getName()); }
  })(racine, "");
  Logger.log("Candidats : " + n);
}

// Met à la corbeille les dossiers vides (récupérables 30 jours).
function supprimerDossiersVides() {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), n = 0;
  (function vider(d) {
    var sd = d.getFolders(), enfants = [];
    while (sd.hasNext()) enfants.push(sd.next());
    enfants.forEach(vider);
    if (d.getId() !== racine.getId() && !d.getFiles().hasNext() && !d.getFolders().hasNext()) { d.setTrashed(true); n++; Logger.log("Dossier vide mis à la corbeille : " + d.getName()); }
  })(racine);
  Logger.log("Dossiers vides mis à la corbeille : " + n);
}
