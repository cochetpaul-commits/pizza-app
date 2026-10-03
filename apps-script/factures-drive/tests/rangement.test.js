"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { chargerContexte } = require("./charger");

const ctx = chargerContexte();
const plain = (x) => JSON.parse(JSON.stringify(x));

function analyse(extra) {
  return Object.assign({ type: "facture", etablissement: "Bello Mio", fournisseur: "Carniato", numero: "1", date: "2026-10-02", dateSecours: "2026-10-02",
    montant: "10.00", texteLu: true, raisons: [] }, extra);
}

describe("decider : seules les vraies pièces partent vers Pennylane", () => {
  test("facture sûre -> Envoi Pennylane à plat, archive <Etab>/<Fournisseur>/<Année>", () => {
    assert.deepEqual(plain(ctx.decider(analyse({}))), { destination: "envoi", chemin: ["Envoi Pennylane", "Bello Mio"], archive: ["Bello Mio", "Carniato", "2026"], raison: "" });
  });
  test("l'année vient de la date de facture, sinon du mail", () => {
    assert.deepEqual(plain(ctx.decider(analyse({ date: "2025-12-30", dateSecours: "2026-01-02" })).archive), ["Bello Mio", "Carniato", "2025"]);
    assert.deepEqual(plain(ctx.decider(analyse({ date: null, dateSecours: "2026-01-02" })).archive), ["Bello Mio", "Carniato", "2026"]);
  });
  test("établissement inconnu -> À vérifier", () => {
    const d = ctx.decider(analyse({ etablissement: null, raisons: ["établissement inconnu"] }));
    assert.equal(d.destination, "a_verifier");
    assert.deepEqual(plain(d.chemin), ["À vérifier"]);
    assert.match(d.raison, /établissement inconnu/);
  });
  test("fournisseur absent de la liste -> À vérifier, même avec tout le reste", () => {
    const d = ctx.decider(analyse({ fournisseur: null, raisons: ["fournisseur inconnu (Castorama ?)"] }));
    assert.equal(d.destination, "a_verifier");
    assert.match(d.raison, /Castorama/);
  });
  test("montant introuvable -> À vérifier", () => {
    assert.equal(ctx.decider(analyse({ montant: null, raisons: ["montant introuvable"] })).destination, "a_verifier");
  });
  test("OCR raté -> À vérifier, même si le mail vient d'un fournisseur connu", () => {
    assert.equal(ctx.decider(analyse({ type: "autre", texteLu: false, etablissement: null, montant: null, raisons: ["texte illisible (OCR)"] })).destination, "a_verifier");
  });
  test("relevé -> _Hors Pennylane / établissement / fournisseur / année", () => {
    assert.deepEqual(plain(ctx.decider(analyse({ type: "releve" })).chemin), ["_Hors Pennylane", "Bello Mio", "Carniato", "2026"]);
  });
  test("mandat sans établissement -> _Hors Pennylane / Etablissement inconnu", () => {
    assert.deepEqual(plain(ctx.decider(analyse({ type: "mandat", etablissement: null, raisons: ["établissement inconnu"] })).chemin),
      ["_Hors Pennylane", "Etablissement inconnu", "Carniato", "2026"]);
  });
  test("relevé d'un fournisseur inconnu -> À vérifier", () => {
    assert.equal(ctx.decider(analyse({ type: "releve", fournisseur: null, raisons: ["fournisseur inconnu"] })).destination, "a_verifier");
  });
  test("devis, bon de commande, attestation -> journal seul", () => {
    for (const type of ["devis", "bon_commande", "attestation"]) assert.equal(ctx.decider(analyse({ type })).destination, "journal");
  });
  test("tarifs et promos (type autre) -> À vérifier, jamais vers Pennylane", () => {
    assert.equal(ctx.decider(analyse({ type: "autre", raisons: ["type de document incertain"] })).destination, "a_verifier");
  });
});

describe("anti-doublon à l'échelle des deux établissements", () => {
  const index = {};
  const existante = { fichierId: "abc", nom: "2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf" };
  for (const k of ctx.clesDoublon(analyse({ fournisseur: "Cheville 35", numero: "00113789", date: "2026-08-31", montant: "375.64" }), "MD5X")) index[k] = existante;

  test("même empreinte", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "Autre", numero: "9", montant: "1.00" }), "MD5X"), existante);
  });
  test("même fournisseur + numéro, même si l'autre établissement ou une ancienne graphie du nom", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "cheville 35", etablissement: "Piccola Mia", numero: "00113789", montant: "1.00" }), "autre"), existante);
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "CHEVILLE35", numero: "00113789", montant: "1.00" }), "autre"), existante);
  });
  test("même fournisseur + date + montant sans numéro", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "Cheville 35", numero: null, date: "2026-08-31", montant: "375.64" }), "autre"), existante);
  });
  test("autre facture du même fournisseur", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "Cheville 35", numero: "00114033", date: "2026-09-04", montant: "326.23" }), "autre"), null);
  });
  test("sans numéro, sans montant : pas de clé métier, seule l'empreinte compte", () => {
    assert.deepEqual(plain(ctx.clesDoublon(analyse({ numero: null, montant: null }), null)), []);
  });
});
