require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const players = require("../src/services/players");
const elementsRepo = require("../src/repositories/elements");
const secretsRepo = require("../src/repositories/secrets");
const insightsRepo = require("../src/repositories/insights");
const { verdictFor, CATEGORIES } = require("../src/services/compare");

// Une partie finie : premier essai `opener`, puis `extra` essais, gagnée ou non
function game(date, opener, secret, { won = true, extra = 1 } = {}) {
  const { player } = players.createPlayer();
  const at = new Date(`${date}T12:00:00Z`).toISOString();
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at) VALUES (?, 'normal', ?, ?, 1, ?, ?)")
    .run(date, player.id, won ? "won" : "lost", at, at);
  const ids = [opener.id, ...Array.from({ length: extra }, () => secret.id)];
  ids.forEach((elementId, i) => db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, ?, ?, ?)").run(id, i + 1, elementId, at));
}

test("openers les plus efficaces : 3 parties au moins, le moins d'essais pour gagner d'abord, indices du premier essai", () => {
  const [a, b, secret] = elementsRepo.listActive().slice(10, 13);
  for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) secretsRepo.createIfMissing(date, "normal", secret.id);
  // a : 3 victoires en 2 essais ; b : 3 parties, 1 victoire en 5 essais
  for (const date of ["2026-03-01", "2026-03-02", "2026-03-03"]) game(date, a, secret, { extra: 1 });
  game("2026-03-01", b, secret, { extra: 4 });
  game("2026-03-02", b, secret, { won: false, extra: 2 });
  game("2026-03-03", b, secret, { won: false, extra: 2 });
  // c : 2 parties seulement, pas classé
  const c = elementsRepo.listActive()[14];
  game("2026-03-01", c, secret);
  game("2026-03-02", c, secret);

  const rows = insightsRepo.insights("2026-03-01").bestOpeners.normal;
  assert.deepEqual(rows.map((r) => r.name), [a.nom, b.nom]);
  assert.deepEqual([rows[0].games, rows[0].wins, rows[0].avgTries], [3, 3, 2]);
  assert.deepEqual([rows[1].games, rows[1].wins, rows[1].avgTries], [3, 1, 5]);
  const verdict = verdictFor(a, secret);
  assert.equal(rows[0].greens, CATEGORIES.filter((k) => verdict[k] === "correct").length);
  assert.equal(rows[0].clues, CATEGORIES.filter((k) => verdict[k] !== "wrong").length);
  assert.deepEqual(insightsRepo.insights("2026-04-01").bestOpeners.normal, [], "période sans parties");
});
