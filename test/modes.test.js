const test = require("node:test");
const assert = require("node:assert/strict");
const { findInconsistency, getMode } = require("../src/services/modes");
const { verdictFor } = require("../src/services/compare");

const secret = { id: 1, nom: "secret", type: "movement & propulsion", lieu: ["core"], couleur: ["yellow"], shape: "irregular" };
const spring = { id: 2, nom: "spring", type: "movement & propulsion", lieu: ["city", "core"], couleur: ["brown"], shape: "rectangle" };
const history = [{ element: spring, verdict: verdictFor(spring, secret) }];

test("un essai qui pourrait être la réponse est accepté", () => {
  assert.equal(findInconsistency(secret, history), null);
});

test("un type déjà trouvé doit être conservé", () => {
  const spinners = { id: 3, nom: "spinners", type: "hazards", lieu: ["core"], couleur: ["yellow"], shape: "irregular" };
  const problem = findInconsistency(spinners, history);
  assert.equal(problem.category, "type");
  assert.match(problem.message, /must stay "movement & propulsion"/);
});

test("une couleur exclue ne peut pas revenir", () => {
  const brownThing = { ...secret, id: 4, nom: "brown thing", couleur: ["brown", "yellow"] };
  const problem = findInconsistency(brownThing, history);
  assert.equal(problem.category, "couleur");
  assert.match(problem.message, /ruled out by spring/);
});

test("getMode refuse un mode inconnu", () => {
  assert.equal(getMode("hard").maxHints, 1);
  assert.throws(() => getMode("nightmare"), /Unknown mode/);
});
