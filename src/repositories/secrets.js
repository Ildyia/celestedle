const db = require("../db");

// Mot du jour d'un catalogue : daily_secrets (éléments) ou tech_secrets
function createSecretsRepo(table) {
  const stmts = {
    get: db.prepare(`SELECT * FROM ${table} WHERE date = ? AND mode = ?`),
    insertIfMissing: db.prepare(`
    INSERT OR IGNORE INTO ${table} (date, mode, element_id, source)
    VALUES (?, ?, ?, 'auto')
  `),
    replace: db.prepare(`
    INSERT INTO ${table} (date, mode, element_id, source)
    VALUES (@date, @mode, @elementId, @source)
    ON CONFLICT(date, mode) DO UPDATE SET
      element_id = excluded.element_id,
      source = excluded.source,
      version = version + 1,
      updated_at = datetime('now')
  `),
    recentElementIds: db.prepare(`
    SELECT element_id FROM ${table}
    WHERE mode = @mode AND date < @date AND date >= date(@date, @window)
  `)
  };

  function get(date, mode) {
    return stmts.get.get(date, mode) ?? null;
  }

  // INSERT OR IGNORE : si deux requêtes tirent le mot en même temps, la
  // première l'emporte et les deux lisent la même ligne ensuite.
  function createIfMissing(date, mode, elementId) {
    stmts.insertIfMissing.run(date, mode, elementId);
    return get(date, mode);
  }

  function replace(date, mode, elementId, source) {
    stmts.replace.run({ date, mode, elementId, source });
    return get(date, mode);
  }

  // Éléments tirés pour ce mode pendant les `days` jours précédant `date`
  function recentElementIds(date, mode, days) {
    if (days <= 0) return new Set();
    return new Set(
      stmts.recentElementIds
        .all({ date, mode, window: `-${days} days` })
        .map((r) => r.element_id)
    );
  }

  return { get, createIfMissing, replace, recentElementIds };
}

module.exports = { ...createSecretsRepo("daily_secrets"), createSecretsRepo };
