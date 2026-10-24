const db = require("../db");

const stmts = {
  find: db.prepare(`
    SELECT * FROM game_summaries WHERE date = ? AND mode = ? AND player_id = ?
  `),
  byId: db.prepare("SELECT * FROM game_summaries WHERE id = ?"),
  insert: db.prepare(`
    INSERT INTO games (date, mode, player_id, secret_version, started_at)
    VALUES (@date, @mode, @playerId, @secretVersion, @startedAt)
  `),
  clearGuesses: db.prepare("DELETE FROM guesses WHERE game_id = ?"),
  clearHints: db.prepare("DELETE FROM game_hints WHERE game_id = ?"),
  restart: db.prepare(`
    UPDATE games SET status = 'playing', secret_version = @secretVersion,
      started_at = @startedAt, finished_at = NULL, wasted_tries = 0
    WHERE id = @id
  `),
  guesses: db.prepare(`
    SELECT element_id FROM guesses WHERE game_id = ? ORDER BY position
  `),
  addGuess: db.prepare(`
    INSERT INTO guesses (game_id, position, element_id, created_at)
    VALUES (?, (SELECT COUNT(*) FROM guesses WHERE game_id = ?), ?, ?)
  `),
  addWastedTry: db.prepare("UPDATE games SET wasted_tries = wasted_tries + 1 WHERE id = ?"),
  hints: db.prepare("SELECT type, payload FROM game_hints WHERE game_id = ? ORDER BY created_at"),
  addHint: db.prepare(`
    INSERT INTO game_hints (game_id, type, payload, created_at) VALUES (?, ?, ?, ?)
  `),
  finish: db.prepare(`
    UPDATE games SET status = @status, finished_at = @finishedAt
    WHERE id = @id AND status = 'playing'
  `),
  expire: db.prepare(`
    UPDATE games
    SET status = 'lost',
        finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', started_at, '+' || @limit || ' seconds')
    WHERE mode = @mode AND status = 'playing'
      AND julianday(started_at) < julianday(@now) - @limit / 86400.0
  `)
};

function find(date, mode, playerId) {
  return stmts.find.get(date, mode, playerId) ?? null;
}

function findById(id) {
  return stmts.byId.get(id) ?? null;
}

function create({ date, mode, playerId, secretVersion, startedAt }) {
  const id = stmts.insert.run({ date, mode, playerId, secretVersion, startedAt }).lastInsertRowid;
  return findById(id);
}

// Le mot a changé (admin) : la partie repart de zéro
const restart = db.transaction((id, secretVersion, startedAt) => {
  stmts.clearGuesses.run(id);
  stmts.clearHints.run(id);
  stmts.restart.run({ id, secretVersion, startedAt });
  return findById(id);
});

function guessedElementIds(gameId) {
  return stmts.guesses.all(gameId).map((r) => r.element_id);
}

function addGuess(gameId, elementId, at) {
  stmts.addGuess.run(gameId, gameId, elementId, at);
}

function addWastedTry(gameId) {
  stmts.addWastedTry.run(gameId);
}

function hints(gameId) {
  return stmts.hints.all(gameId).map((r) => ({ type: r.type, ...JSON.parse(r.payload) }));
}

function addHint(gameId, type, payload, at) {
  stmts.addHint.run(gameId, type, JSON.stringify(payload), at);
}

// Ne termine qu'une partie encore en cours (évite les doubles fins)
function finish(gameId, status, finishedAt) {
  return stmts.finish.run({ id: gameId, status, finishedAt }).changes === 1;
}

// Parties chronométrées dont le temps est écoulé, même si le joueur n'est
// pas revenu : comptées comme perdues à l'heure limite
function expireOverdue(mode, limitSeconds, now) {
  return stmts.expire.run({ mode, limit: limitSeconds, now }).changes;
}

module.exports = {
  expireOverdue,
  find,
  findById,
  create,
  restart,
  guessedElementIds,
  addGuess,
  addWastedTry,
  hints,
  addHint,
  finish
};
