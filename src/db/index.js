const Database = require("better-sqlite3");
const { dataPath } = require("../utils/data-dir");
const { migrate } = require("./migrate");
const { syncElementsFromJson } = require("./sync-elements");

const db = new Database(process.env.DB_PATH || dataPath("celestedle.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

migrate(db);
// db.json reste la source des éléments tant que l'éditeur admin n'existe pas
syncElementsFromJson(db);

module.exports = db;
