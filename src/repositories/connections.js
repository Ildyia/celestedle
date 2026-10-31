const db = require("../db");

const stmts = {
  tags: db.prepare("SELECT * FROM connection_tags ORDER BY label"),
  tagById: db.prepare("SELECT * FROM connection_tags WHERE id = ?"),
  tagMembers: db.prepare("SELECT tag_id, element_id FROM connection_tag_elements"),
  // Éléments actifs ajoutés après le dernier passage en revue du tag
  unreviewed: db.prepare(`
    SELECT t.id AS tag_id, e.id AS element_id
    FROM connection_tags t JOIN elements e ON e.is_active = 1 AND e.created_at > t.reviewed_at
  `),
  insertTag: db.prepare(`
    INSERT INTO connection_tags (label, description) VALUES (@label, @description)
  `),
  updateTag: db.prepare(`
    UPDATE connection_tags SET label = @label, description = @description,
      reviewed_at = datetime('now')
    WHERE id = @id
  `),
  clearMembers: db.prepare("DELETE FROM connection_tag_elements WHERE tag_id = ?"),
  insertSuggestion: db.prepare(`
    INSERT INTO connection_tag_suggestions (player_id, label, elements, note)
    VALUES (@playerId, @label, @elements, @note)
  `),
  suggestions: db.prepare(`
    SELECT s.*, p.name AS player_name
    FROM connection_tag_suggestions s LEFT JOIN players p ON p.id = s.player_id
    ORDER BY s.created_at DESC, s.id DESC
  `),
  deleteSuggestion: db.prepare("DELETE FROM connection_tag_suggestions WHERE id = ?"),
  addMember: db.prepare("INSERT INTO connection_tag_elements (tag_id, element_id) VALUES (?, ?)"),
  deleteTag: db.prepare("DELETE FROM connection_tags WHERE id = ?"),

  puzzle: db.prepare("SELECT * FROM connection_puzzles WHERE date = ?"),
  insertPuzzle: db.prepare(`
    INSERT OR IGNORE INTO connection_puzzles (date, groups, tiles, rule, source, created_at, updated_at)
    VALUES (@date, @groups, @tiles, @rule, 'auto', @now, @now)
  `),
  replacePuzzle: db.prepare(`
    INSERT INTO connection_puzzles (date, groups, tiles, rule, source, created_at, updated_at)
    VALUES (@date, @groups, @tiles, @rule, 'admin', @now, @now)
    ON CONFLICT(date) DO UPDATE SET groups = excluded.groups, tiles = excluded.tiles, rule = excluded.rule,
      source = 'admin', version = version + 1, updated_at = excluded.updated_at
  `),

  game: db.prepare("SELECT * FROM connection_games WHERE date = ? AND player_id = ?"),
  gameById: db.prepare("SELECT * FROM connection_games WHERE id = ?"),
  insertGame: db.prepare(`
    INSERT INTO connection_games (date, player_id, puzzle_version, started_at)
    VALUES (@date, @playerId, @version, @startedAt)
  `),
  clearAttempts: db.prepare("DELETE FROM connection_attempts WHERE game_id = ?"),
  clearHints: db.prepare("DELETE FROM connection_hints WHERE game_id = ?"),
  hints: db.prepare("SELECT type, payload FROM connection_hints WHERE game_id = ? ORDER BY created_at, rowid"),
  addHint: db.prepare(`
    INSERT INTO connection_hints (game_id, type, payload, created_at)
    VALUES (@gameId, @type, @payload, @createdAt)
  `),
  restartGame: db.prepare(`
    UPDATE connection_games SET puzzle_version = @version, status = 'playing',
      started_at = @startedAt, finished_at = NULL
    WHERE id = @id
  `),
  finishGame: db.prepare(`
    UPDATE connection_games SET status = @status, finished_at = @finishedAt
    WHERE id = @id AND status = 'playing'
  `),
  attempts: db.prepare("SELECT * FROM connection_attempts WHERE game_id = ? ORDER BY position"),
  addAttempt: db.prepare(`
    INSERT INTO connection_attempts (game_id, position, element_ids, group_index, created_at)
    VALUES (@gameId, (SELECT COUNT(*) FROM connection_attempts WHERE game_id = @gameId),
            @elementIds, @groupIndex, @createdAt)
  `),

  // Chiffres du jour d'une grille : moyennes sur les victoires
  dayStats: db.prepare(`
    WITH day AS (
      SELECT g.status,
             (SELECT COUNT(*) FROM connection_attempts a
              WHERE a.game_id = g.id AND a.group_index IS NULL) AS mistakes,
             (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id) AS hints,
             (julianday(g.finished_at) - julianday(g.started_at)) * 86400 AS seconds
      FROM connection_games g
      WHERE g.date = ?
    )
    SELECT COUNT(*) AS players,
           COALESCE(SUM(status <> 'playing'), 0) AS finished,
           COALESCE(SUM(status = 'won'), 0) AS wins,
           COALESCE(SUM(status = 'lost'), 0) AS losses,
           COALESCE(SUM(status = 'playing'), 0) AS playing,
           ROUND(AVG(CASE WHEN status = 'won' THEN mistakes END), 1) AS avgMistakes,
           ROUND(AVG(CASE WHEN status = 'won' THEN hints END), 1) AS avgHints,
           CAST(ROUND(AVG(CASE WHEN status = 'won' THEN seconds END)) AS INTEGER) AS avgSeconds
    FROM day
  `),

  // Victoires du jour : moins d'erreurs et d'indices (un indice compte comme
  // une erreur), puis plus rapide
  dailyBoard: db.prepare(`
    WITH ranked AS (
      SELECT p.id, p.name, p.avatar, p.color,
             (SELECT COUNT(*) FROM connection_attempts a
              WHERE a.game_id = g.id AND a.group_index IS NULL) AS mistakes,
             (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id) AS hints,
             CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER) AS seconds,
             g.finished_at
      FROM connection_games g JOIN players p ON p.id = g.player_id
      WHERE g.date = @date AND g.status = 'won' AND p.is_hidden = 0 AND p.is_anonymous = 0
    )
    SELECT *, ROW_NUMBER() OVER (ORDER BY mistakes + hints, seconds, finished_at) AS rank
    FROM ranked ORDER BY rank LIMIT 50
  `)
};

