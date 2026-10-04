// ============================================================================
// Outils à lancer à la main depuis l'éditeur Apps Script :
//   indexerExistant, ocrDump, analyserMessage,
//   reorganiserArchive (simulation) / reorganiserArchiveReel, deplacerJournauxDeCloture,
//   rattrapageBasculeSimulation / rattrapageBasculeReel.
// ============================================================================

/**
 * Indexe les fichiers déjà rangés (Envoi Pennylane, Bello Mio, Piccola Mia, _Hors Pennylane, À vérifier) dans l'onglet
 * « Index » du journal : empreinte MD5 (lue dans Drive), établissement, fournisseur (nom de la liste de référence),
 * numéro, date, montant tirés du nom normalisé. À lancer AVANT le premier rattrapage. Relancer jusqu'à « TERMINÉ ».
 */
function indexerExistant() {
  var debut = Date.now(), racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), idxF = fournisseursIndex();
  indexCharger();
  var st = { vus: 0, ajoutes: 0, arret: false };
  var tetes = [CONFIG.dossiers.envoi].concat(CONFIG.etablissements, [CONFIG.dossiers.horsPennylane, CONFIG.dossiers.aVerifier, CONFIG.dossiers.ancienAVerifier]);
  for (var i = 0; i < tetes.length && !st.arret; i++) {
    var dossier = tetes[i] === CONFIG.dossiers.envoi ? null : (racine.getFoldersByName(tetes[i]).hasNext() ? racine.getFoldersByName(tetes[i]).next() : null);
    if (tetes[i] === CONFIG.dossiers.envoi) {
      CONFIG.etablissements.forEach(function(etab) { if (!st.arret) parcourirDossier(dossierEnvoi(etab), CONFIG.dossiers.envoi + "/" + etab, visiter); });
    } else if (dossier) parcourirDossier(dossier, tetes[i], visiter);
  }
  journalVider();
  Logger.log("Fichiers vus : " + st.vus + ", ajoutés à l'index : " + st.ajoutes);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");

  function visiter(f, chemin) {
    if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; return false; }
    st.vus++;
    if (indexParId(f.getId())) return true;
    if (/^(application\/vnd\.google-apps)/.test(f.getMimeType ? f.getMimeType() : "")) return true;
    var md5 = null;
    try { md5 = Drive.Files.get(f.getId(), { fields: "md5Checksum" }).md5Checksum || null; } catch (e) { Logger.log("MD5 illisible " + f.getName() + " : " + e); }
    var n = analyserNomFichier(f.getName()) || {};
    var morceaux = chemin.split("/"), etab = null, fournisseur = n.fournisseur || null;
    for (var k = 0; k < morceaux.length; k++) if (CONFIG.etablissements.indexOf(morceaux[k]) !== -1) { etab = morceaux[k]; if (!fournisseur && morceaux[k + 1] && !/^\d{2} - |^\d{4}$/.test(morceaux[k + 1])) fournisseur = morceaux[k + 1]; break; }
    if (fournisseur) fournisseur = nomCanonique(idxF, fournisseur) || fournisseur;
    indexAjouter({ fichierId: f.getId(), md5: md5, etablissement: etab, fournisseur: fournisseur, numero: n.numero || null, date: n.date || dateIso(f.getDateCreated()),
                   montant: n.montant || null, nom: f.getName(), chemin: chemin, archive: "" });
    st.ajoutes++;
    if (st.ajoutes % 100 === 0) journalVider();
    return true;
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
  var fs = dossier.getFiles(), n = 0, idx = fournisseursIndex();
  while (fs.hasNext()) {
    var f = fs.next(), nom = f.getName(), ext = extensionDe(nom);
    if (CONFIG.extensionsPieces.indexOf(ext) === -1) continue;
    var nomTxt = nom.replace(/\.[a-z0-9]+$/i, "") + ".txt";
    if (dossier.getFilesByName(nomTxt).hasNext()) continue;
    var texte = lireTexte(f.getBlob(), ext);
    dossier.createFile(nomTxt, texte || "", "text/plain");
    var a = analyserDocument({ idx: idx, texte: texte, from: "", subject: "", nomPiece: nom, dateMail: dateIso(f.getDateCreated()), extension: "." + ext });
    Logger.log(nom + " -> " + nomTxt + " | " + a.type + " | " + a.etablissement + " | " + a.fournisseur + " | " + a.numero + " | " + a.date + " | " + a.montant);
    n++;
  }
  Logger.log("Textes produits : " + n + " (dossier " + CONFIG.dossiers.fixtures + ")");
}

