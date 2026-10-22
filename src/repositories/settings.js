const db = require("../db");

const stmts = {
  get: db.prepare("SELECT value FROM settings WHERE key = ?"),
  set: db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
};

function get(key, fallback = null) {
  return stmts.get.get(key)?.value ?? fallback;
}

function getNumber(key, fallback) {
  const value = Number(get(key));
  return Number.isFinite(value) && get(key) !== null ? value : fallback;
}

function set(key, value) {
  stmts.set.run(key, String(value));
}

module.exports = { get, getNumber, set };
