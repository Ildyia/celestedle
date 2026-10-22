const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHint } = require("../src/services/hints");
const { verdictFor } = require("../src/services/compare");

const secret = { id: 1, nom: "secret", type: "hazards", lieu: ["core", "city"], couleur: ["red", "blue"], shape: "round" };
const near = { id: 2, nom: "near", type: "hazards", lieu: ["core"], couleur: ["red"], shape: "round" };
const far = { id: 3, nom: "far", type: "collectibles", lieu: ["summit"], couleur: ["yellow"], shape: "square" };
const farther = { id: 4, nom: "farther", type: "mechanics", lieu: ["farewell"], couleur: ["green"], shape: "irregular" };
const elements = [secret, near, far, farther];
const vocabulary = {
  types: ["collectibles", "hazards", "mechanics"],
  shapes: ["irregular", "rectangle", "round", "square"],
  colors: ["blue", "green", "red", "yellow"],
  locations: ["city", "core", "summit", "farewell"]
};
const guess = (element) => ({ element, verdict: verdictFor(element, secret) });

// Plusieurs tirages pour couvrir les choix « aléatoires » de l'indice
const randoms = Array.from({ length: 12 }, (_, i) => (offset) => offset * 7 + i);

test("opposite choisit l'élément le plus différent", () => {
  const hint = buildHint("opposite", { secret, elements, random: randoms[0] });
  assert.ok(["far", "farther"].includes(hint.element));
  assert.deepEqual(hint.categories, ["type", "lieu", "couleur", "shape"]);
});

test("opposite ne propose pas un élément déjà essayé", () => {
  for (const random of randoms) {
    const hint = buildHint("opposite", { secret, elements, guesses: [guess(far)], random });
    assert.equal(hint.element, "farther");
  }
});

test("secret_info ne révèle ni une catégorie trouvée ni une valeur déjà connue", () => {
  // near : type et forme verts ; lieu et couleur « partial » → core et red sont connus
  const guesses = [guess(near)];
  for (const random of randoms) {
    const hint = buildHint("secret_info", { secret, elements, guesses, random });
    assert.ok(
      (hint.category === "lieu" && hint.value === "city") ||
        (hint.category === "couleur" && hint.value === "blue"),
      `${hint.category}=${hint.value}`
    );
  }
});

test("secret_info tient compte d'un secret_info déjà utilisé", () => {
  const guesses = [guess(near)];
  const previousHints = [{ type: "secret_info", category: "lieu", value: "city" }];
  for (const random of randoms) {
    const hint = buildHint("secret_info", { secret, elements, guesses, previousHints, random });
    assert.deepEqual([hint.category, hint.value], ["couleur", "blue"]);
  }
});

test("secret_info sans information nouvelle le dit", () => {
  const hint = buildHint("secret_info", { secret, elements, guesses: [guess(secret)], random: randoms[0] });
  assert.equal(hint.category, null);
});

test("truth_and_lies : vérité inconnue et mensonges pas encore éliminés", () => {
  // far : forme square et couleur yellow exclues ; near : round et red connus
  const guesses = [guess(far), guess(near)];
  for (const random of randoms) {
    const { statements } = buildHint("truth_and_lies", { secret, elements, guesses, vocabulary, random });
    assert.equal(statements.length, 3);
    const isTrue = (s) => [].concat(secret[s.category]).includes(s.value);
    const truths = statements.filter(isTrue);
    assert.equal(truths.length, 1);
    assert.notDeepEqual([truths[0].category, truths[0].value], ["couleur", "red"], "red est déjà connu");
    for (const s of statements) {
      assert.notEqual(s.category, "shape", "la forme est déjà trouvée");
      assert.ok(!(s.category === "couleur" && s.value === "yellow"), "yellow est déjà exclu");
      assert.ok(!(s.category === "type"), "le type est déjà trouvé");
    }
  }
});

test("un type d'indice inconnu est refusé", () => {
  assert.throws(() => buildHint("cheat", {}), /Unknown hint type/);
});