/** Aperçu sans rien écrire : analyse d'un seul message Gmail par son identifiant (debug) */
function analyserMessage(messageId) {
  var message = GmailApp.getMessageById(messageId), idx = fournisseursIndex();
  piecesDuMessage(message).forEach(function(p) {
    var ext = extensionDe(p.getName());
    var a = analyserDocument({ idx: idx, texte: lireTexte(p, ext), from: message.getFrom(), subject: message.getSubject(), nomPiece: p.getName(),
                               dateMail: dateIso(message.getDate()), extension: "." + ext });
    Logger.log(p.getName() + " -> " + JSON.stringify(a) + "\n  -> " + JSON.stringify(decider(a)));
  });
}

// ---------------------------------------------------------------- Réorganisation de l'archive

/**
 * reorganiserArchive() = SIMULATION : parcourt l'archive (Bello Mio, Piccola Mia, _Hors Pennylane) et écrit dans
 * l'onglet « Réorganisation » du journal, pour chaque fichier à déplacer, l'ancien et le nouveau chemin
 * <Établissement>/<Fournisseur de la liste>/<Année>. Rien n'est déplacé.
 *   - dossier fournisseur connu (nom ou variante de la liste) : nouveau dossier au nom canonique, année de la facture ;
 *   - dossier « fourre-tout » (Facture, Invoicing, Transfert Pierre, Yahoo, Wanadoo, Indy, Bellomio…) ou inconnu :
 *     le PDF est lu (OCR) et classé d'après ses identifiants et son adresse de facturation ; sinon -> « À vérifier ».
 * Relancer jusqu'à « TERMINÉ » (les fichiers déjà planifiés ne sont pas relus). Puis Paul valide, puis reorganiserArchiveReel().
 */
function reorganiserArchive() { return planifierReorganisation(); }

/**
 * Exécute le plan validé (lignes « simulation » de l'onglet « Réorganisation ») : déplacement si le chemin change,
 * renommage si la colonne « Nouveau nom » diffère du nom actuel, puis dossiers vides à la corbeille.
 */
function reorganiserArchiveReel() { return executerPlanReorganisation(true); }

/**
 * renommerArchive() = SIMULATION : parcourt l'archive actuelle (déjà réorganisée) et écrit dans l'onglet « Réorganisation »
 * les fichiers dont le nom doit changer (fournisseur canonique de la liste : « Wanadoo » -> « Self Stockage », « Indy » ->
 * « Alain Pedron Nettoyage »…). Rien n'est renommé ni déplacé. Puis Paul relit l'onglet, puis renommerArchiveReel().
 */
function renommerArchive() { return planifierReorganisation({ renommageSeul: true }); }

/** Exécute les renommages du plan (lignes « simulation » de méthode « renommage ») : ne déplace rien, ne supprime rien. */
function renommerArchiveReel() { return executerPlanReorganisation(false); }

function executerPlanReorganisation(avecDeplacements) {
  var debut = Date.now(), st = { faits: 0, deplaces: 0, renommes: 0, erreurs: 0, arret: false };
  indexCharger();
  reorgLire().forEach(function(r) {
    if (st.arret || r.statut !== "simulation") return;
    if (!avecDeplacements && r.methode !== "renommage") return;
    if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; return; }
    try {
      var f = DriveApp.getFileById(r.fichierId), bouge = false;
      if (r.nouveauNom && r.nouveauNom !== f.getName()) {
        var dossierActuel = f.getParents && f.getParents().hasNext() ? f.getParents().next() : null;
        f.setName(dossierActuel ? nomLibre(dossierActuel, r.nouveauNom) : r.nouveauNom);
        indexRenommer(f.getId(), f.getName());
        st.renommes++; bouge = true;
      }
      if (avecDeplacements && r.nouveau && r.nouveau !== r.ancien) { deplacerFichier(f, String(r.nouveau).split("/")); st.deplaces++; bouge = true; }
      reorgStatut(r.ligne, bouge ? "fait" : "fait (rien à changer)");
      st.faits++;
    } catch (e) { reorgStatut(r.ligne, "erreur : " + e); st.erreurs++; }
  });
  journalVider();
  if (avecDeplacements && !st.arret) supprimerDossiersVides();
  Logger.log("Lignes traitées : " + st.faits + " (déplacés : " + st.deplaces + ", renommés : " + st.renommes + "), erreurs : " + st.erreurs);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");
  return st;
}

