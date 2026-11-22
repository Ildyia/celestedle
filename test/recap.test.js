require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/db");
const players = require("../src/services/players");
const staff = require("../src/services/staff");
const secretsRepo = require("../src/repositories/secrets");
const elementsRepo = require("../src/repositories/elements");
const connections = require("../src/services/connections");
const recap = require("../src/services/recap");
const { dailyEmbed, weeklyEmbed } = require("../src/discord/recap-embeds");
const { createRecapPoster, setChannelId } = require("../src/discord/recap-poster");

// Lundi 23 novembre 2026 : le récap porte sur dimanche 22, la semaine du 16
const SUNDAY = "2026-11-22";
const SITE = "https://example.test/";

function listedPlayer(name) {
  const { player } = players.createPlayer();
  return players.updateProfile(player, { name });
}

function addGame(playerId, date, mode, { tries = 2, won = true } = {}) {
  const elementId = db.prepare("SELECT id FROM elements ORDER BY id LIMIT 1").get().id;
  const finishedAt = new Date(`${date}T12:00:00Z`).toISOString();
  const { lastInsertRowid: id } = db
    .prepare("INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
    .run(date, mode, playerId, won ? "won" : "lost", finishedAt, finishedAt);
  for (let i = 0; i < tries; i++) db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, ?, ?, ?)").run(id, i + 1, elementId, finishedAt);
}

const ana = listedPlayer("Ana_Climbs_");
const ben = listedPlayer("Ben Climbs");
const answer = elementsRepo.listActive()[3];
secretsRepo.createIfMissing(SUNDAY, "normal", answer.id);
addGame(ana.id, SUNDAY, "normal", { tries: 2 });
addGame(ben.id, SUNDAY, "normal", { tries: 5 });
addGame(ben.id, "2026-11-18", "hard", { tries: 3 });
addGame(listedPlayer("Lost Cat").id, SUNDAY, "normal", { won: false, tries: 9 });

test("récap du jour : réponse, joueurs, réussite et podium ; Connections seulement s'il est ouvert à tous", () => {
  const day = recap.dailyRecap(SUNDAY);
  const normal = day.celestedle.find((d) => d.mode === "normal");
  assert.equal(normal.answer, answer.nom);
  assert.equal(normal.finished, 3);
  assert.equal(normal.winRate, 67);
  assert.deepEqual(normal.podium.map((r) => r.name), ["Ana_Climbs_", "Ben Climbs"]);
  assert.equal(day.celestedle.find((d) => d.mode === "hard").finished, 0);
  assert.equal(day.connections, null, "playtest : pas de Connections dans un salon public");

  staff.setConnectionsAccess("public");
  // Une grille de Connections dimanche, finie par Ana sans trouver le 2e groupe
  const puzzle = connections.getPuzzle(SUNDAY, "normal");
  const at = `${SUNDAY}T10:00:00.000Z`;
  const { lastInsertRowid: gameId } = db
    .prepare("INSERT INTO connection_games (date, player_id, puzzle_version, status, started_at, finished_at) VALUES (?, ?, ?, 'lost', ?, ?)")
    .run(SUNDAY, ana.id, puzzle.version, at, at);
  [0, 2].forEach((groupIndex, position) =>
    db.prepare("INSERT INTO connection_attempts (game_id, position, element_ids, group_index, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(gameId, position, JSON.stringify(puzzle.groups[groupIndex].elementIds), groupIndex, at)
  );
  const cx = recap.dailyRecap(SUNDAY).connections.find((d) => d.mode === "normal");
  assert.equal(cx.finished, 1);
  assert.equal(cx.winRate, 0);
  assert.deepEqual(cx.hardest, { label: puzzle.groups[1].label, share: 0 });
  staff.setConnectionsAccess("playtest");
});

test("champion de la semaine : le plus de points de la semaine terminée", () => {
  const week = recap.weeklyRecap("2026-11-16");
  assert.equal(week.to, SUNDAY);
  assert.ok(week.podium.length >= 2);
  assert.ok(week.podium[0].points >= week.podium[1].points);
  assert.ok(week.podium.some((p) => p.name === "Ben Climbs" && p.games === 2));
});

test("messages : réponse sous spoiler, noms sans mise en forme, jours sans joueurs", () => {
  const daily = dailyEmbed(recap.dailyRecap(SUNDAY), SITE);
  assert.match(daily.description, /Sunday 22 November/);
  const normal = daily.fields.find((f) => f.name === "Celestedle · A-Side").value;
  assert.ok(normal.includes(`||${answer.nom.charAt(0).toUpperCase()}${answer.nom.slice(1)}||`));
  assert.ok(normal.includes("🥇 **Ana\\_Climbs\\_**"), normal);
  assert.ok(normal.includes("2 tries"));
  assert.equal(daily.fields.find((f) => f.name === "Celestedle · B-Side").value.includes("Nobody"), true);
  assert.ok(daily.fields.every((f) => f.value.length <= 1024));

  const empty = weeklyEmbed({ from: "2020-01-06", to: "2020-01-12", podium: [] }, SITE);
  assert.match(empty.description, /up for grabs/);
});

test("minuit : un message par jour, la semaine en plus le lundi, rattrapage jusqu'à 6 h seulement", async () => {
  const sent = [];
  let clock = new Date("2026-11-22T23:01:00Z"); // lundi 00:01 à Paris
  const poster = createRecapPoster({ send: async (channel, embeds) => sent.push({ channel, embeds }), now: () => clock });

  assert.equal(await poster.postIfDue(), false, "pas de salon choisi : rien");
  setChannelId("123");
  assert.equal(await poster.postIfDue(), true);
  assert.equal(sent[0].channel, "123");
  assert.deepEqual(sent[0].embeds.map((e) => e.title), ["🏔️ A new climb is up!", "🏆 Champion of the week"]);
  assert.equal(await poster.postIfDue(), false, "déjà posté aujourd'hui");

  clock = new Date("2026-11-24T09:00:00Z"); // mardi 10 h : trop tard pour « a new climb »
  assert.equal(await poster.postIfDue(), false);
  clock = new Date("2026-11-24T23:01:00Z"); // mercredi 00:01 : le récap seul
  assert.equal(await poster.postIfDue(), true);
  assert.equal(sent[1].embeds.length, 1);
});
