const { HttpError } = require("../utils/http-error");
const { CATEGORIES, CATEGORY_LABELS, compareValues, toList } = require("./compare");

// Règles de chaque mode. Les limites du mode Hard se changent ici.
const MODES = {
  normal: {
    id: "normal",
    maxHints: 3,
    maxTries: null,
    timeLimitSeconds: null,
    suggestions: true,
    consistentGuesses: false
  },
  hard: {
    id: "hard",
    maxHints: 1,
    maxTries: 8,
    timeLimitSeconds: 5 * 60,
    suggestions: false,
    consistentGuesses: true
  }
};

const MODE_IDS = Object.keys(MODES);

function getMode(id = "normal") {
  const mode = MODES[id];
  if (!mode) throw new HttpError(400, `Unknown mode "${id}"`);
  return mode;
}

// Mode Hard : l'essai doit pouvoir être la réponse. Si `candidate` était le
// mot secret, chaque essai précédent aurait reçu exactement le même verdict.
// Renvoie null si l'essai est cohérent, sinon une explication.
function findInconsistency(candidate, previous) {
  for (const { element, verdict } of previous) {
    for (const category of CATEGORIES) {
      const expected = verdict[category];
      if (compareValues(element[category], candidate[category]) === expected) continue;

      const label = CATEGORY_LABELS[category];
      const values = toList(element[category]).join(", ");
      let message;
      if (expected === "correct") {
        message = `${label} must stay "${values}" (clue from ${element.nom}).`;
      } else if (expected === "wrong") {
        message = `${label}: "${values}" was already ruled out by ${element.nom}.`;
      } else {
        message = `${label} doesn't fit the clue from ${element.nom}.`;
      }
      return { category, guess: element.nom, message };
    }
  }
  return null;
}

module.exports = { MODES, MODE_IDS, getMode, findInconsistency };