/**
 * Plan de réorganisation (simulation). opts.renommageSeul : ne lit pas le contenu des PDF et ne planifie que des
 * renommages dans le dossier actuel (renommerArchive).
 */
function planifierReorganisation(opts) {
  opts = opts || {};
  var debut = Date.now(), racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), idxF = fournisseursIndex();
  var deja = {};
  reorgLire().forEach(function(r) { deja[r.fichierId] = true; });
  var st = { vus: 0, planifies: 0, renommages: 0, enPlace: 0, aVerifier: 0, ignores: 0, arret: false };
  var tetes = CONFIG.etablissements.concat([CONFIG.dossiers.horsPennylane]);
  for (var i = 0; i < tetes.length && !st.arret; i++) {
    var it = racine.getFoldersByName(tetes[i]);
    if (it.hasNext()) parcourirDossier(it.next(), tetes[i], visiter);
  }
  journalVider();
  Logger.log("[SIMULATION] fichiers vus : " + st.vus + ", déplacements planifiés : " + st.planifies + " (dont vers À vérifier : " + st.aVerifier + "), renommages seuls : " + st.renommages +
             ", déjà en place : " + st.enPlace + ", ignorés (fournisseur inactif) : " + st.ignores);
  Logger.log(st.arret ? "PAS FINI — relancer la fonction" : "TERMINÉ");
  return st;

  function visiter(f, chemin) {
    if (Date.now() - debut > CONFIG.limiteMs) { st.arret = true; return false; }
    var morceaux = chemin.split("/");
    if (morceaux.indexOf(CONFIG.dossiers.journauxCloture) !== -1) return true;   // journaux de caisse : deplacerJournauxDeCloture
    st.vus++;
    if (deja[f.getId()]) return true;
    var cible = cibleReorganisation(f, morceaux, idxF, opts);
    if (!cible) return true;
    if (cible.ignore) {
      reorgAjouter({ fichierId: f.getId(), ancien: chemin, nouveau: chemin, nom: f.getName(), methode: cible.methode, statut: "ignoré (" + cible.ignore + ")", nouveauNom: f.getName() });
      st.ignores++;
      return true;
    }
    var nouveauChemin = cible.chemin.join("/"), nouveauNom = cible.nouveauNom || f.getName();
    var deplace = nouveauChemin !== chemin && !opts.renommageSeul, renomme = nouveauNom !== f.getName();
    if (!deplace && !renomme) { st.enPlace++; return true; }
    reorgAjouter({ fichierId: f.getId(), ancien: chemin, nouveau: deplace ? nouveauChemin : chemin, nom: f.getName(), methode: deplace ? cible.methode : "renommage",
                   statut: "simulation", nouveauNom: nouveauNom });
    if (deplace) { st.planifies++; if (cible.chemin[0] === CONFIG.dossiers.aVerifier) st.aVerifier++; } else st.renommages++;
    if ((st.planifies + st.renommages) % 50 === 0) journalVider();
    return true;
  }
}

/**
 * Cible d'un fichier de l'archive : { chemin: [...], methode, nouveauNom }, { ignore, methode } pour un fournisseur
 * inactif de la liste (ses pièces restent en place), ou null s'il faut le laisser tel quel.
 * opts.renommageSeul : aucun OCR ; un dossier inconnu ou fourre-tout garde chemin et nom.
 */
