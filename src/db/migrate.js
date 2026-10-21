const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Applique dans l'ordre les fichiers NNN_*.sql dont le numéro dépasse
// PRAGMA user_version, chacun dans sa propre transaction.
function migrate(db) {
  const current = db.pragma("user_version", { simple: true });
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = parseInt(file.slice(0, 3), 10);
    if (version <= current) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
    console.log(`[DB] Migration ${file} appliquée`);
  }
}

module.exports = { migrate };
