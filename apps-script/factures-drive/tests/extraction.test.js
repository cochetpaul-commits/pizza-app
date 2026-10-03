"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { chargerContexte, lireFixtures } = require("./charger");

const ctx = chargerContexte();
const cas = lireFixtures();
// Les objets viennent d'un autre contexte VM : on les aplatit avant deepEqual (prototypes différents)
const plain = (x) => JSON.parse(JSON.stringify(x));
const idx = ctx.indexerFournisseurs(ctx.listeFournisseursParDefaut());
const fournisseur = (from, subject, texte) => ctx.extraireFournisseur(idx, from, subject, texte);

describe("analyserDocument + decider sur le jeu de factures", () => {
  for (const c of cas) {
    test(c.nom + (c.synthetique ? " (texte synthétique)" : ""), () => {
      const a = ctx.analyserDocument({ idx, texte: c.texte, from: c.mail.from, subject: c.mail.subject, nomPiece: c.mail.nomPiece, dateMail: c.mail.dateMail, extension: ".pdf" });
      const d = ctx.decider(a);
      const att = c.attendu;
      for (const champ of ["type", "etablissement", "fournisseur", "numero", "date", "montant", "nom"]) {
        if (champ in att) assert.equal(a[champ], att[champ], champ + " : " + JSON.stringify(a, null, 1));
      }
      assert.equal(d.destination, att.destination, "destination (" + d.raison + ") : " + JSON.stringify(a));
      assert.deepEqual(plain(d.chemin), att.chemin, "chemin");
      assert.deepEqual(plain(d.archive), att.archive, "archive");
      if (att.destination === "envoi") assert.deepEqual(plain(a.raisons), [], "aucune raison de douter : " + a.raisons.join(", "));
    });
  }
});

describe("montant TTC", () => {
  test("HT + TVA = TTC prime sur le plus grand nombre", () => {
    assert.equal(ctx.trouverMontantTTC("Total HT 123,45 TVA 24,69 Total TTC 148,14 Capital 50 000,00"), "148.14");
  });
  test("sans bloc de totaux cohérent : plus grand montant après un mot clé", () => {
    assert.equal(ctx.trouverMontantTTC("Total global 790,04 lignes 590,57 347,59"), "790.04");
  });
  test("avoir négatif, signe après le nombre", () => {
    assert.equal(ctx.trouverMontantTTC("Net à payer 148,12- HT 140,40- TVA 7,72-"), "-148.12");
  });
  test("taux de TVA jamais retenu, plafond 100 000", () => {
    assert.equal(ctx.trouverMontantTTC("Total TTC 20,00 % 5,50 % 448544,00"), null);
  });
  test("pas de texte", () => {
    assert.equal(ctx.trouverMontantTTC(""), null);
  });
});

describe("date", () => {
  test("deux dates collées par l'OCR", () => assert.equal(ctx.trouverDateFacture("N° facture Date Echéance 123 30/09/202631/10/2026"), "2026-09-30"));
  test("date en toutes lettres", () => assert.equal(ctx.trouverDateFacture("Date de facture : 3 oct. 2026"), "2026-10-03"));
  test("facture n° X du JJ.MM.AAAA", () => assert.equal(ctx.trouverDateFacture("FACTURE N° 8801805886 du 02.10.2026"), "2026-10-02"));
  test("rien", () => assert.equal(ctx.trouverDateFacture("Bonjour"), null));
});

describe("numéro", () => {
  test("Facture N° FC0140", () => assert.equal(ctx.trouverNumeroFacture("Facture N° FC0140 Date"), "FC0140"));
  test("Invoice #", () => assert.equal(ctx.trouverNumeroFacture("Invoice # INV-2026-0042 Due"), "INV-2026-0042"));
  test("n° pièce", () => assert.equal(ctx.trouverNumeroFacture("N° PIECE N° CLIENT DATE 201018858 29667"), "201018858"));
  test("relevé sans numéro de facture", () => assert.equal(ctx.trouverNumeroFacture("Relevé client Pièce 14054490"), null));
});

describe("établissement", () => {
  test("TVA Bello", () => assert.equal(ctx.detecterEtablissement("Client FR78913217386"), "Bello Mio"));
  test("TVA Piccola avec espaces", () => assert.equal(ctx.detecterEtablissement("FR 40 909 382 640"), "Piccola Mia"));
  test("mots seuls", () => assert.equal(ctx.detecterEtablissement("SARL SASHA 3 place du Poncel"), "Bello Mio"));
  test("contradictoire -> inconnu", () => assert.equal(ctx.detecterEtablissement("SARL SASHA et SARL FRATELLI"), null));
  test("TVA l'emporte sur les mots", () => assert.equal(ctx.detecterEtablissement("Bello Mio FR40909382640"), "Piccola Mia"));
  test("rien", () => assert.equal(ctx.detecterEtablissement("Facture n° 1"), null));
});