function toTag(row, members, unreviewed) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    elementIds: members.get(row.id) ?? [],
    // Éléments jamais classés pour ce tag : il ne sert pas tant qu'il en reste
    unreviewedIds: unreviewed.get(row.id) ?? [],
    reviewedAt: row.reviewed_at
  };
}

function groupIds(rows) {
  const map = new Map();
  for (const { tag_id, element_id } of rows) {
    if (!map.has(tag_id)) map.set(tag_id, []);
    map.get(tag_id).push(element_id);
  }
  return map;
}

function listTags() {
  const members = groupIds(stmts.tagMembers.all());
  const unreviewed = groupIds(stmts.unreviewed.all());
  return stmts.tags.all().map((row) => toTag(row, members, unreviewed));
}

function findTag(id) {
  return listTags().find((tag) => tag.id === id) ?? null;
}

// Enregistrer un tag le passe en revue : les éléments non cochés ne l'ont pas
const saveTag = db.transaction((id, { label, description, elementIds }) => {
  if (id === null) {
    id = Number(stmts.insertTag.run({ label, description }).lastInsertRowid);
  } else {
    stmts.updateTag.run({ id, label, description });
  }
  stmts.clearMembers.run(id);
  for (const elementId of elementIds) stmts.addMember.run(id, elementId);
  return findTag(id);
});

function deleteTag(id) {
  return stmts.deleteTag.run(id).changes === 1;
}

function addSuggestion({ playerId, label, elements, note }) {
  return Number(stmts.insertSuggestion.run({ playerId, label, elements, note }).lastInsertRowid);
}

function listSuggestions() {
  return stmts.suggestions.all().map((row) => ({
    id: row.id,
    label: row.label,
    elements: row.elements,
    note: row.note,
    playerName: row.player_name,
    createdAt: row.created_at
  }));
}

function deleteSuggestion(id) {
  return stmts.deleteSuggestion.run(id).changes === 1;
}

function toPuzzle(row) {
  if (!row) return null;
  return { ...row, groups: JSON.parse(row.groups), tiles: JSON.parse(row.tiles) };
}

function findPuzzle(date) {
  return toPuzzle(stmts.puzzle.get(date));
}

// INSERT OR IGNORE : deux requêtes simultanées lisent la même grille
function createPuzzleIfMissing(date, { groups, tiles, rule = null }, now) {
  stmts.insertPuzzle.run({ date, groups: JSON.stringify(groups), tiles: JSON.stringify(tiles), rule, now });
  return findPuzzle(date);
}

function replacePuzzle(date, { groups, tiles, rule = null }, now) {
  stmts.replacePuzzle.run({ date, groups: JSON.stringify(groups), tiles: JSON.stringify(tiles), rule, now });
  return findPuzzle(date);
}

function findGame(date, playerId) {
  return stmts.game.get(date, playerId) ?? null;
}

function findGameById(id) {
  return stmts.gameById.get(id) ?? null;
}

function createGame({ date, playerId, version, startedAt }) {
  const id = stmts.insertGame.run({ date, playerId, version, startedAt }).lastInsertRowid;
  return findGameById(id);
}

// La grille a été régénérée : la partie repart de zéro
const restartGame = db.transaction((id, version, startedAt) => {
  stmts.clearAttempts.run(id);
  stmts.clearHints.run(id);
  stmts.restartGame.run({ id, version, startedAt });
  return findGameById(id);
});

function finishGame(id, status, finishedAt) {
  return stmts.finishGame.run({ id, status, finishedAt }).changes === 1;
}

function dayStats(date) {
  return stmts.dayStats.get(date);
}

function hints(gameId) {
  return stmts.hints.all(gameId).map((row) => ({ type: row.type, ...JSON.parse(row.payload) }));
}

function addHint(gameId, type, payload, createdAt) {
  stmts.addHint.run({ gameId, type, payload: JSON.stringify(payload), createdAt });
}

function attempts(gameId) {
  return stmts.attempts.all(gameId).map((row) => ({
    elementIds: JSON.parse(row.element_ids),
    groupIndex: row.group_index,
    createdAt: row.created_at
  }));
}

function addAttempt(gameId, elementIds, groupIndex, createdAt) {
  stmts.addAttempt.run({ gameId, elementIds: JSON.stringify(elementIds), groupIndex, createdAt });
}

function dailyBoard(date) {
  return stmts.dailyBoard.all({ date });
}

module.exports = {
  listTags,
  findTag,
  saveTag,
  deleteTag,
  addSuggestion,
  listSuggestions,
  deleteSuggestion,
  findPuzzle,
  createPuzzleIfMissing,
  replacePuzzle,
  findGame,
  createGame,
  findGameById,
  restartGame,
  finishGame,
  attempts,
  hints,
  addHint,
  dayStats,
  addAttempt,
  dailyBoard
};
