// ============================================================================
// Traitement : passe horaire (extraireFactures), rattrapage (simulation puis réel),
// archivage des envois Pennylane, alerte hebdomadaire, contrôle quotidien, déclencheurs.
//
// Pour chaque pièce jointe d'un message :
//   texte (OCR) -> analyserDocument -> decider -> anti-doublon -> rangement -> journal
// Un message n'est traité qu'une fois (onglet « Messages traités »), quel que soit le fil.
// Une facture sûre est créée à plat dans « Envoi Pennylane/<Établissement> » ; après 3 jours dans Envoi,
// archiverEnvoisPennylane la déplace dans <Établissement>/<Fournisseur>/<Année> (même identifiant Drive).
//
// Sûreté (v4.6) : un verrou (LockService) par point d'entrée ; Index, Journal et Messages traités sont écrits
// après CHAQUE message ; la limite de temps est vérifiée avant chaque pièce. Si Apps Script coupe l'exécution,
// les pièces déjà rangées sont dans l'Index : la passe suivante les voit en doublon, jamais en double.
// ============================================================================

var DATE_RATTRAPAGE = "2026-07-01";

/**
 * Exécute `fn` sous le verrou du script : deux exécutions simultanées (déclencheur horaire + lancement à la main)
 * ne s'écrasent plus leurs lignes. Si le verrou n'est pas obtenu en 30 s, on abandonne proprement (relancé à l'heure suivante).
 */
function avecVerrou(nom, fn) {
  var verrou = null;
  try { verrou = LockService.getScriptLock(); } catch (e) { Logger.log("LockService indisponible (" + e + ") : exécution sans verrou"); }
  if (verrou && !verrou.tryLock(30000)) { Logger.log("ABANDON " + nom + " : une autre exécution est en cours"); return null; }
  try { return fn(); } finally { if (verrou) { try { verrou.releaseLock(); } catch (e2) {} } }
}

/**
 * Passe horaire. Point de départ : la dernière passe TERMINÉE (curseur) moins 24 h de marge, sinon les 72 dernières heures.
 * Après plus de 3 jours d'arrêt, rien n'est perdu : le curseur recule jusqu'à la dernière passe réussie.
 */
function extraireFactures() {
  return avecVerrou("extraireFactures", function() {
    var depart = new Date(), curseur = curseurPasseLire();
    var depuis = new Date(depart.getTime() - CONFIG.fenetreHeures * 3600000);
    if (curseur) { var cMarge = new Date(curseur.getTime() - CONFIG.curseurMargeHeures * 3600000); if (cMarge < depuis) depuis = cMarge; }
    var stats = traiterMessages({ depuis: depuis, simulation: false, cleReprise: "passe" });
    if (stats && stats.termine) curseurPasseEcrire(depart);
    return stats;
  });
}

/** Rattrapage en SIMULATION : rien n'est écrit dans Drive, le rapport va dans l'onglet « Simulation » du journal */
function rattrapage(dateDebut) {
  return avecVerrou("rattrapage", function() {
    return traiterMessages({ depuis: lireDateArgument(dateDebut), simulation: true, cleReprise: "rattrapage-simulation", transit: true, rattrapage: true });
  });
}

/**
 * Rattrapage RÉEL, à lancer seulement après validation du rapport de simulation par Paul.
 * Il n'écrit JAMAIS dans « Envoi Pennylane » : les factures sûres vont dans « Rattrapage à valider/<Établissement> »,
 * que Pennylane ne surveille pas. Claude (Cowork) compare chaque fichier à Pennylane (numéro, montant, date) et ne déplace
 * vers « Envoi Pennylane » que les absents ; l'archivage automatique suit ensuite grâce à l'index.
 */
function rattrapageReel(dateDebut) {
  return avecVerrou("rattrapageReel", function() {
    return traiterMessages({ depuis: lireDateArgument(dateDebut), simulation: false, cleReprise: "rattrapage-reel", transit: true, rattrapage: true });
  });
}

// L'éditeur Apps Script ne passe pas d'argument : raccourcis depuis le 01/07/2026
function rattrapageDepuisJuillet() { return rattrapage(DATE_RATTRAPAGE); }
function rattrapageReelDepuisJuillet() { return rattrapageReel(DATE_RATTRAPAGE); }