describe("fournisseur : liste de référence seulement", () => {
  test("par domaine de l'expéditeur", () => assert.equal(fournisseur("x@carniato.com", "", "").nom, "Carniato"));
  test("sous-domaine ramené au domaine", () => assert.equal(fournisseur("noreply@mail.zenchef.com", "", "").nom, "Zenchef"));
  test("VIF -> Cheville 35 par le domaine vif.fr", () => assert.equal(fournisseur("noreply@vif.fr", "Facture CHEVILLE 35", "").nom, "Cheville 35"));
  test("Tom Martin reste Cheville 35 (ses tarifs sont de type autre, jamais rangés)", () => {
    assert.equal(fournisseur("tom.martin@maison-hardy.fr", "Maison Hardy : Tarif 40", "").nom, "Cheville 35");
    assert.equal(ctx.detecterTypeDocument("Tarif semaine 40 et promotions en cours", null), "autre");
  });
  test("identifiant lu sur le document avant tout", () => {
    assert.equal(fournisseur("inconnu@gmail.com", "", "SAS MAEL N.I.I. : FR36828779454").nom, "Maël Distribution");
    assert.equal(fournisseur("inconnu@gmail.com", "", "SIRET: 829 192 319 00020").nom, "Cheville 35");
  });
  test("notre TVA n'identifie pas un fournisseur ; domaine inconnu -> null, nom proposé", () => {
    const r = fournisseur("inconnu@societe-x.fr", "", "FR78913217386");
    assert.equal(r.nom, null);
    assert.equal(r.source, "inconnu");
    assert.equal(r.propose, "Societe-x");
  });
  test("le domaine n'invente jamais un nom", () => assert.equal(fournisseur("facture@mail.sumup.com", "Reçu", "").nom, null));
  test("transfert interne : nom ou variante dans l'objet", () => {
    assert.equal(fournisseur("pierre.cochet@gmail.com", "Fwd: facture Leroy Merlin", "").nom, "Leroy Merlin");
    assert.equal(fournisseur("Paul <cochetpaul@bellomio.fr>", "Fwd: Maeldistribution", "").nom, "Maël Distribution");
    assert.equal(fournisseur("pierre.cochet@gmail.com", "Fwd: truc", "").nom, null);
  });
  test("une entrée inactive n'est pas retenue", () => {
    const liste = ctx.listeFournisseursParDefaut();
    liste.find((f) => f.nom === "Carniato").actif = "non";
    assert.equal(ctx.extraireFournisseur(ctx.indexerFournisseurs(liste), "x@carniato.com", "", "").nom, null);
  });
  test("nom canonique d'un ancien dossier", () => {
    assert.equal(ctx.nomCanonique(idx, "Maeldistribution"), "Maël Distribution");
    assert.equal(ctx.nomCanonique(idx, "Hyg-up"), "Hyg'Up");
    assert.equal(ctx.nomCanonique(idx, "Metro-gsc"), "Metro");
    assert.equal(ctx.nomCanonique(idx, "Sc-m2"), "SC M2");
    assert.equal(ctx.nomCanonique(idx, "Dossier inconnu"), null);
  });
  test("ligne « à compléter » pour un inconnu", () => {
    const l = ctx.ligneACompleter({ from: "compta@castorama.fr", subject: "Ticket", texte: "TVA FR12345678901" });
    assert.equal(l.nom, "Castorama");
    assert.deepEqual(plain(l.domaines), ["castorama.fr"]);
    assert.deepEqual(plain(l.identifiants), ["FR12345678901"]);
    assert.equal(l.actif, "à compléter");
  });
  test("aller-retour ligne de Sheet", () => {
    const e = ctx.entreeDepuisLigne(["Maël Distribution", "Maeldistribution; Mael", "maeldistribution.fr", "FR36828779454", "Les deux", "", "", "oui", ""]);
    assert.deepEqual(plain(ctx.ligneDepuisEntree(e)), ["Maël Distribution", "Maeldistribution; Mael", "maeldistribution.fr", "FR36828779454", "Les deux", "", "", "oui", ""]);
  });
});

describe("type de document", () => {
  test("relevé", () => assert.equal(ctx.detecterTypeDocument("Relevé client L.C.R. 14054490", "790.04"), "releve"));
  test("mandat", () => assert.equal(ctx.detecterTypeDocument("Mandat de prélèvement SEPA RUM : X", null), "mandat"));
  test("avoir par montant négatif", () => assert.equal(ctx.detecterTypeDocument("Facture N° FC0126 Net à payer -4,92", "-4.92"), "avoir"));
  test("facture avec le mot attestation dedans (Carniato)", () => assert.equal(ctx.detecterTypeDocument("FACTURE N° PIECE 201018858 ATTESTATION FACTURE TOTAL T.T.C.", "347.59"), "facture"));
  test("texte illisible", () => assert.equal(ctx.detecterTypeDocument("", null), "autre"));
});

describe("nom de fichier (format historique)", () => {
  test("facture complète", () => {
    assert.equal(ctx.construireNom({ type: "facture", date: "2026-09-29", fournisseur: "Carniato", numero: "201018858", montant: "347.59" }, ".pdf"),
      "2026-09-29 — Carniato — Facture n° 201018858 — 347.59 EUR.pdf");
  });
  test("sans numéro ni montant, date de secours", () => {
    assert.equal(ctx.construireNom({ type: "facture", date: null, dateSecours: "2026-10-02", fournisseur: "Leroymerlin", numero: null, montant: null }, ".pdf"),
      "2026-10-02 — Leroymerlin — Facture.pdf");
  });
  test("relecture d'un nom existant", () => {
    assert.deepEqual(plain(ctx.analyserNomFichier("2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf")),
      { date: "2026-08-31", fournisseur: "Cheville 35", type: "facture", numero: "00113789", montant: "375.64" });
    assert.deepEqual(plain(ctx.analyserNomFichier("2026-10-01 — Carniato — Relevé LCR 14054490 — 790.04 EUR.pdf")),
      { date: "2026-10-01", fournisseur: "Carniato", type: "releve", numero: "14054490", montant: "790.04" });
    assert.equal(ctx.analyserNomFichier("Fournisseur_01102026.pdf"), null);
  });
});