function cibleReorganisation(f, morceaux, idxF, opts) {
  opts = opts || {};
  var hors = morceaux[0] === CONFIG.dossiers.horsPennylane;
  var etab = hors ? morceaux[1] : morceaux[0];
  var dossierFournisseur = hors ? morceaux[2] : morceaux[1];
  var nom = f.getName(), n = analyserNomFichier(nom) || {};
  var annee = (n.date || "").slice(0, 4) || anneeDuMois(morceaux[morceaux.length - 1]) || String(f.getDateCreated().getFullYear());
  var fourreTout = !dossierFournisseur || CONFIG.dossiersFourreTout.indexOf(dossierFournisseur) !== -1;
  var canonique = fourreTout ? null : nomCanonique(idxF, dossierFournisseur);
  if (canonique) {
    // Un relevé ou un mandat rangé dans l'archive des factures (nom « Relevé », « Mandat ») repart vers _Hors Pennylane
    var horsCible = hors || n.type === "releve" || n.type === "mandat";
    var base = horsCible ? [CONFIG.dossiers.horsPennylane, etab] : [etab];
    return { chemin: base.concat([canonique, annee]), methode: "dossier " + dossierFournisseur + (horsCible && !hors ? " (" + n.type + ")" : ""),
             nouveauNom: nomAvecFournisseur(nom, canonique) };
  }
  if (!fourreTout) {
    var entree = entreeParNom(idxF, dossierFournisseur);
    if (entree && !ligneActive(entree)) return { ignore: "fournisseur inactif", methode: "dossier " + dossierFournisseur + " (ligne « " + entree.nom + " » inactive)" };
  }
  if (opts.renommageSeul) {
    // sans lecture du document, on ne sait pas mieux nommer : on laisse tel quel
    return { chemin: morceaux, methode: "dossier " + (dossierFournisseur || "?") + " (hors liste)", nouveauNom: nom };
  }
  // Fourre-tout ou dossier absent de la liste : on lit le document
  var ext = extensionDe(nom);
  var texte = lireTexte(f.getBlob(), ext);
  var a = analyserDocument({ idx: idxF, texte: texte, from: "", subject: nom, nomPiece: nom, dateMail: n.date || dateIso(f.getDateCreated()), extension: "." + ext });
  var etabLu = a.etablissement || (CONFIG.etablissements.indexOf(etab) !== -1 ? etab : null);
  if (a.fournisseur && etabLu && (a.type === "facture" || a.type === "avoir" || a.type === "ticket")) {
    return { chemin: [etabLu, a.fournisseur, anneeDe({ date: a.date, dateSecours: n.date || dateIso(f.getDateCreated()) })], methode: "contenu (" + a.sourceFournisseur + ")",
             nouveauNom: n.fournisseur ? nomAvecFournisseur(nom, a.fournisseur) : a.nom };
  }
  if (a.fournisseur && etabLu && (a.type === "releve" || a.type === "mandat")) {
    return { chemin: [CONFIG.dossiers.horsPennylane, etabLu, a.fournisseur, anneeDe({ date: a.date, dateSecours: n.date })], methode: "contenu (" + a.type + ")",
             nouveauNom: n.fournisseur ? nomAvecFournisseur(nom, a.fournisseur) : a.nom };
  }
  return { chemin: [CONFIG.dossiers.aVerifier], methode: "contenu : " + (a.raisons.length ? a.raisons.join(", ") : "type " + a.type), nouveauNom: nom };
}

/**
 * Nom de fichier avec le fournisseur canonique, au format de extraireFactures
 * (« 2026-09-12 — Metro-gsc — Facture n° 123 — 50.00 EUR.pdf » -> « 2026-09-12 — Metro — Facture n° 123 — 50.00 EUR.pdf »).
 * Un nom qui n'est pas à ce format est gardé tel quel.
 */
function nomAvecFournisseur(nom, fournisseur) {
  var m = String(nom).match(/^(\d{4}-\d{2}-\d{2} — )(.+?)( — (?:Relevé LCR|Relevé|Facture|Mandat|Devis|Attestation)\b.*)$/i);
  if (!m || !fournisseur) return nom;
  return m[1] + fournisseur + m[3];
}

