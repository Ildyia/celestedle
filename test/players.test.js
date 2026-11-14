require("./support/env");
const test = require("node:test");
const assert = require("node:assert/strict");
const { streaks } = require("../src/services/players");
const { todayParis, addDays, weekStart } = require("../src/utils/dates");

test("streaks : série en cours et meilleure série", () => {
  const today = todayParis();
  const days = (...offsets) => offsets.map((o) => addDays(today, o));

  assert.deepEqual(streaks(days(-5, -4, -3, -1, 0)), { current: 2, best: 3 });
  assert.deepEqual(streaks(days(-10, -9)), { current: 0, best: 2 });
  assert.deepEqual(streaks(days(-1)), { current: 1, best: 1 });
  assert.deepEqual(streaks([]), { current: 0, best: 0 });
});

test("weekStart renvoie le lundi", () => {
  assert.equal(weekStart("2026-10-22"), "2026-10-19"); // jeudi
  assert.equal(weekStart("2026-10-19"), "2026-10-19"); // lundi
  assert.equal(weekStart("2026-10-25"), "2026-10-19"); // dimanche
});

test("chapitres : fraises et morts comptées dans le chapitre en cours", () => {
  const { climbOf } = require("../src/services/chapters");
  const game = (day, won) => ({ date: `2026-01-${String(day).padStart(2, "0")}`, won, finishedAt: null });
  assert.equal(climbOf([]).chapter, 0);

  // Une mort au prologue, 5 victoires (chapitre 2 à la 5e), puis 2 morts
  const climb = climbOf([game(9, false), game(8, false), game(1, false), game(2, true), game(3, true), game(4, true), game(5, true), game(6, true)]);
  assert.equal(climb.berries, 5);
  assert.equal(climb.chapter, 2);
  assert.deepEqual(
    climb.chapters.slice(0, 3).map((c) => [c.name, c.reachedOn, c.strawberries, c.deaths]),
    [
      ["Prologue", "2026-01-01", 1, 1],
      ["Forsaken City", "2026-01-02", 4, 0],
      ["Old Site", "2026-01-06", 0, 2]
    ]
  );
  assert.equal(climb.chapters[3].reachedOn, null);
});

test("chapitres : un portrait et une couleur débloqués par chapitre", () => {
  const { REWARDS, unlockedRewards } = require("../src/services/chapters");
  const players = require("../src/services/players");
  assert.equal(REWARDS.length, 7);
  // Ni en double, ni déjà proposés à tous
  assert.equal(new Set(REWARDS.map((r) => r.avatar)).size, 7);
  assert.ok(REWARDS.every((r) => !players.AVATARS.includes(r.avatar) && !players.COLORS.includes(r.color)));
  assert.deepEqual(unlockedRewards(0), { avatars: [], colors: [] });
  assert.deepEqual(unlockedRewards(2).avatars, ["flingbird", "cassette-tape"]);
  assert.equal(unlockedRewards(7).colors.length, 7);
});
