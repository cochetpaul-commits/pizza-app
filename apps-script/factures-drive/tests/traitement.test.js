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
  test("après 3 jours DANS ENVOI, archiverEnvoisPennylane déplace vers <Etab>/<Fournisseur>/<Année> en gardant l'identifiant", () => {
    const envoi = env.ctx.dossierEnvoi("Bello Mio");
    const avant = {};
    const vieillir = (id, jours) => { env.ctx.indexParId(id).arriveEnvoi = new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10); };
    const fs = envoi.getFiles();
    while (fs.hasNext()) { const f = fs.next(); avant[f.getName()] = f.getId(); if (/Cheville 35|Leroy Merlin/.test(f.getName())) vieillir(f.getId(), 4); }
    // un fichier déposé à la main par Paul, au nom libre, CRÉÉ il y a 9 jours : inconnu de l'Index, il est indexé aujourd'hui et attend 3 jours
    const manuel = envoi.createFile("facture-sans-nom-normalise.pdf", "contenu", "application/pdf");
    manuel._cree = new Date(Date.now() - 9 * 86400000);
    const st = env.ctx.archiverEnvoisPennylane();
    assert.equal(st.archives, 2);
    assert.equal(st.bloques, 0, "le fichier déposé à la main n'est pas archivé le jour où il est vu");
    assert.equal(env.ctx.indexParId(manuel.getId()).arriveEnvoi, new Date().toISOString().slice(0, 10), "indexé avec sa date d'arrivée");
    const apres = env.arbre();
    assert.ok(apres.includes("/Bello Mio/Cheville 35/2026/2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf"), apres.join("\n"));
    assert.ok(apres.includes("/Bello Mio/Leroy Merlin/2026/2026-10-02 — Leroy Merlin — Facture — 38.79 EUR.pdf"));
    assert.ok(apres.includes("/Envoi Pennylane/Bello Mio/2026-10-02 — Maël Distribution — Facture n° FC0126 — -4.92 EUR.pdf"), "trop récent : reste");
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const archive = racine.getFoldersByName("Bello Mio").next().getFoldersByName("Cheville 35").next().getFoldersByName("2026").next().getFiles().next();
    assert.equal(archive.getId(), avant[archive.getName()], "même identifiant Drive après déplacement");
    assert.ok(env.feuille("Journal").some((l) => l[12] === "archive" && /Bello Mio\/Cheville 35\/2026/.test(l[13])));
    assert.ok(env.feuille("Index").some((l) => l[0] === archive.getId() && l[8] === "Bello Mio/Cheville 35/2026"), "chemin de l'Index mis à jour");
    // 9 jours plus tard, le fichier au nom libre est toujours là : bloqué (nom non reconnu) et signalé par l'alerte hebdomadaire
    vieillir(manuel.getId(), 9);
    const st2 = env.ctx.archiverEnvoisPennylane();
    assert.equal(st2.bloques, 1);
    assert.ok(env.feuille("Journal").some((l) => l[12] === "envoi_bloque" && /nom de fichier non reconnu/.test(l[14])));
    env.ctx.alerteHebdo();
    assert.equal(env.mails.length, 1);
    assert.match(env.mails[0].body, /facture-sans-nom-normalise\.pdf/);
  });
  test("un fichier déplacé à la main depuis À vérifier vers Envoi Pennylane attend 3 jours à compter de son arrivée", () => {
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const av = racine.getFoldersByName("À vérifier").next();
    const f = av.getFiles().next();
    f._cree = new Date(Date.now() - 30 * 86400000);
    f.moveTo(env.ctx.dossierEnvoi("Bello Mio"));
    const st = env.ctx.archiverEnvoisPennylane();
    assert.ok(env.arbre().includes("/Envoi Pennylane/Bello Mio/" + f.getName()), "toujours dans Envoi : vu aujourd'hui pour la première fois");
    const e = env.ctx.indexParId(f.getId());
    assert.equal(e.chemin, "Envoi Pennylane/Bello Mio");
    assert.equal(e.arriveEnvoi, new Date().toISOString().slice(0, 10));
    assert.ok(env.feuille("Index").some((l) => l[0] === f.getId() && l[8] === "Envoi Pennylane/Bello Mio" && l[11] === e.arriveEnvoi), "Sheet à jour");
    assert.equal(st.erreurs, 0);
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
    // v4.5 : colonne « Nouveau nom » au fournisseur canonique, même format que extraireFactures
    const nomsPrevus = env.feuille("Réorganisation").map((l) => [l[1], l[3], l[7]]);
    const nouveauNom = (ancien) => nomsPrevus.find((x) => x[0] === ancien)[2];
    assert.equal(nouveauNom("Bello Mio/Maeldistribution/10 - Octobre 2026"), "2026-10-02 — Maël Distribution — Facture n° FC0126 — -4.92 EUR.pdf");
    assert.equal(nouveauNom("Bello Mio/Metro-gsc/09 - Septembre 2026"), "2026-09-12 — Metro — Facture n° 123 — 50.00 EUR.pdf");
    assert.equal(nouveauNom("Bello Mio/Facture/09 - Septembre 2026"), "2026-09-30 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf", "fourre-tout : fournisseur lu dans le PDF");
    assert.equal(nouveauNom("Bello Mio/Transfert Pierre/09 - Septembre 2026"), "2026-09-15 — Transfert Pierre — Facture.pdf", "illisible : nom gardé");
    assert.equal(nouveauNom("Piccola Mia/Carniato/10 - Octobre 2026"), "2026-10-01 — Carniato — Relevé LCR 14054661 — 138.80 EUR.pdf", "déjà au bon nom");
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
    assert.equal(st.deplaces, 7);
    assert.equal(st.renommes, 3, "Maeldistribution, Metro-gsc, Facture (Carniato)");
    const apres = env.arbre();
    assert.ok(apres.includes("/Bello Mio/Maël Distribution/2026/2026-10-02 — Maël Distribution — Facture n° FC0126 — -4.92 EUR.pdf"), apres.join("\n"));
    assert.ok(apres.includes("/Bello Mio/Metro/2026/2026-09-12 — Metro — Facture n° 123 — 50.00 EUR.pdf"));
    assert.ok(apres.includes("/Bello Mio/Metro/2026/2026-08-12 — Metro — Facture n° 122 — 40.00 EUR.pdf"));
    assert.ok(apres.includes("/Bello Mio/Carniato/2026/2026-09-30 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf"), "déplacé ET renommé");
    assert.ok(apres.includes("/À vérifier/2026-09-15 — Transfert Pierre — Facture.pdf"));
    assert.ok(apres.includes("/_Hors Pennylane/Piccola Mia/Carniato/2026/2026-10-01 — Carniato — Relevé LCR 14054661 — 138.80 EUR.pdf"));
    assert.ok(!apres.some((x) => /Metro-gsc\/|\/Facture\/|Maeldistribution\/|10 - Octobre|09 - Septembre|08 - Août/.test(x)), "anciens dossiers vides disparus");
    assert.equal(env.ctx.dossierDuChemin(["Bello Mio", "Carniato", "2026"]).getFilesByName("2026-09-30 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf").next().getId(), idCarniato);
    assert.ok(env.feuille("Réorganisation").every((l) => l[5] === "fait"));
  });
  test("les journaux de clôture sortent de Factures iFratelli", () => {
    env.ctx.deplacerJournauxDeCloture();
    assert.ok(!env.arbre().some((x) => /Journaux de clôture/.test(x)));
    const dest = env.racine.getFoldersByName("Journaux de caisse iFratelli").next().getFoldersByName("Piccola Mia").next();
    assert.equal(dest.getFiles().next().getName(), "journal-caisse-2026-09.pdf");
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

describe("v4.5 : liste de fournisseurs nettoyée, renommage de l'archive, avertissements", () => {
  /** Sheet « Fournisseurs iFratelli » écrit à la main dans le faux Drive */
  function ecrireSheet(env, lignes) {
    const c = env.ctx.fournisseursClasseur(true);
    const f = c.getSheetByName("Fournisseurs");
    lignes.forEach((l) => f.appendRow(l));
  }
  const LIGNES = [
    ["Self Stockage", "Wanadoo", "wanadoo.fr; selfstockage@wanadoo.fr", "FR53922735535", "Bello", "", "", "oui", ""],
    ["Hyg'Up", "", "hygup.fr", "FR16911617124", "Bello", "", "", "oui", ""],
    ["Hyg-up", "", "", "", "", "", "", "non", "fusionné avec Hyg'Up"],
    ["Cmb", "", "cmb.fr", "", "perso", "", "", "oui", "banque perso de Pierre"],
    ["SDPF", "Progourmands", "sdpfcompta@hotmail.com", "", "Bello", "", "", "oui", ""],
    ["Up Coop", "", "up.coop", "", "bon de commande", "", "", "oui", ""],
    ["Metro", "Metro-gsc", "metro.fr", "", "je sais pas", "", "", "oui", ""],
    ["Carniato", "", "carniato.com", "FR14340783828", "Bello", "", "", "oui", ""],
    ["Carniato bis", "Carniato", "", "", "Piccola", "", "", "oui", "doublon actif"]
  ];

  test("renommerArchive : simulation puis réel, sans déplacer, fournisseurs inactifs laissés en place", () => {
    const env = creerEnvironnement();
    ecrireSheet(env, LIGNES);
    const fWanadoo = env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-09-01 — Wanadoo — Facture n° 2026-091 — 120.00 EUR.pdf", "x", "application/pdf");
    env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-08-01 — Self Stockage — Facture n° 2026-081 — 120.00 EUR.pdf", "y", "application/pdf");
    env.ctx.dossierDuChemin(["Bello Mio", "Hyg'Up", "2026"]).createFile("2026-09-10 — Hyg-up — Facture n° 127999 — 1155.24 EUR.pdf", "z", "application/pdf");
    env.ctx.dossierDuChemin(["Bello Mio", "Cmb", "2026"]).createFile("2026-09-05 — Cmb — Facture n° 1 — 9.90 EUR.pdf", "w", "application/pdf");
    env.ctx.dossierDuChemin(["Bello Mio", "Dossier mystère", "2026"]).createFile("2026-09-05 — Dossier mystère — Facture n° 2 — 9.90 EUR.pdf", "v", "application/pdf");
    env.ctx.dossierDuChemin(["_Hors Pennylane", "Bello Mio", "Carniato", "2026"]).createFile("2026-10-01 — Carniato — Relevé LCR 14054490 — 790.04 EUR.pdf", "u", "application/pdf");
    const avant = env.arbre();
    const st = env.ctx.renommerArchive();
    assert.deepEqual(env.arbre(), avant, "rien n'a bougé");
    assert.equal(env.pannes.appelsOcr, 0, "renommerArchive ne lit aucun PDF");
    assert.equal(st.renommages, 2);
    assert.equal(st.planifies, 0);
    assert.equal(st.ignores, 1);
    const plan = env.feuille("Réorganisation").map((l) => ({ ancien: l[1], nouveau: l[2], nom: l[3], methode: l[4], statut: l[5], nouveauNom: l[7] }));
    const w = plan.find((p) => p.nom.startsWith("2026-09-01 — Wanadoo"));
    assert.equal(w.nouveauNom, "2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf");
    assert.equal(w.methode, "renommage");
    assert.equal(w.statut, "simulation");
    assert.equal(w.ancien, w.nouveau, "même dossier");
    assert.equal(plan.find((p) => p.nom.startsWith("2026-09-10 — Hyg-up")).nouveauNom, "2026-09-10 — Hyg'Up — Facture n° 127999 — 1155.24 EUR.pdf");
    const cmb = plan.find((p) => p.nom.startsWith("2026-09-05 — Cmb"));
    assert.match(cmb.statut, /^ignoré \(fournisseur inactif\)/);
    assert.ok(!plan.some((p) => p.nom.startsWith("2026-08-01 — Self Stockage")), "déjà au bon nom : pas de ligne");
    assert.ok(!plan.some((p) => p.nom.startsWith("2026-09-05 — Dossier mystère")), "dossier hors liste : laissé tel quel sans OCR");
    assert.ok(!plan.some((p) => /Relevé LCR/.test(p.nom)), "relevé déjà bien nommé et bien rangé");
    // relancer ne redouble pas
    env.ctx.renommerArchive();
    assert.equal(env.feuille("Réorganisation").length, plan.length);
    // réel
    const reel = env.ctx.renommerArchiveReel();
    assert.equal(reel.erreurs, 0);
    assert.equal(reel.renommes, 2);
    assert.equal(reel.deplaces, 0);
    const apres = env.arbre();
    assert.ok(apres.includes("/Bello Mio/Self Stockage/2026/2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf"), apres.join("\n"));
    assert.ok(apres.includes("/Bello Mio/Hyg'Up/2026/2026-09-10 — Hyg'Up — Facture n° 127999 — 1155.24 EUR.pdf"));
    assert.ok(apres.includes("/Bello Mio/Cmb/2026/2026-09-05 — Cmb — Facture n° 1 — 9.90 EUR.pdf"), "inactif : intact");
    assert.equal(fWanadoo.getName(), "2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf", "même fichier, même identifiant");
    assert.ok(env.feuille("Réorganisation").filter((l) => l[4] === "renommage").every((l) => l[5] === "fait"));
    assert.ok(env.feuille("Réorganisation").some((l) => /^ignoré/.test(l[5])), "la ligne ignorée reste ignorée");
  });

  test("v4.5.1 : un fichier déjà déplacé hier (ligne « fait » sans nouveau nom) et encore à l'ancien nom est planifié en renommage", () => {
    const env = creerEnvironnement();
    ecrireSheet(env, LIGNES);
    const f = env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-09-01 — Wanadoo — Facture n° 2026-091 — 120.00 EUR.pdf", "x", "application/pdf");
    const g = env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-08-01 — Self Stockage — Facture n° 2026-081 — 120.00 EUR.pdf", "y", "application/pdf");
    // lignes « fait » de la réorganisation v4.4 (déplacement seul, colonne « Nouveau nom » vide)
    env.ctx.reorgAjouter({ fichierId: f.getId(), ancien: "Bello Mio/Wanadoo/09 - Septembre 2026", nouveau: "Bello Mio/Self Stockage/2026", nom: f.getName(), methode: "dossier Wanadoo", statut: "fait" });
    env.ctx.reorgAjouter({ fichierId: g.getId(), ancien: "Bello Mio/Wanadoo/08 - Août 2026", nouveau: "Bello Mio/Self Stockage/2026", nom: g.getName(), methode: "dossier Wanadoo", statut: "fait" });
    env.ctx.journalVider();
    const st = env.ctx.renommerArchive();
    assert.equal(st.renommages, 1, "le fichier déjà déplacé mais à l'ancien nom est planifié");
    assert.equal(st.enPlace, 1);
    const plan = env.feuille("Réorganisation");
    assert.equal(plan.length, 3, "deux anciennes lignes « fait » + une ligne « renommage »");
    const r = plan.find((l) => l[4] === "renommage");
    assert.equal(r[0], f.getId());
    assert.equal(r[5], "simulation");
    assert.equal(r[7], "2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf");
    env.ctx.renommerArchive();
    assert.equal(env.feuille("Réorganisation").length, 3, "relancer ne redouble pas");
    const reel = env.ctx.renommerArchiveReel();
    assert.equal(reel.faits, 1, "les anciennes lignes « fait » ne sont pas rejouées");
    assert.equal(reel.renommes, 1);
    assert.equal(reel.deplaces, 0);
    assert.equal(f.getName(), "2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf");
    assert.deepEqual(plain(env.feuille("Réorganisation").map((l) => l[5])), ["fait", "fait", "fait"]);
    assert.ok(env.arbre().every((x) => x.startsWith("/Bello Mio/Self Stockage/2026/")), "rien n'a été déplacé");
    // reorganiserArchiveReel non plus ne rejoue pas les lignes « fait »
    const re = env.ctx.reorganiserArchiveReel();
    assert.equal(re.faits, 0);
  });

  test("les avertissements de la liste sont écrits dans le journal ; l'adresse complète hotmail est reconnue, wanadoo.fr seul non", () => {
    const env = creerEnvironnement();
    ecrireSheet(env, LIGNES);
    const texteSdpf = "SDPF Progourmands\nFacture N° 813\nSIRET 123 456 789 00012\nTotal HT 100,00\nTVA 5,5 % 5,50\nNet à payer 105,50 €\nSARL SASHA 2 rue de la Pierre 35400 Saint-Malo\nDate : 01/10/2026";
    env.fil([{ date: "2026-10-02T09:00:00", from: "sdpfcompta@hotmail.com", to: "facture@bellomio.fr", subject: "Facture 813", pieces: [{ nom: "813.pdf", contenu: texteSdpf }] }]);
    env.fil([{ date: "2026-10-02T10:00:00", from: "quelqun@wanadoo.fr", to: "facture@bellomio.fr", subject: "Facture", pieces: [{ nom: "f.pdf", contenu: texteSdpf.replace(/SDPF Progourmands/, "AUTRE SOCIETE").replace(/N° 813/, "N° 814").replace(/123 456 789 00012/, "987 654 321 00019") }] }]);
    const s = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "v45" });
    assert.equal(s.envoi, 1, "SDPF reconnu par son adresse complète");
    assert.ok(env.arbre().includes("/Envoi Pennylane/Bello Mio/2026-10-01 — SDPF — Facture n° 813 — 105.50 EUR.pdf"), env.arbre().join("\n"));
    assert.equal(s.a_verifier, 1, "l'expéditeur wanadoo n'est pas Self Stockage");
    const avert = env.feuille("Journal").filter((l) => l[12] === "avertissement").map((l) => l[14]);
    assert.ok(avert.some((a) => /Self Stockage.*wanadoo\.fr/.test(a)), avert.join("\n"));
    assert.ok(avert.some((a) => /Metro.*je sais pas/.test(a)));
    assert.ok(avert.some((a) => /variante « carniato ».*Carniato.*Carniato bis/.test(a)), "deux lignes actives : avertissement");
    assert.ok(!avert.some((a) => /hygup/.test(a)), "une ligne inactive ne provoque pas d'avertissement");
    // la proposition pour l'inconnu wanadoo porte l'adresse complète, pas le domaine
    const prop = env.fournisseurs().find((l) => l[7] === "à compléter");
    assert.ok(prop, JSON.stringify(env.fournisseurs()));
    assert.equal(prop[2], "quelqun@wanadoo.fr");
    assert.equal(prop[0], "quelqun");
  });

  test("« bon de commande » dans la colonne établissement : pièces au journal seul", () => {
    const env = creerEnvironnement();
    ecrireSheet(env, LIGNES);
    env.fil([{ date: "2026-10-02T09:00:00", from: "commandes@up.coop", to: "facture@bellomio.fr", subject: "Votre commande", pieces: [{ nom: "cmd.pdf", contenu: "Facture n° 4455\nUp Coop\nTotal HT 100,00\nTVA 20 % 20,00\nTotal TTC 120,00 €\nSARL SASHA\nDate : 01/10/2026" }] }]);
    const s = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "bdc" });
    assert.equal(s.envoi, 0);
    assert.deepEqual(env.arbre(), []);
    assert.ok(env.feuille("Journal").some((l) => l[6] === "bon_commande" && l[12] === "journal"));
  });
});

