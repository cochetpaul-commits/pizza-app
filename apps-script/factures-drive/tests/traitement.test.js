"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { creerEnvironnement } = require("./bouchons");

const plain = (x) => JSON.parse(JSON.stringify(x));
const DEPUIS = new Date("2026-08-01T00:00:00");

function boite() {
  const env = creerEnvironnement();
  const fx = env.fixture;
  // Maël : même facture Piccola envoyée dans deux messages (contact@ puis facture@piccolamia), fils différents
  env.fil([{ date: "2026-10-02T09:00:00", from: "comptabilite@maeldistribution.fr", to: "contact@bellomio.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: fx("mael_facture_piccola") }] }]);
  env.fil([{ date: "2026-10-02T09:01:00", from: "comptabilite@maeldistribution.fr", to: "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: fx("mael_facture_piccola") }] }]);
  // Même fil Gmail : avoir Maël Bello puis, plus tard, une facture Piccola dans la réponse
  env.fil([
    { date: "2026-10-02T10:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@bellomio.fr", subject: "Facture FC0126", pieces: [{ nom: "FC0126.pdf", contenu: fx("mael_avoir_bello") }] },
    { date: "2026-10-02T15:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@bellomio.fr", subject: "Re: Facture FC0126", pieces: [{ nom: "FC0140.pdf", contenu: fx("mael_facture_piccola") }] }
  ]);
  // Relevé Carniato Piccola reçu sur l'adresse Bello
  env.fil([{ date: "2026-10-01T08:00:00", from: "noreply@carniato.com", to: "facture@bellomio.fr", subject: "Relevé", pieces: [{ nom: "14054661.pdf", contenu: fx("carniato_releve_piccola") }] }]);
  // Cheville 35 via VIF sur contact@
  env.fil([{ date: "2026-09-01T08:53:00", from: "noreply@vif.fr", to: "cochetpaulbellomio@gmail.com, contact@bellomio.fr", subject: "Facture CHEVILLE 35", pieces: [{ nom: "CHEVI35 Chev35 00113789.pdf", contenu: fx("cheville35_facture_bello") }] }]);
  // Tom Martin : tarifs en PDF, même domaine que les factures
  env.fil([{ date: "2026-09-28T13:32:00", from: "tom.martin@maison-hardy.fr", to: "contact@bellomio.fr", subject: "Maison Hardy : Tarif 40 et promotions", pieces: [{ nom: "Tarif S40.pdf", contenu: "MAISON HARDY Tarif semaine 40 et promotions en cours. Côte de boeuf 18,90 €/kg. Veau 25,50 €/kg." }] }]);
  // Transfert de Paul vers facture@ : ticket Leroy Merlin
  env.fil([{ date: "2026-10-02T18:30:00", from: "Paul Cochet <cochetpaul@bellomio.fr>", to: "facture@bellomio.fr", subject: "Fwd: Votre ticket Leroy Merlin", pieces: [{ nom: "ticket.pdf", contenu: fx("leroymerlin_ticket_bello") }] }]);
  // Mail interne qui n'est pas un transfert vers facture@ : ignoré
  env.fil([{ date: "2026-10-02T19:00:00", from: "contact@bellomio.fr", to: "client@gmail.com", subject: "Votre facture", pieces: [{ nom: "facture-client.pdf", contenu: fx("hygup_facture_bello") }] }]);
  // OCR raté (pièce vide) d'un fournisseur connu
  env.fil([{ date: "2026-10-01T11:00:00", from: "compta@hygup.fr", to: "facture@bellomio.fr", subject: "Facture 127999", pieces: [{ nom: "scan.pdf", contenu: "" }] }]);
  // Devis : journal seul
  env.fil([{ date: "2026-09-22T11:00:00", from: "contact@thermifroid.fr", to: "contact@piccolamia.fr", subject: "Devis", pieces: [{ nom: "devis.pdf", contenu: fx("devis_piccola") }] }]);
  // Facture dans le corps du mail, sans pièce jointe
  env.fil([{ date: "2026-10-01T06:00:00", from: "billing@zenchef.com", to: "contact@bellomio.fr", subject: "Votre facture Zenchef", corps: "Bonjour, votre facture d'octobre d'un montant de 89,00 € a été prélevée." }]);
  // Photo de facture (image) : passe par l'OCR comme un PDF
  env.fil([{ date: "2026-10-02T12:00:00", from: "pierre.cochet@gmail.com", to: "facture@bellomio.fr", subject: "Fwd: TerreAzur", pieces: [{ nom: "IMG_2041.jpg", contenu: fx("terreazur_facture_bello").padEnd(25000, " "), type: "image/jpeg" }] }]);
  // Fournisseur absent de la liste de référence : ticket sans identifiant, domaine inconnu
  env.fil([{ date: "2026-10-02T20:00:00", from: "noreply@castorama.fr", to: "facture@bellomio.fr", subject: "Votre ticket", pieces: [{ nom: "ticket-casto.pdf", contenu: fx("leroymerlin_ticket_bello").replace(/LEROY MERLIN/g, "CASTORAMA").replace(/leroymerlin\.fr/g, "castorama.fr") }] }]);
  return env;
}

describe("passe réelle sur une boîte mêlant les cas du brief", () => {
  const env = boite();
  const stats = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "test" });
  const arbre = env.arbre();

  test("les vraies factures vont à plat dans Envoi Pennylane/<Établissement>, une seule fois, au nom de la liste", () => {
    assert.ok(arbre.includes("/Envoi Pennylane/Piccola Mia/2026-10-02 — Maël Distribution — Facture n° FC0140 — 906.39 EUR.pdf"), arbre.join("\n"));
    assert.equal(arbre.filter((x) => x.includes("FC0140")).length, 1, "FC0140 rangée une seule fois (3 messages, 2 fils)");
    assert.ok(arbre.includes("/Envoi Pennylane/Bello Mio/2026-10-02 — Maël Distribution — Facture n° FC0126 — -4.92 EUR.pdf"));
    assert.ok(arbre.includes("/Envoi Pennylane/Bello Mio/2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf"));
    assert.ok(arbre.includes("/Envoi Pennylane/Bello Mio/2026-10-02 — Leroy Merlin — Facture — 38.79 EUR.pdf"));
    assert.ok(arbre.includes("/Envoi Pennylane/Bello Mio/2026-10-02 — TerreAzur — Facture n° 8801805886 — 139.25 EUR.jpg"), "photo de facture");
    assert.equal(arbre.filter((x) => x.startsWith("/Bello Mio/") || x.startsWith("/Piccola Mia/")).length, 0, "rien dans l'archive avant 3 jours");
  });
  test("le relevé Piccola reçu sur l'adresse Bello va dans _Hors Pennylane / Piccola Mia / Carniato / 2026", () => {
    assert.ok(arbre.includes("/_Hors Pennylane/Piccola Mia/Carniato/2026/2026-10-01 — Carniato — Relevé n° 14054661 — 138.80 EUR.pdf"), arbre.join("\n"));
  });
  test("OCR raté et fournisseur inconnu vont dans À vérifier, jamais vers Pennylane ; les tarifs Maison Hardy restent au journal", () => {
    const aVerifier = arbre.filter((x) => x.startsWith("/À vérifier/"));
    assert.equal(aVerifier.length, 2, arbre.join("\n"));
    assert.ok(!arbre.some((x) => x.includes("Tarif")), "tarif Hardy : catalogue, rien de rangé");
    assert.ok(env.feuille("Journal").some((l) => l[6] === "catalogue" && l[12] === "journal" && /Tarif/.test(l[5])), "catalogue au journal");
    assert.ok(aVerifier.some((x) => x.includes("Hyg'Up — Facture.pdf")), "OCR raté");
    assert.ok(aVerifier.some((x) => x.includes("Fournisseur inconnu — Facture — 38.79 EUR.pdf")), "Castorama absent de la liste");
    assert.equal(arbre.filter((x) => x.startsWith("/Envoi Pennylane/") && (x.includes("Tarif") || x.includes("Hyg'Up") || x.includes("inconnu"))).length, 0);
  });
  test("le fournisseur inconnu est proposé « à compléter » dans le Sheet des fournisseurs, une seule fois", () => {
    const lignes = env.fournisseurs();
    assert.equal(lignes.length, 1, JSON.stringify(lignes));
    assert.equal(lignes[0][0], "Castorama");
    assert.equal(lignes[0][2], "castorama.fr");
    assert.equal(lignes[0][7], "à compléter");
    assert.equal(stats.inconnus, 1);
  });
  test("devis et mail interne : rien n'est rangé", () => {
    assert.equal(arbre.filter((x) => x.includes("Thermifroid") || x.includes("facture-client")).length, 0);
    assert.equal(stats.ignores, 1, "mail parti de contact@ sans être un transfert");
    assert.equal(stats.journal, 2, "devis et catalogue au journal seulement");
  });
  test("journal : une ligne par pièce, doublons et corps de mail tracés", () => {
    const lignes = env.feuille("Journal");
    const colDestination = 12, colRaison = 14, colPiece = 5;
    assert.equal(lignes.filter((l) => l[colDestination] === "doublon").length, 2, "FC0140 deux fois en doublon");
    assert.ok(lignes.some((l) => l[colPiece] === "(corps du mail)" && l[colDestination] === "corps_mail"), "facture Zenchef dans le corps, hors À vérifier");
    assert.ok(lignes.some((l) => l[colDestination] === "a_verifier" && /texte illisible/.test(l[colRaison])));
    assert.ok(lignes.some((l) => l[colDestination] === "a_verifier" && /fournisseur inconnu \(Castorama \?\)/.test(l[colRaison])));
    assert.ok(lignes.some((l) => l[colDestination] === "journal" && l[6] === "devis"));
    assert.equal(lignes.filter((l) => l[colDestination] === "envoi").length, 5);
  });
  test("chaque message est mémorisé ; une seconde passe ne refait rien", () => {
    assert.equal(env.feuille("Messages traités").length, stats.messages);
    const stats2 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "test" });
    assert.equal(stats2.messages, 0);
    assert.equal(stats2.deja, stats.messages);
    assert.deepEqual(env.arbre(), arbre);
  });
  test("le fichier « À vérifier » porte la raison et le lien du mail", () => {
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const av = racine.getFoldersByName("À vérifier").next();
    const fs = av.getFiles(); const descs = [];
    while (fs.hasNext()) descs.push(fs.next().getDescription());
    assert.ok(descs.some((d) => /À vérifier : texte illisible \(OCR\).*mail : https:\/\/mail\.google\.com/.test(d)), descs.join("\n"));
  });
  test("le libellé « traite » est posé sur les fils traités", () => {
    assert.ok(env.fils.filter((t) => t._labels.includes("traite")).length >= 8);
  });
  test("l'index retient MD5, fournisseur canonique, numéro, montant et le dossier d'archive prévu", () => {
    const index = env.feuille("Index");
    assert.ok(index.length >= 8);
    assert.ok(index.every((l) => /^[0-9a-f]{32}$/.test(l[1])), "MD5 hexadécimal");
    assert.ok(index.some((l) => l[3] === "Cheville 35" && String(l[4]) === "00113789" && l[6] === "375.64" && l[10] === "Bello Mio/Cheville 35/2026"));
  });
  test("après 3 jours, archiverEnvoisPennylane déplace vers <Etab>/<Fournisseur>/<Année> en gardant l'identifiant", () => {
    const envoi = env.ctx.dossierEnvoi("Bello Mio");
    const avant = {};
    const fs = envoi.getFiles();
    while (fs.hasNext()) { const f = fs.next(); avant[f.getName()] = f.getId(); if (/Cheville 35|Leroy Merlin/.test(f.getName())) f._cree = new Date(Date.now() - 4 * 86400000); }
    // un fichier déposé à la main par Paul, au nom libre, trop vieux pour l'archive automatique
    const manuel = envoi.createFile("facture-sans-nom-normalise.pdf", "contenu", "application/pdf");
    manuel._cree = new Date(Date.now() - 9 * 86400000);
    const st = env.ctx.archiverEnvoisPennylane();
    assert.equal(st.archives, 2);
    assert.equal(st.bloques, 1);
    const apres = env.arbre();
    assert.ok(apres.includes("/Bello Mio/Cheville 35/2026/2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf"), apres.join("\n"));
    assert.ok(apres.includes("/Bello Mio/Leroy Merlin/2026/2026-10-02 — Leroy Merlin — Facture — 38.79 EUR.pdf"));
    assert.ok(apres.includes("/Envoi Pennylane/Bello Mio/2026-10-02 — Maël Distribution — Facture n° FC0126 — -4.92 EUR.pdf"), "trop récent : reste");
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const archive = racine.getFoldersByName("Bello Mio").next().getFoldersByName("Cheville 35").next().getFoldersByName("2026").next().getFiles().next();
    assert.equal(archive.getId(), avant[archive.getName()], "même identifiant Drive après déplacement");
    assert.ok(env.feuille("Journal").some((l) => l[12] === "archive" && /Bello Mio\/Cheville 35\/2026/.test(l[13])));
    assert.ok(env.feuille("Journal").some((l) => l[12] === "envoi_bloque" && /nom de fichier non reconnu/.test(l[14])));
    // l'alerte hebdomadaire signale le fichier bloqué depuis plus de 7 jours
    env.ctx.alerteHebdo();
    assert.equal(env.mails.length, 1);
    assert.match(env.mails[0].body, /facture-sans-nom-normalise\.pdf/);
  });
});

describe("rattrapage en simulation puis en réel", () => {
  const env = boite();
  const sim = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: true, cleReprise: "sim" });
  test("la simulation n'écrit rien dans Drive ni dans « Messages traités », mais propose les fournisseurs inconnus", () => {
    assert.deepEqual(env.arbre(), []);
    assert.equal(env.feuille("Messages traités").length, 0);
    assert.equal(env.feuille("Journal").length, 0);
    assert.ok(env.feuille("Simulation").length >= 10);
    assert.equal(sim.envoi, 5);
    assert.equal(sim.doublons, 2, "doublons repérés même en simulation");
    assert.ok(env.feuille("Simulation").every((l) => l[18] === "simulation"));
    assert.ok(env.feuille("Simulation").some((l) => /-> archive Bello Mio\/Cheville 35\/2026/.test(l[13])), "le rapport indique l'archive prévue");
    assert.equal(env.fournisseurs().length, 1);
  });
  test("le réel qui suit range tout, et une pièce déjà rangée n'est pas réécrite", () => {
    const reel = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "reel" });
    assert.equal(reel.envoi, 5);
    assert.equal(env.arbre().length, 5 + 1 + 2, "5 factures, 1 relevé, 2 à vérifier (les tarifs Hardy restent au journal)");
    assert.equal(env.fournisseurs().length, 1, "pas de seconde ligne Castorama");
  });
});

