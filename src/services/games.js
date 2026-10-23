const elementsRepo = require("../repositories/elements");
const gamesRepo = require("../repositories/games");
const db = require("../db");
const { HttpError } = require("../utils/http-error");
const { nowIso, secondsBetween } = require("../utils/dates");
const { verdictFor, displayValues } = require("./compare");
const { MODE_IDS, findInconsistency } = require("./modes");
const { getModeRules } = require("./mode-rules");
const { HINT_TYPES, buildHint } = require("./hints");
const daily = require("./daily");

function deadlineOf(game, mode) {
  if (!mode.timeLimitSeconds || !game) return null;
  return new Date(Date.parse(game.started_at) + mode.timeLimitSeconds * 1000).toISOString();
}

// Mode Hard : une partie dont le temps est écoulé est perdue, à l'heure limite
function expireIfNeeded(game, mode) {
  const deadline = deadlineOf(game, mode);
  if (game?.status === "playing" && deadline && Date.now() > Date.parse(deadline)) {
    gamesRepo.finish(game.id, "lost", deadline);
    return gamesRepo.findById(game.id);
  }
  return game;
}

// Partie du jour du joueur, remise à zéro si l'admin a changé le mot
function loadGame(playerId, mode, secret) {
  let game = playerId ? gamesRepo.find(secret.date, mode.id, playerId) : null;
  let reset = false;
  if (game && game.secret_version !== secret.version) {
    game = gamesRepo.restart(game.id, secret.version, nowIso());
    reset = true;
  }
  return { game: expireIfNeeded(game, mode), reset };
}

function guessHistory(game, secretElement) {
  if (!game) return [];
  return gamesRepo.guessedElementIds(game.id).map((id) => {
    const element = elementsRepo.findById(id);
    return { element, verdict: verdictFor(element, secretElement) };
  });
}

// État renvoyé au client. La réponse n'est incluse que si la partie est finie.
function buildState({ mode, secret, game, reset = false }) {
  const history = guessHistory(game, secret.element);
  const status = game?.status ?? "playing";
  const finished = status !== "playing";
  const now = finished && game.finished_at ? game.finished_at : nowIso();

  return {
    mode: mode.id,
    date: secret.date,
    status,
    reset,
    rules: {
      maxHints: mode.maxHints,
      maxTries: mode.maxTries,
      timeLimitSeconds: mode.timeLimitSeconds,
      suggestionMinChars: mode.suggestionMinChars,
      showAllList: mode.showAllList,
      consistentGuesses: mode.consistentGuesses
    },
    guesses: history.map(({ element, verdict }) => ({
      nom: element.nom,
      valeurs: displayValues(element),
      verdict
    })),
    hints: game ? gamesRepo.hints(game.id) : [],
    tries: history.length,
    triesLeft: mode.maxTries ? Math.max(0, mode.maxTries - history.length) : null,
    startedAt: game?.started_at ?? null,
    finishedAt: game?.finished_at ?? null,
    deadline: deadlineOf(game, mode),
    elapsedSeconds: game ? secondsBetween(game.started_at, now) : 0,
    solution: finished
      ? { nom: secret.element.nom, valeurs: displayValues(secret.element) }
      : null
  };
}

// Une partie Hard en cours bloque le mode normal : sinon on pourrait
// chercher le mot Hard avec la liste et les suggestions du mode normal
function lockingMode(playerId, modeId) {
  if (!playerId || modeId === "hard") return null;
  const hard = getModeRules("hard");
  const secret = daily.getTodaySecret(hard.id);
  const game = expireIfNeeded(gamesRepo.find(secret.date, hard.id, playerId), hard);
  return game?.status === "playing" && game.secret_version === secret.version ? hard.id : null;
}

function ensureNotLocked(playerId, modeId) {
  const lockedBy = lockingMode(playerId, modeId);
  if (lockedBy) {
    throw new HttpError(409, "Finish your Hard game first (or give up) to play Normal.", { lockedBy });
  }
}

function getState(player, modeId) {
  const mode = getModeRules(modeId);
  const secret = daily.getTodaySecret(mode.id);
  const { game, reset } = loadGame(player?.id, mode, secret);
  return { ...buildState({ mode, secret, game, reset }), lockedBy: lockingMode(player?.id, mode.id) };
}

