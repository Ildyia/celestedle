require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const players = require("../src/services/players");
const trophies = require("../src/services/trophies");
const leaderboard = require("../src/services/leaderboard");
const { todayParis, addDays, weekStart } = require("../src/utils/dates");

// Une partie Celestedle finie ce jour-là : tries essais, en `seconds` secondes
function addGame(playerId, date, mode, { tries = 2, seconds = 60, won = true } = {}) {
  const elementId = db.prepare("SELECT id FROM elements ORDER BY id LIMIT 1").get().id;
  const finishedAt = new Date(`${date}T12:00:00Z`).toISOString();
  const startedAt = new Date(Date.parse(finishedAt) - seconds * 1000).toISOString();
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
    .run(date, mode, playerId, won ? "won" : "lost", startedAt, finishedAt);
  for (let i = 0; i < tries; i++) db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, ?, ?, ?)").run(id, i + 1, elementId, finishedAt);
}

function listedPlayer(name) {
  const { player } = players.createPlayer();
  return players.updateProfile(player, { name });
}

test("trophées : premier des jours passés par mode, champion de la semaine dernière", () => {
  const today = todayParis();
  const lastWeek = addDays(weekStart(today), -7);
  const ana = listedPlayer("Ana Climbs");
  const ben = listedPlayer("Ben Climbs");

  // Semaine dernière : Ana gagne deux jours en normal (moins d'essais),
  // Ben gagne un jour en hard. Avec si peu de joueurs, chaque victoire vaut
  // 50 points : Ben, trois victoires, gagne la semaine
  addGame(ana.id, lastWeek, "normal", { tries: 2 });
  addGame(ben.id, lastWeek, "normal", { tries: 4 });
  addGame(ana.id, addDays(lastWeek, 1), "normal", { tries: 2, seconds: 30 });
  addGame(ben.id, addDays(lastWeek, 1), "normal", { tries: 2, seconds: 90 });
  addGame(ben.id, addDays(lastWeek, 2), "hard", { tries: 3 });
  // Aujourd'hui ne compte pas encore : le jour n'est pas fini
  addGame(ben.id, today, "normal", { tries: 2 });
  addGame(ana.id, today, "normal", { tries: 5 });
  trophies.resetCache();

  const a = trophies.playerTrophies(ana.id);
  assert.equal(a.winner, 2);
  assert.deepEqual(a.winnerByBoard, { normal: 2 });
  assert.equal(a.champion, 0);
  const b = trophies.playerTrophies(ben.id);
  assert.deepEqual(b.winnerByBoard, { hard: 1 });
  assert.equal(b.champion, 1);
  assert.equal(b.isChampion, true);

  // Dans les classements : Ben est champion en titre, Ana a le record en
  // normal, Ben en hard. En tout, 2 trophées chacun : le plus récent gagne
  // (Ben, avec la semaine)
  const normal = leaderboard.getLeaderboard("daily", "normal");
  const row = (board, id) => board.top.find((e) => e.player.id === id);
  assert.equal(row(normal, ben.id).champion, true);
  assert.equal(row(normal, ana.id).champion, false);
  assert.equal(row(normal, ana.id).record, 2);
  assert.equal(row(normal, ben.id).record, 0);
  assert.equal(trophies.boardMarks("hard").record, ben.id);
  assert.equal(trophies.boardMarks(null).record, ben.id);
});