describe("limite de temps et reprise", () => {
  const env = boite();
  test("s'arrête avant 6 minutes, mémorise la position et reprend sans doublon", () => {
    env.ctx.CONFIG.limiteMs = -1;   // tout appel dépasse la limite : on s'arrête tout de suite
    const s1 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "lim" });
    assert.equal(s1.messages, 0);
    assert.ok(Object.keys(env.props).some((k) => k.startsWith("reprise.lim.")));
    assert.ok(env.journalLog.some((l) => /PAS FINI/.test(l)));
    env.ctx.CONFIG.limiteMs = 5 * 60 * 1000;
    const s2 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "lim" });
    assert.ok(s2.messages >= 12);
    assert.ok(!Object.keys(env.props).some((k) => k.startsWith("reprise.lim.")));
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
  });
});

describe("alerte hebdomadaire", () => {
  const env = boite();
  env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "al" });
  test("rien de plus de 3 jours : seule la section des factures reçues dans le corps d'un mail ; vieux fichiers : récapitulatif à Paul", () => {
    assert.equal(env.ctx.alerteHebdo(), 0);
    assert.equal(env.mails.length, 1, "le mail Zenchef sans pièce jointe est signalé dans sa propre section");
    assert.match(env.mails[0].body, /corps d'un mail/);
    assert.match(env.mails[0].body, /Votre facture Zenchef/);
    assert.doesNotMatch(env.mails[0].body, /À vérifier » depuis/);
    env.mails.length = 0;
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const av = racine.getFoldersByName("À vérifier").next();
    av.getFiles().next()._cree = new Date(Date.now() - 5 * 86400000);
    assert.equal(env.ctx.alerteHebdo(), 1);
    assert.equal(env.mails.length, 1);
    assert.equal(env.mails[0].to, "cochetpaul@bellomio.fr");
    assert.match(env.mails[0].body, /À vérifier/);
    assert.match(env.mails[0].body, /Fournisseurs iFratelli/);
  });
});