function ensurePlaying(game) {
  if (game && game.status !== "playing") {
    throw new HttpError(409, "Today's game is already over for this mode.");
  }
}

const guess = db.transaction((player, modeId, input) => {
  const mode = getModeRules(modeId);
  const secret = daily.getTodaySecret(mode.id);
  const element = elementsRepo.findByNameOrAlias(input);
  if (!element || !element.isActive) {
    throw new HttpError(400, "Unknown element. Check the spelling.");
  }
  ensureNotLocked(player.id, mode.id);

  const loaded = loadGame(player.id, mode, secret);
  let { game } = loaded;
  ensurePlaying(game);

  const history = guessHistory(game, secret.element);
  if (history.some((h) => h.element.id === element.id)) {
    throw new HttpError(409, "You already tried this one!");
  }
  if (mode.consistentGuesses) {
    const problem = findInconsistency(element, history);
    if (problem) throw new HttpError(422, problem.message, { category: problem.category });
  }

  const at = nowIso();
  if (!game) {
    game = gamesRepo.create({
      date: secret.date,
      mode: mode.id,
      playerId: player.id,
      secretVersion: secret.version,
      startedAt: at
    });
  }
  gamesRepo.addGuess(game.id, element.id, at);

  const verdict = verdictFor(element, secret.element);
  if (verdict.isCorrect) {
    gamesRepo.finish(game.id, "won", at);
  } else if (mode.maxTries && history.length + 1 >= mode.maxTries) {
    gamesRepo.finish(game.id, "lost", at);
  }

  const state = buildState({ mode, secret, game: gamesRepo.findById(game.id), reset: loaded.reset });
  return { state, guess: { nom: element.nom, valeurs: displayValues(element), verdict } };
});

const useHint = db.transaction((player, modeId, type) => {
  const mode = getModeRules(modeId);
  if (!HINT_TYPES.includes(type)) throw new HttpError(400, `Unknown hint type "${type}"`);
  ensureNotLocked(player.id, mode.id);
  const secret = daily.getTodaySecret(mode.id);

  let { game } = loadGame(player.id, mode, secret);
  ensurePlaying(game);

  const used = game ? gamesRepo.hints(game.id) : [];
  if (used.some((h) => h.type === type)) {
    throw new HttpError(409, "You already used this hint today.");
  }
  if (used.length >= mode.maxHints) {
    throw new HttpError(409, `No hints left (${mode.maxHints} max in this mode).`);
  }

  // Un indice avant le premier essai démarre la partie (et le chrono)
  if (!game) {
    game = gamesRepo.create({
      date: secret.date,
      mode: mode.id,
      playerId: player.id,
      secretVersion: secret.version,
      startedAt: nowIso()
    });
  }

  const payload = buildHint(type, {
    secret: secret.element,
    elements: elementsRepo.listActive(),
    guesses: guessHistory(game, secret.element),
    previousHints: used,
    vocabulary: elementsRepo.vocabulary(),
    random: (offset) => daily.seededRandom(mode.id, offset)
  });
  gamesRepo.addHint(game.id, type, payload, nowIso());

  return buildState({ mode, secret, game: gamesRepo.findById(game.id) });
});

const forfeit = db.transaction((player, modeId) => {
  const mode = getModeRules(modeId);
  const secret = daily.getTodaySecret(mode.id);

  let { game } = loadGame(player.id, mode, secret);
  ensurePlaying(game);

  const at = nowIso();
  if (!game) {
    game = gamesRepo.create({
      date: secret.date,
      mode: mode.id,
      playerId: player.id,
      secretVersion: secret.version,
      startedAt: at
    });
  }
  gamesRepo.finish(game.id, "forfeit", at);
  return buildState({ mode, secret, game: gamesRepo.findById(game.id) });
});

function expireOverdueGames() {
  for (const mode of MODE_IDS.map(getModeRules)) {
    if (mode.timeLimitSeconds) gamesRepo.expireOverdue(mode.id, mode.timeLimitSeconds, nowIso());
  }
}

module.exports = { getState, guess, useHint, forfeit, expireOverdueGames };
