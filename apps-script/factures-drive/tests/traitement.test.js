"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { creerEnvironnement } = require("./bouchons");

const plain = (x) => JSON.parse(JSON.stringify(x));

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
  return env;
}

describe("passe réelle sur une boîte mêlant les cas du brief", () => {
  const env = boite();
  const stats = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "test" });
  const arbre = env.arbre();

  test("les vraies factures vont dans les dossiers synchronisés, une seule fois", () => {
    assert.ok(arbre.includes("/Piccola Mia/Maeldistribution/10 - Octobre 2026/2026-10-02 — Maeldistribution — Facture n° FC0140 — 906.39 EUR.pdf"), arbre.join("\n"));
    assert.equal(arbre.filter((x) => x.includes("FC0140")).length, 1, "FC0140 rangée une seule fois (3 messages, 2 fils)");
    assert.ok(arbre.includes("/Bello Mio/Maeldistribution/10 - Octobre 2026/2026-10-02 — Maeldistribution — Facture n° FC0126 — -4.92 EUR.pdf"));
    assert.ok(arbre.includes("/Bello Mio/Cheville 35/09 - Septembre 2026/2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf"));
    assert.ok(arbre.includes("/Bello Mio/Leroymerlin/10 - Octobre 2026/2026-10-02 — Leroymerlin — Facture — 38.79 EUR.pdf"));
    assert.ok(arbre.includes("/Bello Mio/TerreAzur/10 - Octobre 2026/2026-10-02 — TerreAzur — Facture n° 8801805886 — 139.25 EUR.jpg"), "photo de facture");
  });
  test("le relevé Piccola reçu sur l'adresse Bello va dans _Hors Pennylane / Piccola Mia", () => {
    assert.ok(arbre.includes("/_Hors Pennylane/Piccola Mia/Carniato/10 - Octobre 2026/2026-10-01 — Carniato — Relevé n° 14054661 — 138.80 EUR.pdf"), arbre.join("\n"));
  });
  test("tarifs Maison Hardy et OCR raté vont dans _À vérifier, jamais dans Bello Mio", () => {
    const aVerifier = arbre.filter((x) => x.startsWith("/_À vérifier/"));
    assert.equal(aVerifier.length, 2, arbre.join("\n"));
    assert.ok(aVerifier.some((x) => x.includes("Cheville 35 — Facture")), "tarif Hardy, fournisseur Cheville 35 par le domaine");
    assert.ok(aVerifier.some((x) => x.includes("Hyg-up — Facture.pdf")), "OCR raté");
    assert.equal(arbre.filter((x) => x.startsWith("/Bello Mio/") && (x.includes("Tarif") || x.includes("Hyg-up"))).length, 0);
  });
  test("devis et mail interne : rien n'est rangé", () => {
    assert.equal(arbre.filter((x) => x.includes("Thermifroid") || x.includes("facture-client")).length, 0);
    assert.equal(stats.ignores, 1, "mail parti de contact@ sans être un transfert");
    assert.equal(stats.journal, 1, "devis au journal seulement");
  });
  test("journal : une ligne par pièce, doublons et corps de mail tracés", () => {
    const lignes = env.feuille("Journal");
    const colDestination = 12, colRaison = 14, colPiece = 5;
    assert.equal(lignes.filter((l) => l[colDestination] === "doublon").length, 2, "FC0140 deux fois en doublon");
    assert.ok(lignes.some((l) => l[colPiece] === "(corps du mail)" && l[colDestination] === "a_verifier"), "facture Zenchef dans le corps");
    assert.ok(lignes.some((l) => l[colDestination] === "a_verifier" && /texte illisible/.test(l[colRaison])));
    assert.ok(lignes.some((l) => l[colDestination] === "journal" && l[6] === "devis"));
    assert.equal(lignes.filter((l) => l[colDestination] === "sync").length, 5);
  });
  test("chaque message est mémorisé ; une seconde passe ne refait rien", () => {
    assert.equal(env.feuille("Messages traités").length, stats.messages);
    const stats2 = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "test" });
    assert.equal(stats2.messages, 0);
    assert.equal(stats2.deja, stats.messages);
    assert.deepEqual(env.arbre(), arbre);
  });
  test("le fichier « À vérifier » porte la raison et le lien du mail", () => {
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const av = racine.getFoldersByName("_À vérifier").next();
    const mois = av.getFoldersByName("10 - Octobre 2026").next();
    const f = mois.getFiles().next();
    assert.match(f.getDescription(), /À vérifier : texte illisible \(OCR\).*mail : https:\/\/mail\.google\.com/);
  });
  test("le libellé « traite » est posé sur les fils traités", () => {
    assert.ok(env.fils.filter((t) => t._labels.includes("traite")).length >= 8);
  });
  test("l'index anti-doublon retient MD5, fournisseur+numéro et fournisseur+date+montant", () => {
    const index = env.feuille("Index");
    assert.ok(index.length >= 7);
    assert.ok(index.every((l) => /^[0-9a-f]{32}$/.test(l[1])), "MD5 hexadécimal");
    assert.ok(index.some((l) => l[3] === "Cheville 35" && String(l[4]) === "00113789" && l[6] === "375.64"));
  });
});

