// ============================================================================
// Rangement dans Drive : dossiers, écriture des fichiers, index anti-doublon.
// Les dossiers existants ne sont jamais renommés ni déplacés (Pennylane les a importés).
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

/** Dossier correspondant à un chemin sous « Factures iFratelli » (créé au besoin) */
function dossierDuChemin(chemin) {
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
 * Écrit une pièce dans Drive et l'ajoute à l'index. `description` (raison) est posée sur le fichier pour « _À vérifier ».
 * Renvoie le fichier créé.
 */
function rangerPiece(blob, nom, chemin, description, infosIndex) {
  var dossier = dossierDuChemin(chemin);
  var fichier = dossier.createFile(blob.copyBlob().setName(nomLibre(dossier, nom)));
  if (description) fichier.setDescription(description);
  indexAjouter({ fichierId: fichier.getId(), md5: infosIndex.md5, etablissement: infosIndex.etablissement, fournisseur: infosIndex.fournisseur,
                 numero: infosIndex.numero, date: infosIndex.date, montant: infosIndex.montant, nom: fichier.getName(), chemin: chemin.join("/") });
  return fichier;
}

/** Fichiers de « _À vérifier » plus vieux que `jours` */
function fichiersAVerifierAnciens(jours) {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var it = racine.getFoldersByName(CONFIG.dossiers.aVerifier), out = [];
  if (!it.hasNext()) return out;
  var limite = Date.now() - jours * 86400000;
  (function parcourir(d, chemin) {
    var fs = d.getFiles();
    while (fs.hasNext()) { var f = fs.next(); if (f.getDateCreated().getTime() < limite) out.push({ fichier: f, chemin: chemin }); }
    var sd = d.getFolders();
    while (sd.hasNext()) { var s = sd.next(); parcourir(s, chemin + "/" + s.getName()); }
  })(it.next(), CONFIG.dossiers.aVerifier);
  return out;
}
