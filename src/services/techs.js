const techsRepo = require("../repositories/techs");
const { createGamesRepo } = require("../repositories/games");
const { createSecretsRepo } = require("../repositories/secrets");
const { HttpError } = require("../utils/http-error");
const { createComparator } = require("./compare");
const { createDaily } = require("./daily");
const { createGameService } = require("./games");

// Techs : un Celestedle dont la réponse est une technique de jeu. Même moteur
// que Celestedle (essais, indices, mode Hard), avec ses propres colonnes.

const CATEGORY_LABELS = {
  category: "Category",
  difficulty: "Difficulty",
  utility: "Utility",
  dash_required: "Dash",
  hardcoded: "Origin"
};

// La difficulté se compare dans l'ordre : flèche vers le haut ou le bas.
// « TAS » : en pratique réservée aux tool-assisted speedruns.
const DIFFICULTIES = ["passive", "beginner", "intermediate", "advanced", "expert", "tas"];

const comparator = createComparator({
  categories: techsRepo.TECH_FIELDS,
  labels: CATEGORY_LABELS,
  ordered: { difficulty: DIFFICULTIES },
  // Valeurs affichées telles qu'écrites dans l'admin (« Dash Tech »)
  display: (tech, category) => String(tech[category] ?? "")
});

const hintCatalog = {
  categories: techsRepo.TECH_FIELDS,
  vocabKeys: {},
  statementGroups: [techsRepo.TECH_FIELDS],
  displayValues: comparator.displayValues
};

// Règles des deux modes, sur le modèle de Celestedle
const MODES = {
  tech: {
    id: "tech",
    maxHints: 3,
    maxTries: null,
    timeLimitSeconds: null,
    suggestionMinChars: 1,
    showAllList: true,
    consistentGuesses: false,
    bonusHints: []
  },
  "tech-hard": {
    id: "tech-hard",
    maxHints: 1,
    maxTries: 8,
    timeLimitSeconds: 3 * 60,
    suggestionMinChars: 3,
    showAllList: false,
    consistentGuesses: true,
    bonusHints: ["info"]
  }
};
const MODE_IDS = Object.keys(MODES);

function getRules(id = "tech") {
  const mode = MODES[id];
  if (!mode) throw new HttpError(400, `Unknown mode "${id}"`);
  return { ...mode };
}

const daily = createDaily({
  items: techsRepo,
  secrets: createSecretsRepo("tech_secrets"),
  primary: "tech",
  checkMode: getRules
});

const games = createGameService({
  items: techsRepo,
  gamesRepo: createGamesRepo({
    games: "tech_games",
    guesses: "tech_guesses",
    hints: "tech_hints",
    summaries: "tech_game_summaries"
  }),
  daily,
  comparator,
  hintCatalog,
  getRules,
  modeIds: MODE_IDS,
  normalMode: "tech",
  hardMode: "tech-hard",
  unknownMessage: "Unknown tech. Check the spelling."
});

module.exports = { CATEGORY_LABELS, DIFFICULTIES, MODES, MODE_IDS, getRules, comparator, daily, games };
