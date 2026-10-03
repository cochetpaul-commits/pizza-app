// ============================================================================
// Rangement dans Drive : dossiers, écriture et déplacement des fichiers.
// Les dossiers existants ne sont jamais renommés (Pennylane et le journal les référencent).
// ============================================================================

var _dossiers = {};

function obtenirOuCreerDossier(parent, nom) {
  var cle = (parent ? parent.getId() : "racine") + "|" + nom;
  if (_dossiers[cle]) return _dossiers[cle];
  var it = parent ? parent.getFoldersByName(nom) : DriveApp.getRootFolder().getFoldersByName(nom);
  var d = it.hasNext() ? it.next() : (parent ? parent.createFolder(nom) : DriveApp.getRootFolder().createFolder(nom));
  _dossiers[cle] = d;
  return d;
}

/** Dossier « Envoi Pennylane/<Établissement> » : par identifiant Drive (créé par Paul), sinon par nom */
function dossierEnvoi(etab) {
  var cle = "envoi|" + etab;
  if (_dossiers[cle]) return _dossiers[cle];
  var d = null, id = CONFIG.envoiIds[etab];
  if (id) { try { d = DriveApp.getFolderById(id); } catch (e) { Logger.log("Dossier Envoi Pennylane/" + etab + " introuvable par identifiant (" + e + ") : repli par nom"); } }
  if (!d) d = obtenirOuCreerDossier(obtenirOuCreerDossier(obtenirOuCreerDossier(null, CONFIG.dossierRacine), CONFIG.dossiers.envoi), etab);
  _dossiers[cle] = d;
  return d;
}

/** Dossier correspondant à un chemin sous « Factures iFratelli » (créé au besoin) */
function dossierDuChemin(chemin) {
  if (chemin.length === 2 && chemin[0] === CONFIG.dossiers.envoi) return dossierEnvoi(chemin[1]);
  var d = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  for (var i = 0; i < chemin.length; i++) d = obtenirOuCreerDossier(d, chemin[i]);
  return d;
}

/** Nom libre dans le dossier : « nom (2).pdf » si le nom existe déjà (deux pièces distinctes du même mail) */
function nomLibre(dossier, nom) {
  if (!dossier.getFilesByName(nom).hasNext()) return nom;
  var m = nom.match(/^(.*)(\.[a-z0-9]+)$/i), base = m ? m[1] : nom, ext = m ? m[2] : "";
  for (var n = 2; n < 50; n++) { var essai = base + " (" + n + ")" + ext; if (!dossier.getFilesByName(essai).hasNext()) return essai; }
  return base + " (" + Date.now() + ")" + ext;
}

/**
 * Écrit une pièce dans Drive et l'ajoute à l'index. `description` (raison) est posée sur le fichier pour « À vérifier ».
 * `infosIndex.archive` est le dossier d'archive prévu après le passage par « Envoi Pennylane ». Renvoie le fichier créé.
 */
function rangerPiece(blob, nom, chemin, description, infosIndex) {
  var dossier = dossierDuChemin(chemin);
  var fichier = dossier.createFile(blob.copyBlob().setName(nomLibre(dossier, nom)));
  if (description) fichier.setDescription(description);
  indexAjouter({ fichierId: fichier.getId(), md5: infosIndex.md5, etablissement: infosIndex.etablissement, fournisseur: infosIndex.fournisseur,
                 numero: infosIndex.numero, date: infosIndex.date, montant: infosIndex.montant, nom: fichier.getName(), chemin: chemin.join("/"), archive: infosIndex.archive || "" });
  return fichier;
}

/** Déplace un fichier vers un chemin (le fichier garde son identifiant Drive) et met l'index à jour */
function deplacerFichier(fichier, chemin) {
  var dossier = dossierDuChemin(chemin);
  if (fichier.getName() !== nomLibre(dossier, fichier.getName())) fichier.setName(nomLibre(dossier, fichier.getName()));
  fichier.moveTo(dossier);
  indexDeplacer(fichier.getId(), chemin.join("/"));
  return fichier;
}

/** Fichiers d'un dossier (sans sous-dossiers) plus vieux que `jours` : [{ fichier, chemin }] */
function fichiersAnciens(dossier, chemin, jours) {
  var out = [], limite = Date.now() - jours * 86400000, fs = dossier.getFiles();
  while (fs.hasNext()) { var f = fs.next(); if (f.getDateCreated().getTime() < limite) out.push({ fichier: f, chemin: chemin }); }
  return out;
}

/** Fichiers de « Envoi Pennylane/<Établissement> » plus vieux que `jours` : [{ fichier, chemin, etablissement }] */
function fichiersEnvoiAnciens(jours) {
  var out = [];
  CONFIG.etablissements.forEach(function(etab) {
    fichiersAnciens(dossierEnvoi(etab), CONFIG.dossiers.envoi + "/" + etab, jours).forEach(function(x) { x.etablissement = etab; out.push(x); });
  });
  return out;
}

/** Fichiers de « À vérifier » (et de l'ancien « _À vérifier ») plus vieux que `jours`, sous-dossiers compris */
function fichiersAVerifierAnciens(jours) {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), out = [], limite = Date.now() - jours * 86400000;
  [CONFIG.dossiers.aVerifier, CONFIG.dossiers.ancienAVerifier].forEach(function(nom) {
    var it = racine.getFoldersByName(nom);
    if (!it.hasNext()) return;
    (function parcourir(d, chemin) {
      var fs = d.getFiles();
      while (fs.hasNext()) { var f = fs.next(); if (f.getDateCreated().getTime() < limite) out.push({ fichier: f, chemin: chemin }); }
      var sd = d.getFolders();
      while (sd.hasNext()) { var s = sd.next(); parcourir(s, chemin + "/" + s.getName()); }
    })(it.next(), nom);
  });
  return out;
}

/** Parcourt récursivement un dossier : visite(fichier, chemin) ; renvoie false pour arrêter */
function parcourirDossier(dossier, chemin, visite) {
  var fs = dossier.getFiles();
  while (fs.hasNext()) { if (visite(fs.next(), chemin) === false) return false; }
  var sd = dossier.getFolders();
  while (sd.hasNext()) { var s = sd.next(); if (parcourirDossier(s, chemin + "/" + s.getName(), visite) === false) return false; }
  return true;
}
