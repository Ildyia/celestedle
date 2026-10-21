const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHint } = require("../src/services/hints");

const secret = { id: 1, nom: "secret", type: "hazards", lieu: ["core"], couleur: ["red", "blue"], shape: "round" };
const elements = [
  secret,
  { id: 2, nom: "near", type: "hazards", lieu: ["core"], couleur: ["red"], shape: "round" },
  { id: 3, nom: "far", type: "collectibles", lieu: ["city"], couleur: ["yellow"], shape: "square" }
];
const vocabulary = {
  shapes: ["irregular", "rectangle", "round", "square"],
  colors: ["blue", "green", "red", "yellow"]
};
const random = (offset) => offset * 7;

test("opposite choisit l'élément le plus différent", () => {
  const hint = buildHint("opposite", { secret, elements, random });
  assert.equal(hint.element, "far");
  assert.deepEqual(hint.categories, ["type", "lieu", "couleur", "shape"]);
});

test("secret_info ne révèle pas une catégorie déjà trouvée", () => {
  const verdicts = [{ type: "correct", lieu: "correct", couleur: "wrong", shape: "correct" }];
  for (let i = 0; i < 5; i++) {
    const hint = buildHint("secret_info", { secret, verdicts, random: (o) => o + i });
    assert.equal(hint.category, "couleur");
    assert.equal(hint.partial, true);
  }
});

test("truth_and_lies : une vérité, et des mensonges pris dans les vrais vocabulaires", () => {
  const hint = buildHint("truth_and_lies", { secret, vocabulary, random });
  assert.equal(hint.statements.length, 3);
  const isTrue = (s) =>
    s.category === "shape" ? s.value === secret.shape : secret.couleur.includes(s.value);
  assert.equal(hint.statements.filter(isTrue).length, 1);
  for (const s of hint.statements) {
    const pool = s.category === "shape" ? vocabulary.shapes : vocabulary.colors;
    assert.ok(pool.includes(s.value), `${s.value} doit venir du vocabulaire`);
  }
});

test("un type d'indice inconnu est refusé", () => {
  assert.throws(() => buildHint("cheat", {}), /Unknown hint type/);
});