describe("v4.6 : sûreté (verrou, curseur, écriture après chaque message), pièces, plateformes, OCR, types MIME, Index", () => {
  const mael = (env, date, to) => env.fil([{ date: date || "2026-10-02T09:00:00", from: "comptabilite@maeldistribution.fr", to: to || "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola") }] }]);

  test("verrou : une exécution en cours fait abandonner la suivante ; curseur de date après une passe terminée ; contrôle quotidien", () => {
    const env = creerEnvironnement();
    mael(env, new Date(Date.now() - 3600000).toISOString());
    env.verrou.pris = true;
    assert.equal(env.ctx.extraireFactures(), null);
    assert.ok(env.journalLog.some((l) => /ABANDON extraireFactures/.test(l)));
    assert.deepEqual(env.arbre(), []);
    env.verrou.pris = false;
    const st = env.ctx.extraireFactures();
    assert.equal(st.envoi, 1);
    assert.ok(st.termine);
    assert.ok(env.props["curseur.passe"], "curseur écrit après une passe terminée");
    assert.equal(env.verrou.pris, false, "verrou relâché");
    assert.equal(env.ctx.controlerPasses() <= 1, true);
    assert.equal(env.mails.length, 0, "passe récente : pas de mail");
    env.props["curseur.passe"] = new Date(Date.now() - 30 * 3600000).toISOString();
    env.ctx.controlerPasses();
    assert.equal(env.mails.length, 1);
    assert.match(env.mails[0].subject, /ne tourne plus/);
  });

  test("curseur : après plusieurs jours d'arrêt, la passe horaire remonte jusqu'à la dernière passe terminée", () => {
    const env = creerEnvironnement();
    const il_y_a = (h) => new Date(Date.now() - h * 3600000).toISOString();
    env.fil([{ date: il_y_a(9 * 24), from: "comptabilite@maeldistribution.fr", to: "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [{ nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola") }] }]);
    assert.equal(env.ctx.extraireFactures().envoi, 0, "sans curseur : fenêtre de 72 h, le mail de 9 jours n'est pas vu");
    env.props["curseur.passe"] = il_y_a(9 * 24 - 2);   // dernière passe terminée il y a presque 9 jours
    assert.equal(env.ctx.extraireFactures().envoi, 1, "avec le curseur (moins 24 h de marge) : repêché");
  });

  test("limite de temps au milieu d'un message : la pièce déjà rangée est dans l'Index, le message n'est pas marqué traité, la reprise ne double rien", () => {
    const env = creerEnvironnement();
    env.fil([{ date: "2026-10-02T09:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@bellomio.fr", subject: "Factures", pieces: [
      { nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola") }, { nom: "FC0126.pdf", contenu: env.fixture("mael_avoir_bello") }] }]);
    const vraiNow = env.DateVm.now; let decalage = 0; env.DateVm.now = () => vraiNow() + decalage;
    const lireTexteOrig = env.ctx.lireTexte; let appels = 0;
    env.ctx.lireTexte = function(b, e) { const r = lireTexteOrig(b, e); if (++appels === 1) decalage = 10 * 60 * 1000; return r; };   // l'horloge saute après la première pièce
    const s1 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "t" });
    assert.ok(env.journalLog.some((l) => /PAS FINI/.test(l)));
    assert.equal(env.feuille("Messages traités").length, 0, "message interrompu : pas marqué traité");
    assert.equal(env.feuille("Index").length, 1, "la première pièce est déjà écrite dans l'Index");
    assert.equal(env.feuille("Journal").length, 1);
    assert.ok(env.arbre().includes("/Envoi Pennylane/Piccola Mia/2026-10-02 — Maël Distribution — Facture n° FC0140 — 906.39 EUR.pdf"));
    assert.equal(s1.envoi, 1);
    decalage = 0; env.ctx.lireTexte = lireTexteOrig;
    const s2 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "t" });
    assert.equal(s2.doublons, 1, "FC0140 reconnue par son empreinte");
    assert.equal(s2.envoi, 1, "FC0126 rangée");
    assert.equal(env.feuille("Messages traités").length, 1);
    assert.equal(env.arbre().filter((x) => x.includes("FC0140")).length, 1);
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
  });

  test("pièces écartées journalisées, PDF sans extension reconnu par son type, type MIME posé d'après l'extension, Factur-X", () => {
    const env = creerEnvironnement();
    env.fil([{ date: "2026-10-02T09:00:00", from: "noreply@carniato.com", to: "facture@bellomio.fr", subject: "Facture", pieces: [
      { nom: "archive.zip", contenu: "PK...", type: "application/zip" },
      { nom: "facture", contenu: env.fixture("carniato_facture_bello"), type: "application/pdf" },
      { nom: "signature.p7m", contenu: "x", type: "application/pkcs7-mime" }] }]);
    env.fil([{ date: "2026-10-02T10:00:00", from: "comptabilite@maeldistribution.fr", to: "facture@piccolamia.fr", subject: "Facture FC0140", pieces: [
      { nom: "FC0140.pdf", contenu: env.fixture("mael_facture_piccola"), type: "application/octet-stream" },
      { nom: "FC0140.xml", contenu: "<rsm:CrossIndustryInvoice>FC0140</rsm:CrossIndustryInvoice>", type: "application/xml" }] }]);
    const st = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "p" });
    assert.equal(st.ecartees, 2);
    const j = env.feuille("Journal");
    assert.ok(j.some((l) => l[5] === "archive.zip" && l[12] === "ignoree" && /zip/.test(l[14])), JSON.stringify(j.map((l) => [l[5], l[12], l[14]])));
    assert.ok(j.some((l) => l[5] === "signature.p7m" && l[12] === "ignoree"));
    assert.ok(env.arbre().includes("/Envoi Pennylane/Bello Mio/2026-09-29 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf"), "PDF sans extension lu grâce à son type MIME");
    assert.ok(j.some((l) => l[5] === "FC0140.xml" && l[6] === "facturx" && l[12] === "journal"), "XML Factur-X journalisé seulement");
    assert.equal(env.arbre().filter((x) => /FC0140/.test(x)).length, 1, "seul le PDF est rangé");
    const envoi = env.ctx.dossierEnvoi("Piccola Mia").getFiles();
    while (envoi.hasNext()) { const f = envoi.next(); assert.equal(f.getMimeType(), "application/pdf", "type MIME d'après l'extension, pas celui du mail : " + f.getName()); }
  });

  test("plateforme de facturation dans la passe : fournisseur lu dans le document, jamais de ligne « à compléter »", () => {
    const env = creerEnvironnement();
    env.fil([{ date: "2026-08-26T12:00:00", from: "ne-pas-repondre@facture.cmb.fr", to: "facture@bellomio.fr", subject: "BR NUISIBLES BOURCE RICHARD : facture FAC00054", pieces: [{ nom: "FAC00054.pdf", contenu: env.fixture("brnuisibles_facture_FAC00054_bello") }] }]);
    env.fil([{ date: "2026-08-27T12:00:00", from: "ne-pas-repondre@facture.cmb.fr", to: "facture@bellomio.fr", subject: "Votre facture", pieces: [{ nom: "f.pdf", contenu: "Facture n° 12 Total HT 10,00 TVA 2,00 Total TTC 12,00 SARL SASHA Date : 27/08/2026" }] }]);
    const st = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "pf" });
    assert.equal(st.envoi, 1);
    assert.ok(env.arbre().includes("/Envoi Pennylane/Bello Mio/2026-08-26 — BR Nuisibles — Facture n° FAC00054 — 294.80 EUR.pdf"), env.arbre().join("\n"));
    assert.equal(st.a_verifier, 1);
    assert.ok(env.feuille("Journal").some((l) => l[12] === "a_verifier" && /plateforme, fournisseur non lu/.test(l[14])));
    assert.equal(env.fournisseurs().length, 0, "aucune ligne « Cmb » proposée");
  });

  test("OCR muet : un nouvel essai, puis « texte illisible » avec l'erreur dans le journal, message traité", () => {
    const env = creerEnvironnement();
    mael(env);
    env.pannes.ocrErreurs = 1;
    const s1 = env.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "o1" });
    assert.equal(s1.envoi, 1, "repris au second essai");
    assert.ok(env.pannes.pauses.includes(2000));
    const env2 = creerEnvironnement();
    mael(env2);
    env2.pannes.ocrErreurs = 2;
    const s2 = env2.ctx.traiterMessages({ depuis: DEPUIS, simulation: false, cleReprise: "o2" });
    assert.equal(s2.a_verifier, 1);
    assert.ok(env2.feuille("Journal").some((l) => /texte illisible \(OCR : .*conversion failed/.test(l[14])), JSON.stringify(env2.feuille("Journal").map((l) => l[14])));
    assert.equal(env2.feuille("Messages traités").length, 1);
  });

  test("reparerTypesFichiers : simulation dans l'onglet « Types », puis réel (même identifiant, type corrigé)", () => {
    const env = creerEnvironnement();
    const mauvais = env.ctx.dossierDuChemin(["Bello Mio", "Masse", "2026"]).createFile("2026-09-23 — Masse — Facture n° FACN012603733 — 56.76 EUR.pdf", "%PDF", "application/others");
    env.ctx.dossierDuChemin(["Bello Mio", "Masse", "2026"]).createFile("2026-09-09 — Masse — Facture n° 127 — 137.52 EUR.pdf", "%PDF", "application/pdf");
    env.ctx.dossierEnvoi("Piccola Mia").createFile("2026-10-02 — Maël Distribution — Facture n° FC0140 — 906.39 EUR.pdf", "%PDF", "application/octet-stream");
    const st = env.ctx.reparerTypesFichiers();
    assert.equal(st.aReparer, 2);
    assert.equal(mauvais.getMimeType(), "application/others", "simulation : rien ne change");
    const plan = env.feuille("Types");
    assert.equal(plan.length, 2);
    assert.ok(plan.every((l) => l[4] === "application/pdf" && l[5] === "simulation"));
    env.ctx.reparerTypesFichiers();
    assert.equal(env.feuille("Types").length, 2, "relancer ne redouble pas");
    const reel = env.ctx.reparerTypesFichiersReel();
    assert.equal(reel.faits, 2);
    assert.equal(reel.erreurs, 0);
    assert.equal(env.fichierParId(mauvais.getId()).getMimeType(), "application/pdf");
    assert.equal(env.fichierParId(mauvais.getId()).getName(), "2026-09-23 — Masse — Facture n° FACN012603733 — 56.76 EUR.pdf");
    assert.ok(env.feuille("Types").every((l) => l[5] === "fait"));
  });

  test("reindexerArchive : Index reconstruit depuis le Drive (chemins, fournisseurs canoniques, numéros en texte), reprise après la limite", () => {
    const env = creerEnvironnement();
    const f1 = env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf", "a", "application/pdf");
    const f2 = env.ctx.dossierEnvoi("Bello Mio").createFile("2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf", "b", "application/pdf");
    const f3 = env.ctx.dossierDuChemin(["Rattrapage à valider", "Piccola Mia"]).createFile("2026-10-02 — Maeldistribution — Facture n° FC0140 — 906.39 EUR.pdf", "c", "application/pdf");
    // un ancien Index périmé : chemin faux, fournisseur à l'ancien nom, numéro converti en nombre par le Sheet
    env.ctx.indexAjouter({ fichierId: f1.getId(), md5: "x", etablissement: "Bello Mio", fournisseur: "Wanadoo", numero: null, date: "2026-09-01", montant: "120.00", nom: "ancien.pdf", chemin: "Bello Mio/Wanadoo/09 - Septembre 2026", archive: "" });
    env.ctx.indexAjouter({ fichierId: f2.getId(), md5: "y", etablissement: "Bello Mio", fournisseur: "Cheville 35", numero: 113789, date: "2026-08-31", montant: "375.64", nom: f2.getName(), chemin: "Envoi Pennylane/Bello Mio", archive: "" });
    env.ctx.journalVider();
    assert.equal(env.onglet("Index")._format, "@", "colonnes de l'Index au format texte");
    env.ctx.CONFIG.limiteMs = -1;
    env.ctx.reindexerArchive();
    assert.ok(env.journalLog.some((l) => /Index vidé/.test(l)));
    assert.ok(env.journalLog.some((l) => /PAS FINI/.test(l)));
    assert.equal(env.props["reindex.encours"], "1");
    env.ctx.CONFIG.limiteMs = 5 * 60 * 1000;
    const st = env.ctx.reindexerArchive();
    assert.equal(st.ajoutes, 3);
    assert.ok(!env.props["reindex.encours"]);
    const index = env.feuille("Index");
    assert.equal(index.length, 3);
    const l1 = index.find((l) => l[0] === f1.getId()), l2 = index.find((l) => l[0] === f2.getId()), l3 = index.find((l) => l[0] === f3.getId());
    assert.equal(l1[8], "Bello Mio/Self Stockage/2026");
    assert.equal(l1[3], "Self Stockage");
    assert.equal(l1[7], f1.getName());
    assert.equal(l2[4], "00113789", "numéro gardé en texte");
    assert.equal(l2[10], "Bello Mio/Cheville 35/2026", "archive prévue pour un fichier de Envoi");
    assert.ok(l2[11], "date d'arrivée dans Envoi");
    assert.equal(l3[3], "Maël Distribution", "fournisseur canonique d'après le nom");
    assert.equal(l3[10], "Piccola Mia/Maël Distribution/2026", "archive prévue pour le transit");
    assert.ok(index.every((l) => /^[0-9a-f]{32}$/.test(l[1])), "MD5 relus dans Drive");
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
  });

  test("Index : écriture par identifiant de fichier même après un tri de l'onglet ; journaux de clôture suivis ; renommage mis à jour", () => {
    const env = creerEnvironnement();
    const a = env.ctx.dossierDuChemin(["Bello Mio", "Metro", "2026"]).createFile("2026-09-12 — Metro — Facture n° 123 — 50.00 EUR.pdf", "a", "application/pdf");
    const b = env.ctx.dossierDuChemin(["Bello Mio", "Self Stockage", "2026"]).createFile("2026-09-01 — Wanadoo — Facture n° 2026-091 — 120.00 EUR.pdf", "b", "application/pdf");
    const j = env.ctx.dossierDuChemin(["Piccola Mia", "Journaux de clôture"]).createFile("journal-caisse-2026-09.pdf", "caisse", "application/pdf");
    env.ctx.indexerExistant();
    env.onglet("Index").sort(8);   // tri par nom : les numéros de ligne mémorisés sont faux
    env.ctx.deplacerFichier(a, ["Piccola Mia", "Metro", "2026"]);
    const index = env.feuille("Index");
    assert.equal(index.find((l) => l[0] === a.getId())[8], "Piccola Mia/Metro/2026");
    assert.equal(index.find((l) => l[0] === b.getId())[8], "Bello Mio/Self Stockage/2026", "l'autre ligne n'a pas été touchée");
    env.ctx.deplacerJournauxDeCloture();
    assert.equal(env.feuille("Index").find((l) => l[0] === j.getId())[8], "Journaux de caisse iFratelli/Piccola Mia");
    // renommage : fournisseur, numéro, date, montant relus dans le nouveau nom
    const c = env.ctx.fournisseursClasseur(true); const fs = c.getSheetByName("Fournisseurs");
    fs.appendRow(["Self Stockage", "Wanadoo", "", "FR53922735535", "Bello", "", "", "oui", ""]);
    fs.appendRow(["Metro", "", "metro.fr", "", "Les deux", "", "", "oui", ""]);
    env.ctx.renommerArchive();
    env.ctx.renommerArchiveReel();
    const lb = env.feuille("Index").find((l) => l[0] === b.getId());
    assert.equal(lb[7], "2026-09-01 — Self Stockage — Facture n° 2026-091 — 120.00 EUR.pdf");
    assert.equal(lb[3], "Self Stockage", "colonne Fournisseur mise à jour");
    assert.ok(env.ctx.trouverDoublon(env.ctx.indexCharger(), { fournisseur: "Self Stockage", etablissement: "Bello Mio", type: "facture", numero: "2026-091", montant: "1.00" }, "zzz"), "les clés anti-doublon suivent le nouveau nom");
  });
});