describe("indexation de l'existant", () => {
  const env = boite();
  test("les fichiers déjà rangés (anciens dossiers par mois, anciens noms) entrent dans l'index et bloquent les doublons", () => {
    env.ctx.dossierDuChemin(["Bello Mio", "Cheville 35", "09 - Septembre 2026"]).createFile("2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf", env.fixture("cheville35_facture_bello"), "application/pdf");
    env.ctx.dossierDuChemin(["Piccola Mia", "Maeldistribution", "10 - Octobre 2026"]).createFile("2026-10-02 — Maeldistribution — Facture n° FC0140 — 906.39 EUR.pdf", "autre contenu", "application/pdf");
    env.ctx.dossierEnvoi("Piccola Mia").createFile("2026-10-01 — Maeldistribution — Facture n° FC0103 — 2054.81 EUR.pdf", "copie manuelle", "application/pdf");
    env.ctx.indexerExistant();
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
    const index = env.feuille("Index");
    assert.equal(index.length, 3);
    assert.ok(index.every((l) => l[3] === "Cheville 35" || l[3] === "Maël Distribution"), "fournisseur canonique : " + JSON.stringify(index.map((l) => l[3])));
    assert.ok(index.some((l) => l[2] === "Piccola Mia" && String(l[4]) === "FC0103" && /^Envoi Pennylane/.test(l[8])));
    const stats = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "idx" });
    assert.equal(stats.doublons, 4, "Cheville 35 (même MD5) et FC0140 x3 (fournisseur + numéro, ancienne graphie) reconnus");
    assert.equal(plain(env.arbre()).filter((x) => x.includes("FC0140") || x.includes("00113789")).length, 2);
  });
});

