require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const players = require("../src/services/players");
const { progression } = require("../src/services/progression");

// Une partie finie de Celestedle A-Side, un essai, sans indice
function game(playerId, date, won = true) {
  const at = new Date(`${date}T12:00:00Z`).toISOString();
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at) VALUES (?, 'normal', ?, ?, 1, ?, ?)")
    .run(date, playerId, won ? "won" : "lost", at, at);
  db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, 1, 1, ?)").run(id, at);
}

const day = (n) => `2026-05-${String(n).padStart(2, "0")}`;

test("progression : chapitres, tampons, joueurs les plus avancés et filtre des actifs", () => {
  const climber = players.createPlayer().player;
  const beginner = players.createPlayer().player;
  const old = players.createPlayer().player;
  players.createPlayer(); // jamais joué : pas compté
  // climber : 6 victoires d'affilée (Old Site, à 5 fraises), une chute
  for (let i = 1; i <= 6; i++) game(climber.id, day(i));
  game(climber.id, day(7), false);
  game(beginner.id, day(7), false);
  game(old.id, "2026-01-10");

  const all = progression();
  assert.equal(all.players, 3);
  assert.equal(all.furthest[0].id, climber.id);
  assert.deepEqual([all.furthest[0].berries, all.furthest[0].falls, all.furthest[0].chapterName], [6, 1, "Old Site"]);
  assert.equal(all.chapters[1].reached, 2, "Forsaken City : climber et old");
  assert.equal(all.chapters[2].reached, 1);
  assert.equal(all.chapters[2].medianDays, 4, "5e fraise le 5 mai, première partie le 1er");
  assert.deepEqual(all.chapters.map((c) => c.current).slice(0, 3), [1, 1, 1]);
  const first = all.achievements.find((a) => a.id === "strawberry");
  assert.equal(first.earned, 2);
  assert.equal(all.achievements[0].id, "strawberry", "le plus facile en tête");
  const summit = all.achievements.find((a) => a.id === "summit");
  assert.equal(summit.earned, 0);
  assert.equal(summit.goal, 7);
  assert.ok(summit.avgProgress > 0);
  assert.equal(all.stamps.histogram.reduce((s, n) => s + n, 0), 3);

  const active = progression(day(1));
  assert.equal(active.players, 2, "old n'a pas joué depuis");
  assert.ok(active.furthest.every((p) => p.id !== old.id));
});
