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