describe("réorganisation de l'archive : simulation puis réel", () => {
  const env = creerEnvironnement();
  const fx = env.fixture;
  env.ctx.dossierDuChemin(["Bello Mio", "Maeldistribution", "10 - Octobre 2026"]).createFile("2026-10-02 — Maeldistribution — Facture n° FC0126 — -4.92 EUR.pdf", fx("mael_avoir_bello"), "application/pdf");
  env.ctx.dossierDuChemin(["Bello Mio", "Metro-gsc", "09 - Septembre 2026"]).createFile("2026-09-12 — Metro-gsc — Facture n° 123 — 50.00 EUR.pdf", "x", "application/pdf");
  env.ctx.dossierDuChemin(["Bello Mio", "Metro", "08 - Août 2026"]).createFile("2026-08-12 — Metro — Facture n° 122 — 40.00 EUR.pdf", "x", "application/pdf");
  env.ctx.dossierDuChemin(["Bello Mio", "Facture", "09 - Septembre 2026"]).createFile("2026-09-30 — Facture — Facture n° 201018858 — 347.59 EUR.pdf", fx("carniato_facture_bello"), "application/pdf");
  env.ctx.dossierDuChemin(["Bello Mio", "Transfert Pierre", "09 - Septembre 2026"]).createFile("2026-09-15 — Transfert Pierre — Facture.pdf", "", "application/pdf");
  env.ctx.dossierDuChemin(["Piccola Mia", "Carniato", "10 - Octobre 2026"]).createFile("2026-10-01 — Carniato — Relevé LCR 14054661 — 138.80 EUR.pdf", fx("carniato_releve_piccola"), "application/pdf");
  env.ctx.dossierDuChemin(["Bello Mio", "Carniato", "2026"]).createFile("2026-09-01 — Carniato — Facture n° 201008049 — 983.94 EUR.pdf", "x", "application/pdf");
  env.ctx.dossierDuChemin(["_Hors Pennylane", "Bello Mio", "Carniato", "10 - Octobre 2026"]).createFile("2026-10-01 — Carniato — Relevé LCR 14054490 — 790.04 EUR.pdf", "x", "application/pdf");
  env.ctx.dossierDuChemin(["Piccola Mia", "Journaux de clôture"]).createFile("journal-caisse-2026-09.pdf", "caisse", "application/pdf");

  test("la simulation planifie sans rien déplacer : dossiers fusionnés, année, fourre-tout lus, relevé mal rangé", () => {
    const avant = env.arbre();
    const st = env.ctx.reorganiserArchive();
    assert.deepEqual(env.arbre(), avant, "rien n'a bougé");
    const plan = env.feuille("Réorganisation").map((l) => ({ ancien: l[1], nouveau: l[2], methode: l[4], statut: l[5] }));
    const par = (ancien) => plan.find((p) => p.ancien === ancien);
    assert.equal(par("Bello Mio/Maeldistribution/10 - Octobre 2026").nouveau, "Bello Mio/Maël Distribution/2026");
    assert.equal(par("Bello Mio/Metro-gsc/09 - Septembre 2026").nouveau, "Bello Mio/Metro/2026");
    assert.equal(par("Bello Mio/Metro/08 - Août 2026").nouveau, "Bello Mio/Metro/2026");
    assert.equal(par("Bello Mio/Facture/09 - Septembre 2026").nouveau, "Bello Mio/Carniato/2026", "fourre-tout classé d'après le PDF");
    assert.match(par("Bello Mio/Facture/09 - Septembre 2026").methode, /contenu/);
    assert.equal(par("Bello Mio/Transfert Pierre/09 - Septembre 2026").nouveau, "À vérifier", "PDF illisible");
    assert.equal(par("Piccola Mia/Carniato/10 - Octobre 2026").nouveau, "_Hors Pennylane/Piccola Mia/Carniato/2026", "un relevé n'a rien à faire dans l'archive des factures");
    assert.equal(par("_Hors Pennylane/Bello Mio/Carniato/10 - Octobre 2026").nouveau, "_Hors Pennylane/Bello Mio/Carniato/2026");
    assert.equal(par("Bello Mio/Carniato/2026"), undefined, "déjà en place");
    assert.equal(st.enPlace, 1);
    assert.ok(!plan.some((p) => /Journaux de clôture/.test(p.ancien)), "journaux de caisse laissés à deplacerJournauxDeCloture");
    assert.ok(plan.every((p) => p.statut === "simulation"));
    // relancer la simulation ne redouble pas le plan
    env.ctx.reorganiserArchive();
    assert.equal(env.feuille("Réorganisation").length, plan.length);
  });
  test("le réel exécute le plan validé, met les dossiers vides à la corbeille et garde les identifiants", () => {
    const idCarniato = env.ctx.dossierDuChemin(["Bello Mio", "Facture", "09 - Septembre 2026"]).getFiles().next().getId();
    const st = env.ctx.reorganiserArchiveReel();
    assert.equal(st.erreurs, 0);
    assert.equal(st.faits, 7);
    const apres = env.arbre();
    assert.ok(apres.includes("/Bello Mio/Maël Distribution/2026/2026-10-02 — Maeldistribution — Facture n° FC0126 — -4.92 EUR.pdf"), apres.join("\n"));
    assert.ok(apres.includes("/Bello Mio/Metro/2026/2026-09-12 — Metro-gsc — Facture n° 123 — 50.00 EUR.pdf"));
    assert.ok(apres.includes("/Bello Mio/Metro/2026/2026-08-12 — Metro — Facture n° 122 — 40.00 EUR.pdf"));
    assert.ok(apres.includes("/Bello Mio/Carniato/2026/2026-09-30 — Facture — Facture n° 201018858 — 347.59 EUR.pdf"));
    assert.ok(apres.includes("/À vérifier/2026-09-15 — Transfert Pierre — Facture.pdf"));
    assert.ok(apres.includes("/_Hors Pennylane/Piccola Mia/Carniato/2026/2026-10-01 — Carniato — Relevé LCR 14054661 — 138.80 EUR.pdf"));
    assert.ok(!apres.some((x) => /Metro-gsc\/|\/Facture\/|Maeldistribution\/|10 - Octobre|09 - Septembre|08 - Août/.test(x)), "anciens dossiers vides disparus");
    assert.equal(env.ctx.dossierDuChemin(["Bello Mio", "Carniato", "2026"]).getFilesByName("2026-09-30 — Facture — Facture n° 201018858 — 347.59 EUR.pdf").next().getId(), idCarniato);
    assert.ok(env.feuille("Réorganisation").every((l) => l[5] === "fait"));
  });
  test("les journaux de clôture sortent de Factures iFratelli", () => {
    env.ctx.deplacerJournauxDeCloture();
    assert.ok(!env.arbre().some((x) => /Journaux de clôture/.test(x)));
    const dest = env.racine.getFoldersByName("Journaux de caisse iFratelli").next().getFoldersByName("Piccola Mia").next();
    assert.equal(dest.getFiles().next().getName(), "journal-caisse-2026-09.pdf");
  });
});

