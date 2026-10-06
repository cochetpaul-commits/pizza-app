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
  test("Tom Martin reste Cheville 35 (ses tarifs sont de type catalogue, journal seul)", () => {
    assert.equal(fournisseur("tom.martin@maison-hardy.fr", "Maison Hardy : Tarif 40", "").nom, "Cheville 35");
    assert.equal(ctx.detecterTypeDocument("Tarif semaine 40 et promotions en cours", null), "catalogue");
    assert.equal(ctx.estCatalogueParObjet("Maison Hardy : Tarif 40 et promotions", "Tarif S40.pdf"), true);
    assert.equal(ctx.estCatalogueParObjet("Votre facture et nos offres", "facture.pdf"), false);
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

describe("v4.3 : consigne, variantes d'établissement, expéditeurs journal seul, particuliers", () => {
  test("un total qui vaut TTC + consigne est écarté, même s'il est cohérent et répété", () => {
    const t = "Total HT 422,21 TVA 84,44 TOTAL TTC 506,65 CONSIGNE 30,00 TOTAL NET A PAYER 536,65 A payer 536,65";
    assert.equal(ctx.trouverMontantTTC(t), "506.65");
    const t2 = "Montant HT 494,81 TVA 98,96 Total TTC 593,77 Emballages consignés 30,00 Net à payer 623,77";
    assert.equal(ctx.trouverMontantTTC(t2), "593.77");
  });
  test("sans consigne, rien ne change", () => {
    assert.equal(ctx.trouverMontantTTC("Total HT 100,00 TVA 20,00 Total TTC 120,00 Net à payer 120,00 Caution 0,00"), "120.00");
  });
  test("montant après « TTC à payer » ou « en EUR »", () => {
    assert.equal(ctx.trouverMontantTTC("293,34 20,00 58,67 352,01 NET A PAYER EN EUR 352,01 10301"), "352.01");
    assert.equal(ctx.trouverMontantTTC("Montant TTC à payer 245,10 €"), "245.10");
  });
  test("variantes de la colonne Établissement par défaut", () => {
    for (const v of ["Bello", "bello mio", "BELLO MIO", "Sasha", "BM", "bm", "Bello Mio (SARL SASHA)"]) assert.equal(ctx.etablissementParDefaut(v), "Bello Mio", v);
    for (const v of ["Piccola", "piccola mia", "Fratelli", "I Fratelli", "PM", "pm"]) assert.equal(ctx.etablissementParDefaut(v), "Piccola Mia", v);
    for (const v of ["Les deux", "", "  ", "?", "les 2"]) assert.equal(ctx.etablissementParDefaut(v), null, v);
  });
  test("la raison « établissement inconnu » montre la valeur de la liste", () => {
    const liste = ctx.listeFournisseursParDefaut();
    liste.find((f) => f.nom === "Zenchef").etab = "Les deux";
    const a = ctx.analyserDocument({ idx: ctx.indexerFournisseurs(liste), texte: "Facture ZCINV-FEE-67691 Zenchef Total TTC 7,68 € HT 6,40 TVA 1,28 Date de facture : 02/10/2026", from: "billing@zenchef.com", subject: "Facture", nomPiece: "x.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.match(a.raisons.join(","), /établissement inconnu \(liste : « Les deux »\)/);
    liste.find((f) => f.nom === "Zenchef").etab = "BM";
    const b = ctx.analyserDocument({ idx: ctx.indexerFournisseurs(liste), texte: "Facture ZCINV-FEE-67691 Zenchef Total TTC 7,68 € HT 6,40 TVA 1,28 Date de facture : 02/10/2026", from: "billing@zenchef.com", subject: "Facture", nomPiece: "x.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(b.etablissement, "Bello Mio");
    assert.equal(b.sourceEtablissement, "liste");
    assert.deepEqual(plain(b.raisons), []);
  });
  test("DocuSign, Vinted, La Poste, JDC, Up Coop : journal seul ; notifications Pennylane : plateforme (v4.6)", () => {
    const cas = [["dse@eumail.docusign.net", "contrat"], ["noreply@vinted.fr", "notification"],
                 ["system@jdc.fr", "notification"], ["emilie.tremblais@up.coop", "bon_commande"], ["lettre@laposte.net", "notification"]];
    for (const [from, type] of cas) {
      const a = ctx.analyserDocument({ idx, texte: "Toutes les parties ont complété « JDC SA - CONTRAT Q-485528 SASHA » Total TTC 2 400,00 € HT 2 000,00 TVA 400,00 Facture n° 12345", from, subject: "Complétée", nomPiece: "doc.pdf", dateMail: "2026-09-30", extension: ".pdf" });
      assert.equal(a.type, type, from);
      assert.equal(ctx.decider(a).destination, "journal", from);
    }
    assert.equal(ctx.typeParExpediteur("facturation@pennylane.com"), null, "les factures d'abonnement Pennylane restent traitées");
  });
  test("contrat signé et épreuve d'imprimeur reconnus dans le texte", () => {
    assert.equal(ctx.detecterTypeDocument("Enveloppe complétée via DocuSign. Signature électronique de l'avenant.", null), "contrat");
    assert.equal(ctx.detecterTypeDocument("Diazo Communication - PDF de contrôle pour validation avant impression. Menus été 2026.", null), "epreuve");
  });
  test("particulier sans SIRET, ni TVA, ni montant : courrier au journal ; avec un montant ou un identifiant : traitement normal", () => {
    const sans = ctx.analyserDocument({ idx, texte: "Bonjour, ci-joint mon CV et ma lettre de motivation pour le poste de serveur. Cordialement, Julie", from: "julie.m@gmail.com", subject: "Candidature", nomPiece: "CV.pdf", dateMail: "2026-09-10", extension: ".pdf" });
    assert.equal(sans.type, "courrier");
    assert.equal(ctx.decider(sans).destination, "journal");
    const avec = ctx.analyserDocument({ idx, texte: "Facture n° 2026-18 Prestation DJ soirée du 12/09 Total TTC 450,00 € HT 375,00 TVA 75,00 SIRET 123 456 789 00012", from: "dj.bob@hotmail.fr", subject: "Facture", nomPiece: "f.pdf", dateMail: "2026-09-15", extension: ".pdf" });
    assert.equal(avec.type, "facture");
    assert.equal(ctx.decider(avec).destination, "a_verifier", "fournisseur inconnu : à vérifier, comme avant");
    const devis = ctx.analyserDocument({ idx, texte: "Devis n° 42 pour le mariage du 20 juin : 25 personnes, menu à 45 € par personne", from: "cliente@icloud.com", subject: "Mariage", nomPiece: "devis.pdf", dateMail: "2026-05-10", extension: ".pdf" });
    assert.equal(ctx.decider(devis).destination, "journal");
  });
});

describe("v4.4 : net à payer et bon de commande", () => {
  test("le net à payer répété l'emporte sur le TTC cohérent quand consignes et déconsignes s'en mêlent", () => {
    const t = "615.76 113.49 729.25 CONSIGNE 30.00 A payer: -64.20 TOTAL NET A PAYER 17/08/2026 695.05 BELLO MIO 2.46 759.25 695.05";
    assert.equal(ctx.trouverMontantTTC(t), "695.05");
  });
  test("sans consigne, le net à payer cohérent reste le TTC", () => {
    assert.equal(ctx.trouverMontantTTC("Total HT 131,99 TVA 7,26 Net à payer : 139,25 EUR 131,99 7,26 131,99"), "139.25");
  });
  test("« Bon de commande n° » avec total TTC : bon de commande", () => {
    assert.equal(ctx.detecterTypeDocument("Bon de commande n°99000908 du 25/09/2026 Total HT 858,14 € TVA 171,63 € Total TTC 1 029,77 €", "1029.77"), "bon_commande");
    assert.equal(ctx.detecterTypeDocument("Facture N° 127999 Cde N°99000908 du 25/09/2026 Total TTC 1 155,24 €", "1155.24"), "facture", "une facture qui cite une commande reste une facture");
  });
});

describe("v4.5 : index des fournisseurs, valeurs libres, domaines grand public, identifiants fiscaux", () => {
  const ligne = (nom, opts) => Object.assign({ nom, variantes: [], domaines: [], identifiants: [], etab: "Bello", pennylaneBello: "", pennylanePiccola: "", actif: "oui" }, opts || {});
  test("une ligne active l'emporte toujours sur une ligne inactive de même clé, quel que soit l'ordre", () => {
    const inactive = ligne("Hyg-up", { actif: "non", identifiants: ["FR16911617124"], domaines: ["hygup.fr"], variantes: ["Hygup SAS"] });
    const active = ligne("Hyg'Up", { identifiants: ["FR16911617124"], domaines: ["hygup.fr"], variantes: ["Hygup SAS"] });
    for (const liste of [[inactive, active], [active, inactive]]) {
      const i = ctx.indexerFournisseurs(liste.map((l) => Object.assign({}, l)));
      assert.equal(ctx.nomCanonique(i, "Hyg-up"), "Hyg'Up");
      assert.equal(ctx.nomCanonique(i, "Hygup SAS"), "Hyg'Up");
      assert.equal(i.parIdentifiant.FR16911617124.nom, "Hyg'Up");
      assert.equal(i.parDomaine["hygup.fr"].nom, "Hyg'Up");
      assert.equal(ctx.extraireFournisseur(i, "x@hygup.fr", "", "").nom, "Hyg'Up");
      assert.deepEqual(plain(i.avertissements), []);
    }
    const seule = ctx.indexerFournisseurs([Object.assign({}, inactive)]);
    assert.equal(ctx.nomCanonique(seule, "Hyg-up"), null, "inactive seule : pas de nom canonique");
    assert.equal(ctx.entreeParNom(seule, "Hyg-up").nom, "Hyg-up", "mais l'entrée reste repérable");
  });
  test("deux lignes actives de même clé : la première est gardée, avertissement", () => {
    const i = ctx.indexerFournisseurs([ligne("SC M2", { domaines: ["scm2.fr"] }), ligne("Sc-m2", { domaines: ["sc-m2.fr"] })]);
    assert.equal(ctx.nomCanonique(i, "sc m2"), "SC M2");
    assert.equal(i.avertissements.length, 1);
    assert.match(i.avertissements[0], /nom « scm2 ».*SC M2.*Sc-m2/);
  });
  test("valeurs libres de la colonne établissement", () => {
    const inter = (v) => plain(ctx.interpreterEtablissement(v));
    assert.equal(inter("Bello Mio").etab, "Bello Mio");
    assert.equal(inter("sasha").etab, "Bello Mio");
    assert.equal(inter("PM").etab, "Piccola Mia");
    assert.equal(inter("fratelli").etab, "Piccola Mia");
    assert.ok(inter("les deux").lesDeux);
    assert.ok(inter("perso").inactif);
    assert.ok(inter("Pas besoin").inactif);
    assert.equal(inter("bon de commande").typeForce, "bon_commande");
    assert.ok(inter("je sais pas").inconnu);
    assert.equal(inter("").etab, null);
    const i = ctx.indexerFournisseurs([ligne("Cmb", { etab: "perso", domaines: ["cmb.fr"] }), ligne("Up Coop", { etab: "bon de commande", domaines: ["up.coop"] }), ligne("Metro", { etab: "je sais pas", domaines: ["metro.fr"] })]);
    assert.equal(ctx.nomCanonique(i, "Cmb"), null, "perso = inactif");
    assert.equal(ctx.extraireFournisseur(i, "x@cmb.fr", "", "").nom, null);
    assert.equal(i.parDomaine["up.coop"].typeForce, "bon_commande");
    assert.equal(ctx.extraireFournisseur(i, "x@metro.fr", "", "").nom, "Metro", "valeur inconnue : la ligne reste active");
    assert.equal(ctx.etablissementParDefaut("je sais pas"), null);
    assert.equal(i.avertissements.length, 1);
    assert.match(i.avertissements[0], /Metro.*je sais pas/);
    const a = ctx.analyserDocument({ idx: i, texte: "Facture n° 4455 Total TTC 120,00 € SARL SASHA Date : 01/10/2026", from: "x@up.coop", subject: "", nomPiece: "c.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(a.type, "bon_commande");
    assert.equal(ctx.decider(a).destination, "journal");
  });
  test("messagerie grand public : adresse complète reconnue, domaine seul ignoré avec avertissement", () => {
    const i = ctx.indexerFournisseurs([ligne("Self Stockage", { domaines: ["wanadoo.fr", "selfstockage@wanadoo.fr"] }), ligne("SDPF", { domaines: ["sdpfcompta@hotmail.com"] })]);
    assert.equal(i.parDomaine["wanadoo.fr"], undefined);
    assert.equal(i.avertissements.length, 1);
    assert.match(i.avertissements[0], /Self Stockage.*wanadoo\.fr/);
    assert.equal(ctx.extraireFournisseur(i, "Compta <sdpfcompta@hotmail.com>", "Facture", "").nom, "SDPF");
    assert.equal(ctx.extraireFournisseur(i, "selfstockage@wanadoo.fr", "", "").nom, "Self Stockage");
    assert.equal(ctx.extraireFournisseur(i, "autre@wanadoo.fr", "", "").nom, null);
    assert.equal(ctx.extraireFournisseur(i, "autre@hotmail.com", "", "").nom, null);
    const l = ctx.ligneACompleter({ from: "Jean <jean.dupont@orange.fr>", subject: "Facture", texte: "" });
    assert.deepEqual(plain(l.domaines), ["jean.dupont@orange.fr"]);
    assert.equal(l.nom, "jean.dupont");
  });
  test("numéro de facture : jamais un numéro de TVA, un SIRET ou un SIREN", () => {
    assert.equal(ctx.trouverNumeroFacture("SELF STOCKAGE SAS\nN° TVA FR53922735535\nFacture n° 2026-0912\nTotal TTC 120,00"), "2026-0912");
    assert.equal(ctx.trouverNumeroFacture("Facture N° FR53922735535 Total TTC 120,00"), null);
    assert.equal(ctx.trouverNumeroFacture("SIRET 922 735 535 00014\nNuméro : 92273553500014\nTotal TTC 120,00"), null, "SIRET");
    assert.equal(ctx.trouverNumeroFacture("SIREN 922735535\nFacture n° 922735535\nTotal TTC 120,00"), null, "SIREN");
    assert.equal(ctx.trouverNumeroFacture("SIREN 922735535\nFacture n° 922735536\nTotal TTC 120,00"), "922735536", "neuf chiffres différents du SIREN : numéro valable");
    assert.ok(ctx.estIdentifiantFiscal("FR 53 922735535", ""));
    assert.ok(!ctx.estIdentifiantFiscal("FC0140", ""));
  });
  test("titre « BC n° » ou « Purchase order » : bon de commande", () => {
    assert.equal(ctx.detecterTypeDocument("BC N° 99000858 du 20/09/2026 Fournisseur Hyg'Up Total TTC 1 029,77 €", "1029.77"), "bon_commande");
    assert.equal(ctx.detecterTypeDocument("PURCHASE ORDER PO-2026-18 Total 1 029,77 €", "1029.77"), "bon_commande");
  });
  test("nouveau nom de fichier au fournisseur canonique", () => {
    assert.equal(ctx.nomAvecFournisseur("2026-09-12 — Metro-gsc — Facture n° 123 — 50.00 EUR.pdf", "Metro"), "2026-09-12 — Metro — Facture n° 123 — 50.00 EUR.pdf");
    assert.equal(ctx.nomAvecFournisseur("2026-10-01 — Carniato — Relevé LCR 14054661 — 138.80 EUR.pdf", "Carniato SA"), "2026-10-01 — Carniato SA — Relevé LCR 14054661 — 138.80 EUR.pdf");
    assert.equal(ctx.nomAvecFournisseur("facture_scan.pdf", "Metro"), "facture_scan.pdf", "format inconnu : inchangé");
    assert.equal(ctx.nomAvecFournisseur("2026-09-15 — Transfert Pierre — Facture.pdf", "Metro"), "2026-09-15 — Metro — Facture.pdf");
  });
});

describe("v4.6 A : montants collés, séparateurs fins, O pour 0, tiret parasite, avoir positif, soldes", () => {
  test("une colonne isolée collée à la base HT par l'OCR ne fait pas un montant : la lecture non collée forme le triplet", () => {
    assert.equal(ctx.trouverMontantTTC("NET Code Base Taux Montant Total HT Total TTC A PAYER\nV0 5 121,58 5,5% 6,69\n121,58 0,00 128,27 0,00 128,27"), "128.27", "SDPF FA071465");
    assert.equal(ctx.trouverMontantTTC("Total TTC Acompte Net à payer 2\n2 105,40 Tx:2,00 5,80\n5,50 H.T. :\n105,40 2,15\nT.V.A. :\n5,80\n111,20\n111,20"), "111.20", "Maël FB9280");
  });
  test("la lecture collée reste acceptée quand aucun triplet n'existe sans elle", () => {
    assert.equal(ctx.trouverMontantTTC("Total HT 4 160,10 €\nTVA 228,81 €\nRéduite 4 160,10 € 5,50% 228,81 €\nTotal TTC 4 388,91 €"), "4388.91", "Le Père Billard");
    assert.equal(ctx.trouverMontantTTC("Montant total à payer 1 234,56 €"), "1234.56", "sans HT ni TVA : le plus grand après le mot clé");
  });
  test("espace fine U+202F / U+2009 et O lu pour un zéro", () => {
    assert.equal(ctx.trouverMontantTTC("Total HT 1 016,64 Total TVA 55,92 Total TTC 1 O72,56 Net à payer 1 072,56 €"), "1072.56", "Elien D63834");
    assert.equal(ctx.normaliserMontants("1 O72,56 et 2O,00"), "1 072,56 et 20,00");
  });
  test("un tiret de mise en page après le montant n'est pas un signe moins ; un signe collé ou suivi de € / fin de ligne l'est", () => {
    assert.equal(ctx.trouverMontantTTC("Net à payer : 128,27 - Echéance 14/08/2026 HT 121,58 TVA 6,69"), "128.27");
    assert.equal(ctx.detecterTypeDocument("Facture n° 1 Net à payer : 128,27 - Echéance", "128.27"), "facture");
    assert.equal(ctx.trouverMontantTTC("Net à payer 148,12- HT 140,40- TVA 7,72-"), "-148.12", "signe collé après");
    assert.equal(ctx.trouverMontantTTC("Total HT -4,66 TVA -0,26 Total TTC -4,92"), "-4.92", "signe collé avant");
    assert.equal(ctx.trouverMontantTTC("Total HT 140,40 - €\nTVA 7,72 - €\nNet à payer 148,12 -\n"), "-148.12", "signe suivi de € ou d'une fin de ligne");
  });
  test("un avoir imprimé en positif prend un montant négatif, et ne se confond pas avec la facture de même montant", () => {
    const a = ctx.analyserDocument({ idx, texte: "AVOIR N° AV2026-12\nMaël Distribution N.I.I. : FR36828779454\nBELLO MIO SASHA 3 place du Poncel\nTotal HT 100,00 TVA 5,50 Total TTC 105,50\nDate : 02/10/2026", from: "comptabilite@maeldistribution.fr", subject: "Avoir", nomPiece: "av.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(a.type, "avoir");
    assert.equal(a.montant, "-105.50");
    assert.equal(a.nom, "2026-10-02 — Maël Distribution — Facture n° AV2026-12 — -105.50 EUR.pdf");
    const facture = { fournisseur: "Maël Distribution", etablissement: "Bello Mio", type: "facture", numero: null, date: "2026-10-02", montant: "105.50" };
    const index = {}; for (const k of ctx.clesDoublon(facture, "m1")) index[k] = { nom: "facture" };
    assert.equal(ctx.trouverDoublon(index, Object.assign({}, a, { numero: null }), "m2"), null, "facture et avoir de même montant : pas un doublon");
  });
  test("solde antérieur et nouveau solde ne sont jamais le montant de la facture", () => {
    assert.equal(ctx.trouverMontantTTC("NET HT TOTAL TVA TOTAL TTC\n75,00 € 15,00 € A PAYER 90,00 €\n90,00 €\nSolde Antérieur 90,00 € Nouveau Solde 180,00 €"), "90.00", "Self Stockage 21741");
    assert.equal(ctx.nettoyerNumero("21741SARL"), "21741");
    assert.equal(ctx.nettoyerNumero("FC0140"), "FC0140");
  });
});

describe("v4.6 B : anti-doublon par établissement et par type, noms avec « (2) »", () => {
  const cle = (a) => Object.assign({ fournisseur: "Pennylane", type: "facture", numero: null, date: "2026-10-01", montant: "49.00" }, a);
  test("deux abonnements Pennylane (Bello et Piccola) du même jour au même prix ne sont pas des doublons", () => {
    const index = {}; for (const k of ctx.clesDoublon(cle({ etablissement: "Bello Mio" }), "p1")) index[k] = { nom: "bello" };
    assert.equal(ctx.trouverDoublon(index, cle({ etablissement: "Piccola Mia" }), "p2"), null);
    assert.ok(ctx.trouverDoublon(index, cle({ etablissement: "Bello Mio" }), "p3"), "même établissement, même jour, même montant : doublon");
  });
  test("deux pièces qui ont chacune un numéro ne sont des doublons que si c'est le même numéro", () => {
    const index = {}; for (const k of ctx.clesDoublon(cle({ etablissement: "Bello Mio", numero: "INV-1" }), "p1")) index[k] = { nom: "inv1", numero: "INV-1" };
    assert.equal(ctx.trouverDoublon(index, cle({ etablissement: "Bello Mio", numero: "INV-2" }), "p2"), null, "autre numéro, même date et montant");
    assert.ok(ctx.trouverDoublon(index, cle({ etablissement: "Bello Mio", numero: null }), "p3"), "sans numéro : la date et le montant suffisent");
    assert.ok(ctx.trouverDoublon(index, cle({ etablissement: "Piccola Mia", numero: "INV-1", montant: "1.00" }), "p4"), "même numéro chez le même fournisseur : doublon, quel que soit l'établissement lu");
  });
  test("un nom de fichier suffixé « (2) » reste lisible", () => {
    const n = ctx.analyserNomFichier("2026-10-03 — Elis — Facture n° 2610301-865398 — 352.01 EUR (2).pdf");
    assert.equal(n.numero, "2610301-865398");
    assert.equal(n.montant, "352.01");
    assert.equal(ctx.nomAvecFournisseur("2026-10-03 — Esker — Facture n° 1 — 1.00 EUR (2).pdf", "Elis"), "2026-10-03 — Elis — Facture n° 1 — 1.00 EUR (2).pdf");
  });
});

describe("v4.6 C : lignes « à compléter », plateformes, identifiants de l'émetteur, établissement, bons de livraison, noms complets", () => {
  const brn = cas.find((c) => c.nom === "brnuisibles_facture_FAC00054_bello").texte;
  test("une ligne « à compléter » est inactive tant que Paul ne l'a pas relue", () => {
    assert.equal(ctx.ligneActive({ nom: "Cmb", actif: "à compléter", etab: "" }), false);
    assert.equal(ctx.ligneActive({ nom: "Cmb", actif: "A compléter", etab: "" }), false);
    assert.equal(ctx.ligneActive({ nom: "Cmb", actif: "oui", etab: "" }), true);
    assert.equal(ctx.ligneActive({ nom: "Cmb", actif: "", etab: "" }), true);
    const i = ctx.indexerFournisseurs([{ nom: "Cmb", variantes: [], domaines: ["facture-x.fr"], identifiants: [], etab: "", actif: "à compléter" }]);
    assert.equal(ctx.extraireFournisseur(i, "noreply@facture-x.fr", "", "").nom, null);
  });
  test("plateforme de facturation : jamais le domaine, le fournisseur vient de l'identifiant ou du nom lu dans le document", () => {
    const r = ctx.extraireFournisseur(idx, "ne-pas-repondre@facture.cmb.fr", "Facture FAC00054", brn);
    assert.equal(r.nom, "BR Nuisibles");
    assert.equal(r.source, "identifiant");
    const inconnu = ctx.extraireFournisseur(idx, "ne-pas-repondre@facture.cmb.fr", "Votre facture", "Facture n° 12 Total HT 10,00 TVA 2,00 Total TTC 12,00");
    assert.equal(inconnu.nom, null);
    assert.equal(inconnu.source, "plateforme");
    assert.equal(inconnu.propose, null, "pas de ligne « à compléter » pour une plateforme");
    const a = ctx.analyserDocument({ idx, texte: "Facture n° 12 Total HT 10,00 TVA 2,00 Total TTC 12,00 SARL SASHA Date : 01/10/2026", from: "ne-pas-repondre@facture.cmb.fr", subject: "Votre facture", nomPiece: "f.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.match(a.raisons.join(","), /plateforme, fournisseur non lu/);
    assert.equal(ctx.decider(a).destination, "a_verifier");
    const sysco = ctx.extraireFournisseur(idx, "salesadminsgroup.elis@esker.com", "Nouvelles factures", "SYSCO FRANCE SAS Facture n° 77 Total TTC 12,00 € HT 10,00 TVA 2,00");
    assert.equal(sysco.nom, "Sysco", "une facture Sysco envoyée par Esker n'est pas Elis");
    assert.equal(sysco.source, "nom (document)");
    const elis = ctx.extraireFournisseur(idx, "salesadminsgroup.elis@esker.com", "Nouvelles factures", "ELIS BRETAGNE RENNES ID TVA FR65062201009");
    assert.equal(elis.nom, "Elis");
    const indy = ctx.extraireFournisseur(idx, "no-reply@via.indy.fr", "Facture", "Alain Pedron Nettoyage Facture n° 3 Total TTC 50,00");
    assert.equal(indy.nom, "Alain Pedron Nettoyage");
  });
  test("identifiants du bloc émetteur : ni les nôtres, ni ceux d'une autre ligne", () => {
    const r = ctx.identifiantsEmetteur(brn, ["BR Nuisibles", "Bource Richard"], {});
    assert.deepEqual(plain(r.identifiants).sort(), ["94776172200018", "947761722", "FR32947761722"].sort());
    assert.ok(!r.identifiants.some((x) => /913217386|91321738600014|FR78913217386/.test(x)), "jamais le SIRET de SARL SASHA");
    const r2 = ctx.identifiantsEmetteur(brn, ["BR Nuisibles"], { FR32947761722: "Cmb" });
    assert.equal(r2.ecartes.length, 1);
    assert.equal(r2.ecartes[0].ligne, "Cmb");
    const billard = cas.find((c) => c.nom === "perebillard_facture_FAC00000703_bello").texte;
    const r3 = ctx.identifiantsEmetteur(billard, ["Le Père Billard", "Corsaire Marée"], {});
    assert.ok(r3.identifiants.indexOf("87790529900013") !== -1, JSON.stringify(r3));
    assert.ok(!r3.identifiants.some((x) => /913217386/.test(x)));
  });
  test("établissement : bloc d'adresse d'abord, contradiction sans défaut, majorité, adresse de réception, « SASHA I FRATELLI AND CO »", () => {
    assert.deepEqual(plain(ctx.analyserEtablissement("Siège : SARL SASHA Saint-Malo. Facturé à : SARL I FRATELLI 12 rue Ville Pépin 35400 Saint-Malo")), { etab: "Piccola Mia", contradictoire: false, source: "adresse" });
    assert.deepEqual(plain(ctx.analyserEtablissement("SARL SASHA et SARL FRATELLI")), { etab: null, contradictoire: true, source: null });
    assert.equal(ctx.analyserEtablissement("BELLO MIO SASHA 3 place du Poncel 35400 Saint-Malo. Référence : I FRATELLI").etab, "Bello Mio", "trois marqueurs contre un");
    assert.equal(ctx.analyserEtablissement("SARL SASHA I FRATELLI AND CO BELLO MIO 3 PLACE DU PONCEL").etab, "Bello Mio", "nom complet de la SARL SASHA");
    assert.equal(ctx.analyserEtablissement("SARL SASHA I FRATELLI AND CO BELLO MIO 3 PLACE DU PONCEL").contradictoire, false);
    const texte = "Facture n° 44 Masse SARL SASHA / SARL I FRATELLI Total HT 100,00 TVA 5,50 Total TTC 105,50 Date : 01/06/2026";
    const liste = ctx.listeFournisseursParDefaut(); liste.find((f) => f.nom === "Masse").etab = "Bello";
    const i = ctx.indexerFournisseurs(liste);
    const sans = ctx.analyserDocument({ idx: i, texte, from: "compta@masse.fr", subject: "Facture", nomPiece: "f.pdf", dateMail: "2026-06-02", extension: ".pdf", recuSur: "contact@bellomio.fr" });
    assert.equal(sans.etablissement, null, "contradictoire : l'établissement par défaut de la liste ne s'applique pas");
    assert.match(sans.raisons.join(","), /établissement contradictoire/);
    assert.equal(ctx.decider(sans).destination, "a_verifier");
    const avec = ctx.analyserDocument({ idx: i, texte, from: "compta@masse.fr", subject: "Facture", nomPiece: "f.pdf", dateMail: "2026-06-02", extension: ".pdf", recuSur: "facture@piccolamia.fr" });
    assert.equal(avec.etablissement, "Piccola Mia", "reçu sur facture@piccolamia.fr : départagé");
    assert.equal(avec.sourceEtablissement, "réception");
    assert.equal(ctx.decider(avec).destination, "envoi");
    assert.equal(ctx.etablissementParReception("contact@bellomio.fr"), null, "contact@ reçoit de tout : jamais une preuve");
  });
  test("bon de livraison : journal seul, même avec un total et le mot « facturée » ; une facture qui cite un BL reste une facture", () => {
    assert.equal(ctx.detecterTypeDocument("BON DE LIVRAISON N° : BDL00000439 Date : 04/08/2026 Total TTC 581,10 € Marchandise livrée, facturée en fin de mois.", "581.10"), "bon_livraison");
    assert.equal(ctx.detecterTypeDocument("Facture n° 127999 BL N°145049 du 02/09/2026 Total TTC 1 155,24 €", "1155.24"), "facture");
    const a = ctx.analyserDocument({ idx, texte: "BON DE LIVRAISON N° : BDL00000439 SARL LE PERE BILLARD Siret : 87790529900013 SASHA BELLO MIO Total TTC 581,10 €", from: "notification@mon-expert-en-gestion.fr", subject: "BDL", nomPiece: "b.pdf", dateMail: "2026-08-04", extension: ".pdf" });
    assert.equal(ctx.decider(a).destination, "journal");
  });
  test("noms complets seulement : « Apple Pay » n'est pas Apple, « masse » n'est pas Masse, un nom affiché court reste reconnu", () => {
    assert.equal(ctx.extraireFournisseur(idx, "noreply@boutique-inconnue.fr", "Reçu Apple Pay", "").nom, null);
    assert.equal(ctx.extraireFournisseur(idx, "rh@cabinet-inconnu.fr", "Facture masse salariale", "").nom, null);
    assert.equal(ctx.extraireFournisseur(idx, "Metro <noreply@mailing-inconnu.fr>", "", "").nom, "Metro", "nom affiché de l'expéditeur");
    assert.equal(ctx.extraireFournisseur(idx, "noreply@inconnu.fr", "Facture Maël Distribution", "").nom, "Maël Distribution");
    assert.equal(ctx.extraireFournisseur(idx, "noreply@inconnu.fr", "Votre facture Leroy Merlin", "").nom, "Leroy Merlin");
  });
  test("type MIME et extension", () => {
    assert.equal(ctx.typeMimePour("x.pdf"), "application/pdf");
    assert.equal(ctx.typeMimePour("x.JPG"), "image/jpeg");
    assert.equal(ctx.typeMimePour("x.zip"), null);
    assert.equal(ctx.extensionParMime("application/pdf; name=x"), "pdf");
    assert.equal(ctx.extensionParMime("application/zip"), "");
  });
});

describe("v4.6.3 : fournisseur « perso » et « pas besoin » de la liste", () => {
  test("Alma (perso dans la liste par défaut) : reconnu, destination perso, jamais Pennylane", () => {
    const r = ctx.extraireFournisseur(idx, "no-reply@getalma.eu", "Votre facture", "");
    assert.equal(r.nom, "Alma");
    assert.equal(r.perso, true);
    const a = ctx.analyserDocument({ idx, texte: "Alma Facture n° FR-1 Total HT 100,00 € TVA 20,00 € Total TTC 120,00 € Date : 02/10/2026", from: "no-reply@getalma.eu", subject: "Facture", nomPiece: "a.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(a.perso, true);
    const d = ctx.decider(a);
    assert.equal(d.destination, "perso");
    assert.deepEqual(plain(d.chemin), ["_Hors Pennylane", "Perso", "Alma", "2026"]);
    const illisible = ctx.analyserDocument({ idx, texte: "", from: "no-reply@getalma.eu", subject: "Facture", nomPiece: "a.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(ctx.decider(illisible).destination, "perso", "même illisible : Perso plutôt que À vérifier");
    assert.deepEqual(plain(ctx.interpreterEtablissement("perso")), { etab: null, lesDeux: false, inactif: true, perso: true, ignorer: false, typeForce: null, inconnu: false, brut: "perso" });
    assert.equal(ctx.interpreterEtablissement("pas besoin").ignorer, true);
    assert.equal(ctx.ligneActive({ nom: "Alma", actif: "non", etab: "perso" }), false, "toujours inactif pour le reste (nom canonique, propositions)");
  });
  test("« pas besoin » : journal seul ; une ligne inactive sans étiquette reste inconnue", () => {
    const i = ctx.indexerFournisseurs([{ nom: "3bsc", variantes: [], domaines: ["3bsc.fr"], identifiants: [], etab: "pas besoin", actif: "non" }, { nom: "Vieux", variantes: [], domaines: ["vieux.fr"], identifiants: [], etab: "", actif: "non" }]);
    const a = ctx.analyserDocument({ idx: i, texte: "3BSC Facture n° 77 Total HT 50,00 TVA 10,00 Total TTC 60,00 SARL SASHA Date : 01/10/2026", from: "cave@3bsc.fr", subject: "Facture", nomPiece: "f.pdf", dateMail: "2026-10-02", extension: ".pdf" });
    assert.equal(a.fournisseur, "3bsc");
    assert.equal(ctx.decider(a).destination, "journal");
    assert.equal(ctx.extraireFournisseur(i, "x@vieux.fr", "", "").nom, null);
  });
});
