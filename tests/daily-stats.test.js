const test = require("node:test");
const assert = require("node:assert/strict");
const { createDailyStatsStore } = require("../src/utils/daily-stats");

test("registers each player once for a given day", () => {
  const store = createDailyStatsStore();

  assert.equal(store.getCount("2026-08-05:secret"), 0);
  assert.equal(store.registerSuccess("2026-08-05:secret", "player-1"), 1);
  assert.equal(store.registerSuccess("2026-08-05:secret", "player-1"), 1);
  assert.equal(store.registerSuccess("2026-08-05:secret", "player-2"), 2);
});

test("uses a different key for another day or secret", () => {
  const store = createDailyStatsStore();

  assert.equal(store.registerSuccess("2026-08-05:secret-a", "player-1"), 1);
  assert.equal(store.registerSuccess("2026-08-06:secret-a", "player-1"), 1);
  assert.equal(store.getCount("2026-08-05:secret-a"), 1);
  assert.equal(store.getCount("2026-08-06:secret-a"), 1);
});