describe("rattrapage de la bascule Pennylane", () => {
  const env = creerEnvironnement();
  const apres = new Date("2026-10-04T10:00:00+02:00"), avant = new Date("2026-10-02T10:00:00+02:00");
  const a = env.ctx.dossierDuChemin(["Piccola Mia", "Maeldistribution", "10 - Octobre 2026"]).createFile("2026-10-01 — Maeldistribution — Facture n° FC0103 — 2054.81 EUR.pdf", "x", "application/pdf"); a._cree = apres;
  const b = env.ctx.dossierDuChemin(["Piccola Mia", "Maeldistribution", "10 - Octobre 2026"]).createFile("2026-10-04 — Maeldistribution — Facture n° FC0160 — 300.00 EUR.pdf", "y", "application/pdf"); b._cree = apres;
  const c = env.ctx.dossierDuChemin(["Bello Mio", "Carniato", "10 - Octobre 2026"]).createFile("2026-09-30 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf", "z", "application/pdf"); c._cree = avant;
  const d = env.ctx.dossierDuChemin(["Bello Mio", "TerreAzur", "10 - Octobre 2026"]).createFile("2026-10-05 — TerreAzur — Facture n° 8801810000 — 99.00 EUR.pdf", "w", "application/pdf"); d._cree = apres;
  env.ctx.dossierEnvoi("Piccola Mia").createFile("2026-10-01 — Maël Distribution — Facture n° FC0103 — 2054.81 EUR.pdf", "copie manuelle de Paul", "application/pdf");

  test("simulation : liste ce qui serait copié, sans copier", () => {
    const st = env.ctx.rattrapageBasculeSimulation();
    assert.equal(st.vus, 3, "créés après le 03/10 au soir");
    assert.equal(st.deja, 1, "FC0103 déjà copiée à la main (même numéro et montant, autre graphie du nom)");
    assert.equal(st.copies, 2);
    assert.equal(env.ctx.dossierEnvoi("Piccola Mia").getFiles().next().getName(), "2026-10-01 — Maël Distribution — Facture n° FC0103 — 2054.81 EUR.pdf");
    assert.equal(env.feuille("Simulation").length, 2);
  });
  test("réel : copie dans Envoi Pennylane, l'archive garde l'original", () => {
    const st = env.ctx.rattrapageBasculeReel();
    assert.equal(st.copies, 2);
    const arbre = env.arbre();
    assert.ok(arbre.includes("/Envoi Pennylane/Piccola Mia/2026-10-04 — Maeldistribution — Facture n° FC0160 — 300.00 EUR.pdf"), arbre.join("\n"));
    assert.ok(arbre.includes("/Envoi Pennylane/Bello Mio/2026-10-05 — TerreAzur — Facture n° 8801810000 — 99.00 EUR.pdf"));
    assert.ok(arbre.includes("/Piccola Mia/Maeldistribution/10 - Octobre 2026/2026-10-04 — Maeldistribution — Facture n° FC0160 — 300.00 EUR.pdf"), "original conservé");
    assert.ok(!arbre.includes("/Envoi Pennylane/Bello Mio/2026-09-30 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf"), "créé avant la bascule : Pennylane l'a déjà");
    assert.equal(env.ctx.rattrapageBasculeReel().copies, 0, "une seconde passe ne recopie rien");
  });
});

