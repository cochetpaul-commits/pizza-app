"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { chargerContexte } = require("./charger");

const ctx = chargerContexte();
const plain = (x) => JSON.parse(JSON.stringify(x));
const dateMois = new Date("2026-10-02T12:00:00");

function analyse(extra) {
  return Object.assign({ type: "facture", etablissement: "Bello Mio", fournisseur: "Carniato", numero: "1", date: "2026-10-02", dateSecours: "2026-10-02",
    montant: "10.00", texteLu: true, raisons: [] }, extra);
}

describe("decider : seules les vraies pièces entrent dans les dossiers Pennylane", () => {
  test("facture sûre -> dossier synchronisé", () => {
    assert.deepEqual(plain(ctx.decider(analyse({}), dateMois)), { destination: "sync", chemin: ["Bello Mio", "Carniato", "10 - Octobre 2026"], raison: "" });
  });
  test("établissement inconnu -> À vérifier", () => {
    const d = ctx.decider(analyse({ etablissement: null, raisons: ["établissement inconnu"] }), dateMois);
    assert.equal(d.destination, "a_verifier");
    assert.deepEqual(plain(d.chemin), ["_À vérifier", "10 - Octobre 2026"]);
    assert.match(d.raison, /établissement inconnu/);
  });
  test("montant introuvable -> À vérifier", () => {
    assert.equal(ctx.decider(analyse({ montant: null, raisons: ["montant introuvable"] }), dateMois).destination, "a_verifier");
  });
  test("OCR raté -> À vérifier, même si le mail vient d'un fournisseur connu", () => {
    const d = ctx.decider(analyse({ type: "autre", texteLu: false, etablissement: null, montant: null, raisons: ["texte illisible (OCR)"] }), dateMois);
    assert.equal(d.destination, "a_verifier");
  });
  test("relevé -> _Hors Pennylane / établissement / fournisseur / mois", () => {
    assert.deepEqual(plain(ctx.decider(analyse({ type: "releve" }), dateMois).chemin), ["_Hors Pennylane", "Bello Mio", "Carniato", "10 - Octobre 2026"]);
  });
  test("mandat sans établissement -> _Hors Pennylane / Etablissement inconnu", () => {
    assert.deepEqual(plain(ctx.decider(analyse({ type: "mandat", etablissement: null, raisons: ["établissement inconnu"] }), dateMois).chemin),
      ["_Hors Pennylane", "Etablissement inconnu", "Carniato", "10 - Octobre 2026"]);
  });
  test("devis, bon de commande, attestation -> journal seul", () => {
    for (const type of ["devis", "bon_commande", "attestation"]) assert.equal(ctx.decider(analyse({ type }), dateMois).destination, "journal");
  });
  test("tarifs et promos (type autre) -> À vérifier, jamais en synchro", () => {
    assert.equal(ctx.decider(analyse({ type: "autre", raisons: ["type de document incertain"] }), dateMois).destination, "a_verifier");
  });
});

describe("anti-doublon à l'échelle des deux établissements", () => {
  const index = {};
  const existante = { fichierId: "abc", nom: "2026-08-31 — Cheville 35 — Facture n° 00113789 — 375.64 EUR.pdf" };
  for (const k of ctx.clesDoublon(analyse({ fournisseur: "Cheville 35", numero: "00113789", date: "2026-08-31", montant: "375.64" }), "MD5X")) index[k] = existante;

  test("même empreinte", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "Autre", numero: "9", montant: "1.00" }), "MD5X"), existante);
  });
  test("même fournisseur + numéro, même si l'autre établissement", () => {
    assert.equal(ctx.trouverDoublon(index, analyse({ fournisseur: "cheville 35", etablissement: "Piccola Mia", numero: "00113789", montant: "1.00" }), "autre"), existante);
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
