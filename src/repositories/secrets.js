const db = require("../db");

const stmts = {
  get: db.prepare("SELECT * FROM daily_secrets WHERE date = ?"),
  insertIfMissing: db.prepare(`
    INSERT OR IGNORE INTO daily_secrets (date, element_id, source)
    VALUES (?, ?, 'auto')
  `),
  replace: db.prepare(`
    INSERT INTO daily_secrets (date, element_id, source)
    VALUES (@date, @elementId, @source)
    ON CONFLICT(date) DO UPDATE SET
      element_id = excluded.element_id,
      source = excluded.source,
      version = version + 1,
      updated_at = datetime('now')
  `),
  recentElementIds: db.prepare(`
    SELECT element_id FROM daily_secrets
    WHERE date < @date AND date >= date(@date, @window)
  `)
};

function get(date) {
  return stmts.get.get(date) ?? null;
}

// INSERT OR IGNORE : si deux requêtes tirent le mot en même temps, la
// première l'emporte et les deux lisent la même ligne ensuite.
function createIfMissing(date, elementId) {
  stmts.insertIfMissing.run(date, elementId);
  return get(date);
}

function replace(date, elementId, source) {
  stmts.replace.run({ date, elementId, source });
  return get(date);
}

function recentElementIds(date, days) {
  return new Set(
    stmts.recentElementIds
      .all({ date, window: `-${days} days` })
      .map((r) => r.element_id)
  );
}

module.exports = { get, createIfMissing, replace, recentElementIds };