describe("génération de la liste de référence", () => {
  const env = creerEnvironnement();
  env.ctx.dossierDuChemin(["Bello Mio", "Maeldistribution", "10 - Octobre 2026"]);
  env.ctx.dossierDuChemin(["Bello Mio", "Metro-gsc", "09 - Septembre 2026"]);
  env.ctx.dossierDuChemin(["Piccola Mia", "Fromagerie Inconnue", "09 - Septembre 2026"]);
  env.ctx.dossierDuChemin(["Bello Mio", "Transfert Pierre", "09 - Septembre 2026"]);
  env.ctx.dossierDuChemin(["_Hors Pennylane", "Bello Mio", "Prophyl", "2026"]);
  test("liste par défaut + dossiers existants (variantes ou lignes à relire), fourre-tout ignorés", () => {
    env.ctx.genererListeFournisseurs();
    const lignes = env.fournisseurs();
    const par = (nom) => lignes.find((l) => l[0] === nom);
    assert.ok(lignes.length >= env.ctx.CONFIG.fournisseursReference.length + 1);
    assert.match(par("Maël Distribution")[1], /Maeldistribution/);
    assert.match(par("Metro")[1], /Metro-gsc/);
    assert.equal(par("Fromagerie Inconnue")[8], "dossier existant, à relire");
    assert.equal(par("Transfert Pierre"), undefined);
    assert.equal(par("Prophyl")[3], "FR48451251128");
    // relancer ne double rien
    env.ctx.genererListeFournisseurs();
    assert.equal(env.fournisseurs().length, lignes.length);
  });
});

