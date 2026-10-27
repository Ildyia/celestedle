const { HttpError } = require("../utils/http-error");
const {
  CATEGORIES,
  CATEGORY_LABELS,
  compareValues,
  toList
} = require("./compare");

// Règles par défaut de chaque mode. Les champs listés dans ADJUSTABLE se
// règlent dans l'admin (voir mode-rules.js) ; null = pas de limite.
const MODES = {
  normal: {
    id: "normal",
    maxHints: 3,
    maxTries: null,
    timeLimitSeconds: null,
    suggestionMinChars: 3,
    showAllList: true,
    consistentGuesses: false,
    // Indices qui ne comptent pas dans maxHints (utilisables une fois chacun)
    bonusHints: []
  },
  hard: {
    id: "hard",
    maxHints: 1,
    maxTries: 8,
    timeLimitSeconds: 5 * 60,
    suggestionMinChars: 4,
    showAllList: false,
    consistentGuesses: true,
    bonusHints: ["info"]
  }
};

const MODE_IDS = Object.keys(MODES);

// Réglages modifiables et bornes acceptées. `unlimited` : 0 veut dire « pas de limite ».
const ADJUSTABLE = {
  hard: {
    maxHints: { min: 0, max: 3 },
    maxTries: { min: 1, max: 50, unlimited: true },
    timeLimitSeconds: { min: 30, max: 3600, unlimited: true },
    suggestionMinChars: { min: 1, max: 10 }
  }
};

// Vérifie une valeur de réglage et la renvoie normalisée (null = illimité)
function validateRule(modeId, field, value) {
  const spec = ADJUSTABLE[modeId]?.[field];
  if (!spec)
    throw new HttpError(
      400,
      `"${field}" can't be changed for mode "${modeId}"`
    );
  const number = Number(value);
  if (!Number.isInteger(number))
    throw new HttpError(400, `${field} must be an integer`);
  if (spec.unlimited && number === 0) return null;
  if (number < spec.min || number > spec.max) {
    const zero = spec.unlimited ? " (0 = no limit)" : "";
    throw new HttpError(
      400,
      `${field} must be between ${spec.min} and ${spec.max}${zero}`
    );
  }
  return number;
}

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
      if (compareValues(element[category], candidate[category]) === expected)
        continue;

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

module.exports = {
  MODES,
  MODE_IDS,
  ADJUSTABLE,
  getMode,
  validateRule,
  findInconsistency
};