describe("rattrapage en simulation puis en réel", () => {
  const env = boite();
  const sim = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: true, cleReprise: "sim" });
  test("la simulation n'écrit rien dans Drive ni dans « Messages traités »", () => {
    assert.deepEqual(env.arbre(), []);
    assert.equal(env.feuille("Messages traités").length, 0);
    assert.equal(env.feuille("Journal").length, 0);
    assert.ok(env.feuille("Simulation").length >= 10);
    assert.equal(sim.sync, 5);
    assert.equal(sim.doublons, 2, "doublons repérés même en simulation");
    assert.ok(env.feuille("Simulation").every((l) => l[18] === "simulation"));
  });
  test("le réel qui suit range tout, et une pièce déjà rangée n'est pas réécrite", () => {
    const reel = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "reel" });
    assert.equal(reel.sync, 5);
    assert.equal(env.arbre().length, 5 + 1 + 2, "5 factures, 1 relevé, 2 à vérifier");
  });
});

describe("limite de temps et reprise", () => {
  const env = boite();
  test("s'arrête avant 6 minutes, mémorise la position et reprend sans doublon", () => {
    env.ctx.CONFIG.limiteMs = -1;   // tout appel dépasse la limite : on s'arrête tout de suite
    const s1 = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "lim" });
    assert.equal(s1.messages, 0);
    assert.ok(Object.keys(env.props).some((k) => k.startsWith("reprise.lim.")));
    assert.ok(env.journalLog.some((l) => /PAS FINI/.test(l)));
    env.ctx.CONFIG.limiteMs = 5 * 60 * 1000;
    const s2 = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "lim" });
    assert.ok(s2.messages >= 11);
    assert.ok(!Object.keys(env.props).some((k) => k.startsWith("reprise.lim.")));
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
  });
});

describe("alerte hebdomadaire", () => {
  const env = boite();
  env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "al" });
  test("rien de plus de 3 jours : pas de mail ; vieux fichiers : un mail récapitulatif à Paul", () => {
    assert.equal(env.ctx.alerteAVerifier(), 0);
    assert.equal(env.mails.length, 0);
    const racine = env.racine.getFoldersByName("Factures iFratelli").next();
    const av = racine.getFoldersByName("_À vérifier").next();
    av.getFolders().next().getFiles().next()._cree = new Date(Date.now() - 5 * 86400000);
    assert.equal(env.ctx.alerteAVerifier(), 1);
    assert.equal(env.mails[0].to, "cochetpaul@bellomio.fr");
    assert.match(env.mails[0].body, /_À vérifier/);
  });
});

describe("indexation de l'existant", () => {
  const env = boite();
  test("les fichiers déjà rangés (ancien format de nom compris) entrent dans l'index et bloquent les doublons", () => {
    const racine = env.ctx.dossierDuChemin(["Bello Mio", "Cheville 35", "09 - Septembre 2026"]);
    racine.createFile("2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf", env.fixture("cheville35_facture_bello"), "application/pdf");
    env.ctx.dossierDuChemin(["Piccola Mia", "Maeldistribution", "10 - Octobre 2026"]).createFile("2026-10-02 — Maeldistribution — Facture n° FC0140 — 906.39 EUR.pdf", "autre contenu", "application/pdf");
    env.ctx.indexerExistant();
    assert.ok(env.journalLog.some((l) => /TERMINÉ/.test(l)));
    assert.equal(env.feuille("Index").length, 2);
    const stats = env.ctx.traiterMessages({ depuis: new Date("2026-08-01T00:00:00"), simulation: false, cleReprise: "idx" });
    assert.equal(stats.doublons, 4, "Cheville 35 (même MD5) et FC0140 x3 (fournisseur + numéro) reconnus");
    assert.equal(plain(env.arbre()).filter((x) => x.includes("FC0140") || x.includes("00113789")).length, 2);
  });
});
