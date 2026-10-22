const test = require("node:test");
const assert = require("node:assert/strict");
const { compareValues, verdictFor, foundCategories } = require("../src/services/compare");

test("compareValues distingue les quatre verdicts", () => {
  assert.equal(compareValues(["red", "blue"], ["blue", "red"]), "correct");
  assert.equal(compareValues("square", "square"), "correct");
  assert.equal(compareValues(["red"], ["red", "blue"]), "partial");
  assert.equal(compareValues(["red", "green"], ["red", "blue"]), "notTotallyWrong");
  assert.equal(compareValues(["green"], ["red", "blue"]), "wrong");
});

test("compareValues ignore la casse et les espaces", () => {
  assert.equal(compareValues([" Red "], ["red"]), "correct");
});

test("verdictFor compare chaque catégorie et l'identité", () => {
  const secret = { id: 1, type: "hazards", lieu: ["city", "core"], couleur: ["red"], shape: "round" };
  const guess = { id: 2, type: "hazards", lieu: ["city"], couleur: ["blue"], shape: "square" };
  assert.deepEqual(verdictFor(guess, secret), {
    isCorrect: false,
    type: "correct",
    lieu: "partial",
    couleur: "wrong",
    shape: "wrong"
  });
  assert.equal(verdictFor(secret, secret).isCorrect, true);
});

test("foundCategories liste les catégories déjà vertes", () => {
  const verdicts = [
    { type: "correct", lieu: "wrong", couleur: "partial", shape: "wrong" },
    { type: "wrong", lieu: "wrong", couleur: "wrong", shape: "correct" }
  ];
  assert.deepEqual(foundCategories(verdicts), ["type", "shape"]);
});