/** "10 - Octobre 2026" -> "2026" ; "2026" -> "2026" ; sinon null */
function anneeDuMois(nom) {
  var m = String(nom || "").match(/(\d{4})\s*$/);
  return m ? m[1] : null;
}

/** « Piccola Mia/Journaux de clôture » (journaux de caisse) sort de « Factures iFratelli » vers « Journaux de caisse iFratelli » à la racine du Drive */
function deplacerJournauxDeCloture() {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var itP = racine.getFoldersByName("Piccola Mia");
  if (!itP.hasNext()) { Logger.log("Dossier Piccola Mia introuvable"); return; }
  var it = itP.next().getFoldersByName(CONFIG.dossiers.journauxCloture);
  if (!it.hasNext()) { Logger.log("Aucun dossier « " + CONFIG.dossiers.journauxCloture + " » sous Piccola Mia (déjà déplacé ?)"); return; }
  var source = it.next(), dest = obtenirOuCreerDossier(null, CONFIG.dossiers.journauxCaisse);
  var cible = obtenirOuCreerDossier(dest, "Piccola Mia");
  var n = 0;
  var fs = source.getFiles();
  while (fs.hasNext()) { fs.next().moveTo(cible); n++; }
  var sd = source.getFolders();
  while (sd.hasNext()) { sd.next().moveTo(cible); n++; }
  source.setTrashed(true);
  Logger.log(n + " élément(s) déplacés vers « " + CONFIG.dossiers.journauxCaisse + "/Piccola Mia » ; ancien dossier mis à la corbeille");
}

// ---------------------------------------------------------------- Rattrapage de la bascule

/**
 * Pennylane ne lit plus l'ancien rangement depuis le 03/10/2026 au soir. Tout fichier créé dans Bello Mio/ ou Piccola Mia/
 * après cette date (par le script v3) est copié dans « Envoi Pennylane/<Établissement> », sauf s'il y est déjà
 * (même nom, ou même numéro + montant lus dans le nom). Simulation d'abord : rattrapageBasculeSimulation(), puis rattrapageBasculeReel().
 */
function rattrapageBasculeSimulation() { return rattrapageBascule(true); }
function rattrapageBasculeReel() { return rattrapageBascule(false); }

function rattrapageBascule(simulation) {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), bascule = new Date(CONFIG.dateBascule).getTime();
  var st = { vus: 0, copies: 0, deja: 0 };
  CONFIG.etablissements.forEach(function(etab) {
    var it = racine.getFoldersByName(etab);
    if (!it.hasNext()) return;
    var envoi = dossierEnvoi(etab), presents = {};
    var fs = envoi.getFiles();
    while (fs.hasNext()) { var p = fs.next(); presents[p.getName()] = true; var np = analyserNomFichier(p.getName()); if (np && np.numero && np.montant) presents[np.numero + "|" + np.montant] = true; }
    parcourirDossier(it.next(), etab, function(f, chemin) {
      if (f.getDateCreated().getTime() <= bascule) return true;
      st.vus++;
      var n = analyserNomFichier(f.getName());
      var deja = presents[f.getName()] || (n && n.numero && n.montant && presents[n.numero + "|" + n.montant]);
      if (deja) { st.deja++; return true; }
      if (!simulation) { f.makeCopy(f.getName(), envoi); presents[f.getName()] = true; }
      st.copies++;
      journalAjouter({ piece: f.getName(), etablissement: etab, fournisseur: n ? n.fournisseur : "", numero: n ? n.numero : "", montant: n ? n.montant : "",
                       destination: simulation ? "bascule (simulation)" : "bascule", chemin: CONFIG.dossiers.envoi + "/" + etab + "/" + f.getName(), raison: "créé le " + dateIso(f.getDateCreated()) + " dans " + chemin, lienFichier: f.getUrl() }, simulation);
      return true;
    });
  });
  journalVider();
  Logger.log((simulation ? "[SIMULATION] " : "") + "fichiers créés après la bascule : " + st.vus + ", à copier dans Envoi Pennylane : " + st.copies + ", déjà présents : " + st.deja);
  return st;
}