describe("v4.2 : quota OCR, transit du rattrapage, établissement par défaut, images de signature", () => {
  test("quota OCR : nouvel essai après attente, puis exception : message non marqué traité, passe arrêtée et reprise", () => {
    const env = creerEnvironnement();
    env.fil([{ date: "2026-10-02T09:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola") }] }]);
    env.pannes.ocr = 2;   // deux refus puis succès
    const s1 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "q" });
    assert.equal(s1.envoi, 1);
    assert.deepEqual(plain(env.pannes.pauses), [2000, 5000], "attentes progressives");
    assert.equal(env.feuille("Messages traités").length, 1);
    env.fil([{ date: "2026-10-02T10:00:00", from: "noreply@carniato.com", to: "facture@bellomio.fr", subject: "Facture", pieces: [{ nom: "201018858.pdf", contenu: env.fixture("carniato_facture_bello") }] }]);
    env.pannes.ocr = 99;  // quota durable
    const s2 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "q" });
    assert.equal(s2.quota, 1);
    assert.equal(s2.envoi, 0);
    assert.equal(env.feuille("Messages traités").length, 1, "le message Carniato n'est pas marqué traité");
    assert.ok(env.journalLog.some((l) => /ARRÊT SUR QUOTA OCR/.test(l)));
    assert.ok(Object.keys(env.props).some((k) => k.startsWith("reprise.q.")), "position de reprise mémorisée");
    env.pannes.ocr = 0;
    const s3 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "q" });
    assert.equal(s3.envoi, 1, "repris au passage suivant");
    assert.ok(env.arbre().some((x) => x.includes("Carniato — Facture n° 201018858")));
  });
  test("rattrapageReel écrit dans « Rattrapage à valider », jamais dans Envoi Pennylane, avec une pause entre deux OCR", () => {
    const env = creerEnvironnement();
    env.fil([{ date: "2026-10-02T09:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola") }] }]);
    env.fil([{ date: "2026-10-01T09:00:00", from: "noreply@carniato.com", to: "facture@bellomio.fr", subject: "Relevé", pieces: [{ nom: "14054490.pdf", contenu: env.fixture("carniato_releve_bello") }] }]);
    const sim = env.ctx.rattrapage("2026-07-01");
    assert.equal(sim.transit, 1);
    assert.ok(env.feuille("Simulation").some((l) => l[12] === "transit" && /^Rattrapage à valider\/Piccola Mia\//.test(l[13]) && /-> archive Piccola Mia\/Maël Distribution\/2026/.test(l[13])));
    const reel = env.ctx.rattrapageReel("2026-07-01");
    assert.equal(reel.transit, 1);
    assert.equal(reel.envoi, 0);
    const arbre = env.arbre();
    assert.ok(arbre.includes("/Rattrapage à valider/Piccola Mia/2026-10-02 — Maël Distribution — Facture n° FC0140 — 906.39 EUR.pdf"), arbre.join("\n"));
    assert.ok(!arbre.some((x) => x.startsWith("/Envoi Pennylane/")));
    assert.ok(arbre.includes("/_Hors Pennylane/Bello Mio/Carniato/2026/2026-10-01 — Carniato — Relevé n° 14054490 — 790.04 EUR.pdf"), "les relevés vont directement hors Pennylane");
    assert.ok(env.pannes.pauses.filter((ms) => ms === 1000).length >= 2, "pause d'une seconde avant chaque OCR");
    assert.ok(env.feuille("Index").some((l) => /^Rattrapage à valider/.test(l[8]) && l[10] === "Piccola Mia/Maël Distribution/2026"), "l'archive prévue est connue : après validation et déplacement vers Envoi Pennylane, l'archivage suit");
    // la passe horaire, elle, va toujours directement dans Envoi Pennylane
    env.fil([{ date: "2026-10-02T10:00:00", from: "noreply@carniato.com", to: "facture@bellomio.fr", subject: "Facture", pieces: [{ nom: "201018858.pdf", contenu: env.fixture("carniato_facture_bello") }] }]);
    env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "h" });
    assert.ok(env.arbre().includes("/Envoi Pennylane/Bello Mio/2026-09-29 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf"));
  });
  test("établissement absent de la facture : colonne « Établissement par défaut » du Sheet (source : liste)", () => {
    const env = creerEnvironnement();
    const zenchef = "Facture ZCINV-FEE-2026-09-0042\nZenchef SAS 20 rue des Petits Hotels 75010 Paris TVA FR12798475101\nAbonnement Zenchef Essentiel septembre 2026\nTotal HT 49,17 €\nTVA 20 % 9,83 €\nTotal TTC 59,00 €\nDate de facture : 30/09/2026";
    env.fil([{ date: "2026-10-01T09:00:00", from: "billing@zenchef.com", to: "contact@bellomio.fr", subject: "Votre facture Zenchef", pieces: [{ nom: "invoice_ZCINV-FEE-2026-09-0042.pdf", contenu: zenchef }] }]);
    const s1 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "z1" });
    assert.equal(s1.a_verifier, 1, "« Les deux » ne décide pas");
    const env2 = creerEnvironnement();
    env2.ctx.CONFIG.fournisseursReference.find((f) => f.nom === "Zenchef").etab = "Bello";
    env2.fil([{ date: "2026-10-01T09:00:00", from: "billing@zenchef.com", to: "contact@bellomio.fr", subject: "Votre facture Zenchef", pieces: [{ nom: "invoice_ZCINV-FEE-2026-09-0042.pdf", contenu: zenchef }] }]);
    const s2 = env2.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "z2" });
    assert.equal(s2.envoi, 1);
    assert.ok(env2.arbre().includes("/Envoi Pennylane/Bello Mio/2026-09-30 — Zenchef — Facture n° ZCINV-FEE-2026-09-0042 — 59.00 EUR.pdf"), env2.arbre().join("\n"));
    assert.ok(env2.feuille("Journal").some((l) => l[7] === "Bello Mio (liste)"), "le journal indique la source");
  });
  test("images de signature ignorées, photos de factures gardées", () => {
    const env = creerEnvironnement();
    const gros = "x".repeat(30000);
    env.fil([{ date: "2026-10-01T09:00:00", from: "compta@armor-emballages.fr", to: "facture@bellomio.fr", subject: "Facture", pieces: [
      { nom: "image001.png", contenu: gros, type: "image/png" }, { nom: "Outlook-abc123.png", contenu: gros, type: "image/png" }, { nom: "logo.jpg", contenu: gros, type: "image/jpeg" },
      { nom: "IMG_2041.jpg", contenu: env.fixture("terreazur_facture_bello").padEnd(25000, " "), type: "image/jpeg" }
    ] }]);
    const s = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "img" });
    assert.equal(s.pieces, 1, "seule la photo IMG_2041 est examinée");
  });
});