function lireDateArgument(d) {
  if (d instanceof Date) return d;
  var m = String(d || DATE_RATTRAPAGE).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/**
 * Cœur du traitement. opts : { depuis: Date, simulation: bool, cleReprise: string, transit, rattrapage }
 * S'arrête avant la limite de 6 min et mémorise où reprendre (PropertiesService) ; relancer jusqu'à « TERMINÉ ».
 */
function traiterMessages(opts) {
  var debut = Date.now();
  var props = PropertiesService.getScriptProperties();
  var cle = "reprise." + opts.cleReprise + "." + Utilities.formatDate(opts.depuis, "Europe/Paris", "yyyyMMdd");
  var position = Number(props.getProperty(cle) || 0);
  if (opts.simulation && position === 0) journalViderSimulation();
  var traites = journalMessagesTraites();
  // En simulation on travaille sur une copie de l'index : les pièces « rangées » virtuellement ne doivent pas rester en mémoire
  var index = opts.simulation ? Object.assign({}, indexCharger()) : indexCharger();
  var idxFournisseurs = fournisseursIndex();
  var stats = { messages: 0, deja: 0, ignores: 0, pieces: 0, ecartees: 0, envoi: 0, transit: 0, hors_pennylane: 0, a_verifier: 0, journal: 0, doublons: 0, corps: 0, inconnus: 0, quota: 0, termine: false };

  var st = parcourirMessages(requeteGmail(opts.depuis), function(message, fil) {
    if (Date.now() - debut > CONFIG.limiteMs) return false;
    if (message.getDate() < opts.depuis) return true;
    var id = message.getId();
    if (!opts.simulation && traites[id]) { stats.deja++; return true; }
    if (!messageRecevable(message)) { stats.ignores++; return true; }
    stats.messages++;
    try {
      var fini = traiterMessage(message, fil, opts, index, idxFournisseurs, stats, debut);
      if (!fini) {
        // limite de temps atteinte au milieu des pièces : ce qui est rangé est dans l'Index (doublon à la reprise), le message n'est pas marqué traité
        stats.messages--;
        journalVider();
        return false;
      }
      if (!opts.simulation) journalMarquerTraite(id, "reel");
    } catch (e) {
      if (e && e.name === "ErreurOcrQuota") {
        // Quota OCR : le message n'est pas marqué traité, la passe s'arrête ici et reprendra au prochain lancement
        stats.quota++;
        Logger.log("QUOTA OCR : " + e.message + " — message " + id + " (" + message.getSubject() + ") sera repris");
        journalVider();
        return false;
      }
      Logger.log("ERREUR message " + id + " (" + message.getSubject() + ") : " + e);
      journalAjouter({ dateMail: dateIso(message.getDate()), expediteur: message.getFrom(), objet: message.getSubject(), destination: "erreur", raison: String(e),
                       lienMail: lienMail(message), messageId: id }, opts.simulation);
    }
    // Index, Journal et Messages traités écrits après chaque message (réel) ; par lots de 20 en simulation
    if (!opts.simulation || stats.messages % 20 === 0) journalVider();
    return true;
  }, position);

  journalVider();
  fournisseursVider();
  var resume = (opts.simulation ? "[SIMULATION] " : "") + "messages examinés : " + stats.messages + " (déjà traités : " + stats.deja + ", ignorés : " + stats.ignores + ") — pièces : " + stats.pieces
    + " (écartées : " + stats.ecartees + ") — vers Pennylane : " + stats.envoi + (opts.transit ? ", en transit (Rattrapage à valider) : " + stats.transit : "") + ", hors Pennylane : " + stats.hors_pennylane + ", à vérifier : " + stats.a_verifier + " (dont fournisseurs inconnus : " + stats.inconnus + "), journal seul : " + stats.journal
    + ", doublons : " + stats.doublons + ", factures dans le corps du mail : " + stats.corps;
  if (st.arret) { props.setProperty(cle, String(st.position)); Logger.log(resume); Logger.log((stats.quota ? "ARRÊT SUR QUOTA OCR — " : "PAS FINI — ") + "relancer la même fonction (reprise au fil n° " + st.position + ")"); }
  else { props.deleteProperty(cle); stats.termine = true; Logger.log(resume); Logger.log("TERMINÉ"); }
  return stats;
}

function lienMail(message) { return "https://mail.google.com/mail/u/0/#all/" + message.getId(); }

/**
 * Traite un message : chaque pièce jointe, ou le corps du mail s'il ressemble à une facture sans pièce jointe.
 * Renvoie false si la limite de temps est atteinte avant une pièce (le message sera repris).
 */
function traiterMessage(message, fil, opts, index, idxFournisseurs, stats, debut) {
  var tri = trierPieces(message), pieces = tri.gardees;
  var base = { dateMail: dateIso(message.getDate()), expediteur: message.getFrom(), recuSur: adresseReception(message), objet: message.getSubject(),
               lienMail: lienMail(message), messageId: message.getId() };
  // Pièces écartées (zip, p7m, sans extension ni type connu…) : une trace dans le journal, jamais silencieusement
  tri.ecartees.forEach(function(x) {
    stats.ecartees++;
    journalAjouter(Object.assign({}, base, { piece: x.nom, type: "?", destination: "ignoree", raison: x.raison }), opts.simulation);
  });
  if (!pieces.length) {
    if (corpsRessembleAUneFacture(message)) {
      stats.corps++;
      journalAjouter(Object.assign({}, base, { piece: "(corps du mail)", type: "facture ?", destination: "corps_mail",
        raison: "facture dans le corps du mail, sans pièce jointe : à télécharger à la main" }), opts.simulation);
    }
    return true;
  }
  // Factur-X : un PDF et son XML dans le même mail -> le PDF est rangé, l'XML est seulement journalisé
  var aUnPdf = pieces.some(function(p) { return extensionDe(p.getName()) === "pdf"; });
  for (var i = 0; i < pieces.length; i++) {
    if (debut && Date.now() - debut > CONFIG.limiteMs) return false;
    var p = pieces[i], ext = extensionDe(p.getName());
    stats.pieces++;
    if (ext === "xml" && aUnPdf) {
      stats.journal++;
      journalAjouter(Object.assign({}, base, { piece: p.getName(), type: "facturx", destination: "journal", raison: "Factur-X : XML joint au PDF, seul le PDF est rangé" }), opts.simulation);
      continue;
    }
    var md5 = md5Blob(p);
    if (opts.rattrapage && ext !== "xml") Utilities.sleep(CONFIG.ocrPauseRattrapageMs);   // ménage le quota OCR de Drive
    var texte = lireTexte(p, ext);
    var a = analyserDocument({ idx: idxFournisseurs, texte: texte, from: message.getFrom(), subject: message.getSubject(), nomPiece: p.getName(), dateMail: base.dateMail,
                               extension: "." + (ext === "jpeg" ? "jpg" : ext), recuSur: base.recuSur });
    if (!a.texteLu && derniereErreurOcr()) a.raisons = a.raisons.map(function(r) { return r === "texte illisible (OCR)" ? "texte illisible (OCR : " + derniereErreurOcr() + ")" : r; });
    var d = decider(a);
    // Rattrapage : jamais directement dans Envoi Pennylane, mais dans le dossier de transit « Rattrapage à valider »
    if (opts.transit && d.destination === "envoi") { d.destination = "transit"; d.chemin = [CONFIG.dossiers.transit, a.etablissement]; }
    var ligne = Object.assign({}, base, { piece: p.getName(), type: a.type, etablissement: a.etablissement ? a.etablissement + (a.sourceEtablissement === "liste" ? " (liste)" : a.sourceEtablissement === "réception" ? " (réception)" : "") : "",
      fournisseur: a.fournisseur || (a.fournisseurPropose ? a.fournisseurPropose + " ?" : ""),
      numero: a.numero, dateFacture: a.date, montant: a.montant, destination: d.destination, chemin: d.chemin.join("/"), raison: d.raison });
    if (a.sourceFournisseur === "inconnu" && a.type !== "autre") {
      // (une plateforme de facturation — source « plateforme » — ne donne jamais lieu à une ligne « à compléter »)
      stats.inconnus++;
      fournisseursProposer({ from: message.getFrom(), subject: message.getSubject(), texte: texte });
    } else if (a.sourceFournisseur === "plateforme") stats.inconnus++;
    var doublon = trouverDoublon(index, a, md5);
    if (doublon) {
      stats.doublons++;
      ligne.destination = "doublon";
      ligne.raison = "déjà rangé : " + (doublon.chemin ? doublon.chemin + "/" : "") + doublon.nom;
      ligne.lienFichier = doublon.fichierId ? "https://drive.google.com/file/d/" + doublon.fichierId + "/view" : "";
    } else if (d.destination === "journal") {
      stats.journal++;
    } else {
      stats[d.destination]++;
      var infos = { md5: md5, etablissement: a.etablissement, fournisseur: a.fournisseur, numero: a.numero, date: a.date || a.dateSecours, montant: a.montant, nom: a.nom, fichierId: "",
                    archive: d.archive.join("/"), type: a.type };
      if (opts.simulation) {
        indexInserer(index, infos);   // pour repérer les doublons à l'intérieur même de la simulation
        ligne.chemin = d.chemin.join("/") + "/" + a.nom + (d.archive.length && d.destination !== "hors_pennylane" ? "  -> archive " + d.archive.join("/") : "");
      } else {
        var description = d.destination === "a_verifier" ? "À vérifier : " + d.raison + " — mail : " + base.lienMail : "";
        var fichier = rangerPiece(p, a.nom, d.chemin, description, infos);
        ligne.lienFichier = fichier.getUrl();
        ligne.chemin = d.chemin.join("/") + "/" + fichier.getName();
      }
    }
    journalAjouter(ligne, opts.simulation);
  }
  if (!opts.simulation) { try { fil.addLabel(etiquetteTraite()); } catch (e) { Logger.log("Libellé non posé : " + e); } }
  return true;
}

/**
 * Déplace vers l'archive <Établissement>/<Fournisseur>/<Année> les fichiers présents depuis plus de 3 jours dans « Envoi Pennylane »
 * (Pennylane les a importés ; le fichier garde son identifiant Drive). L'âge se compte depuis l'arrivée dans Envoi (Index), un fichier
 * déplacé à la main y reste donc 3 jours pleins. Le dossier d'archive vient de l'index, sinon du nom du fichier. Un fichier qui ne
 * peut pas être archivé est laissé en place et signalé (journal, mail hebdomadaire) ; une erreur sur un fichier n'arrête pas les autres.
 */
function archiverEnvoisPennylane() {
  return avecVerrou("archiverEnvoisPennylane", function() {
    var idxF = fournisseursIndex(), st = { archives: 0, bloques: 0, erreurs: 0 };
    fichiersEnvoiAnciens(CONFIG.archiveApresJours).forEach(function(x) {
      var f = x.fichier;
      try {
        var e = indexParId(f.getId()), chemin = null, raison = "";
        if (e && e.archive) chemin = e.archive.split("/");
        else {
          var n = analyserNomFichier(f.getName());
          var fournisseur = n && n.fournisseur ? nomCanonique(idxF, n.fournisseur) : null;
          if (n && fournisseur) chemin = [x.etablissement, fournisseur, n.date.slice(0, 4)];
          else raison = n ? "fournisseur « " + n.fournisseur + " » absent de la liste de référence" : "nom de fichier non reconnu";
        }
        if (chemin) {
          deplacerFichier(f, chemin);
          st.archives++;
          journalAjouter({ piece: f.getName(), destination: "archive", chemin: chemin.join("/") + "/" + f.getName(), lienFichier: f.getUrl(), raison: "déplacé depuis " + x.chemin }, false);
        } else {
          st.bloques++;
          journalAjouter({ piece: f.getName(), destination: "envoi_bloque", chemin: x.chemin + "/" + f.getName(), lienFichier: f.getUrl(), raison: raison }, false);
        }
      } catch (err) {
        st.erreurs++;
        Logger.log("Archivage impossible " + f.getName() + " : " + err);
        journalAjouter({ piece: f.getName(), destination: "erreur", chemin: x.chemin + "/" + f.getName(), lienFichier: f.getUrl(), raison: "archivage : " + err }, false);
      }
    });
    journalVider();
    Logger.log("Archivés : " + st.archives + ", restés dans Envoi Pennylane faute de dossier d'archive : " + st.bloques + ", erreurs : " + st.erreurs);
    return st;
  });
}

/**
 * Alerte hebdomadaire (lundi 8 h) : fichiers de « À vérifier » de plus de 3 jours et fichiers restés plus de 7 jours
 * dans « Envoi Pennylane » -> mail récapitulatif à Paul. Rien à signaler : pas de mail.
 */
function alerteHebdo() {
  var aVerifier = fichiersAVerifierAnciens(CONFIG.alerteAgeJours);
  var envois = fichiersEnvoiAnciens(CONFIG.envoiAlerteJours);
  var corps7j = journalLignesRecentes(7).filter(function(l) { return l.destination === "corps_mail"; });
  if (!aVerifier.length && !envois.length && !corps7j.length) { Logger.log("Rien à signaler"); return 0; }
  var decrire = function(x) {
    return "- " + x.chemin + "/" + x.fichier.getName() + " (" + Utilities.formatDate(x.fichier.getDateCreated(), "Europe/Paris", "dd/MM") + ")\n  "
      + (x.fichier.getDescription() || "") + "\n  " + x.fichier.getUrl();
  };
  var corps = "Bonjour Paul,\n\n";
  if (aVerifier.length) {
    corps += aVerifier.length + " document(s) attendent dans « Factures iFratelli/" + CONFIG.dossiers.aVerifier + " » depuis plus de " + CONFIG.alerteAgeJours + " jours :\n\n" + aVerifier.map(decrire).join("\n\n")
      + "\n\nPour chacun : s'il s'agit d'une vraie facture, la déplacer dans « Envoi Pennylane/<Établissement> » (elle sera archivée automatiquement), sinon la laisser ou la mettre à la corbeille. "
      + "Si le fournisseur manque, compléter sa ligne dans « " + CONFIG.fournisseursNom + " ».\n\n";
  }
  if (envois.length) {
    corps += envois.length + " fichier(s) sont restés plus de " + CONFIG.envoiAlerteJours + " jours dans « Envoi Pennylane » sans pouvoir être archivés :\n\n" + envois.map(decrire).join("\n\n") + "\n\n";
    envois.forEach(function(x) { journalAjouter({ piece: x.fichier.getName(), destination: "envoi_bloque", chemin: x.chemin + "/" + x.fichier.getName(), lienFichier: x.fichier.getUrl(), raison: "plus de " + CONFIG.envoiAlerteJours + " jours dans Envoi Pennylane" }, false); });
  }
  journalVider();
  if (corps7j.length) {
    corps += "Factures reçues dans le corps d'un mail, sans pièce jointe, ces 7 derniers jours (" + corps7j.length + ") — à télécharger depuis l'espace client si besoin :\n\n"
      + corps7j.map(function(l) { return "- " + l.dateMail + " " + l.expediteur + " : " + l.objet + "\n  " + l.lienMail; }).join("\n") + "\n\n";
  }
  MailApp.sendEmail({ to: CONFIG.alerteDestinataire, subject: "Factures : " + (aVerifier.length + envois.length) + " document(s) à regarder" + (corps7j.length ? ", " + corps7j.length + " mail(s) sans pièce jointe" : ""), body: corps });
  Logger.log("Alerte envoyée : " + aVerifier.length + " à vérifier, " + envois.length + " bloqués dans Envoi Pennylane, " + corps7j.length + " factures dans le corps d'un mail");
  return aVerifier.length + envois.length;
}

/** Ancien nom, conservé pour le déclencheur existant */
function alerteAVerifier() { return alerteHebdo(); }

/**
 * Contrôle quotidien (7 h) : si la dernière passe horaire TERMINÉE date de plus de 24 h (déclencheur cassé, quota, autorisation
 * expirée…), un mail part à Paul. Renvoie l'âge du curseur en heures (ou null sans curseur).
 */
function controlerPasses() {
  var curseur = curseurPasseLire();
  var heures = curseur ? (Date.now() - curseur.getTime()) / 3600000 : null;
  if (curseur && heures <= CONFIG.passeAlerteHeures) { Logger.log("Dernière passe terminée il y a " + Math.round(heures) + " h : rien à signaler"); return heures; }
  var corps = "Bonjour Paul,\n\n" + (curseur ? "la dernière passe horaire terminée (extraireFactures) date de " + Utilities.formatDate(curseur, "Europe/Paris", "dd/MM/yyyy HH:mm") + ", soit plus de " + CONFIG.passeAlerteHeures + " heures."
    : "aucune passe horaire (extraireFactures) n'a encore été terminée.")
    + "\n\nÀ regarder dans l'éditeur Apps Script : « Exécutions » (erreurs, quota OCR, autorisations), puis relancer extraireFactures à la main.\n";
  MailApp.sendEmail({ to: CONFIG.alerteDestinataire, subject: "Factures : la passe horaire ne tourne plus", body: corps });
  Logger.log("Alerte envoyée : passe horaire en retard");
  return heures;
}

/** Déclencheurs : extraireFactures toutes les heures, archiverEnvoisPennylane chaque nuit, controlerPasses chaque matin, alerteHebdo le lundi. À lancer une fois après `clasp push`. */
function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (["extraireFactures", "alerteAVerifier", "alerteHebdo", "archiverEnvoisPennylane", "controlerPasses"].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("extraireFactures").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("archiverEnvoisPennylane").timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger("controlerPasses").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("alerteHebdo").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  Logger.log("Déclencheurs installés : extraireFactures (toutes les heures), archiverEnvoisPennylane (chaque nuit à 5 h), controlerPasses (chaque matin à 7 h), alerteHebdo (lundi 8 h)");
}

/** Oublie la position de reprise d'un rattrapage (pour recommencer une simulation de zéro) */
function reinitialiserReprises() {
  var props = PropertiesService.getScriptProperties();
  props.getKeys().forEach(function(k) { if (k.indexOf("reprise.") === 0) props.deleteProperty(k); });
  Logger.log("Positions de reprise effacées");
}
