// À importer en premier dans chaque fichier de test : base en mémoire et
// dossier de données temporaire, propres à ce processus de test.
const fs = require("fs");
const os = require("os");
const path = require("path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "celestedle-test-"));
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = ":memory:";
process.env.ADMIN_PASSWORD = "test-admin-password";
process.env.DISCORD_BOT_TOKEN = "";
process.env.RANDOM_SEED = "";
process.env.DISABLE_RATE_LIMIT = "1";
// Les tests de Connections vérifient aussi l'accès réservé : ils partent du
// playtest (ouvert à tous par défaut en vrai, voir connections-default.test.js)
process.env.CONNECTIONS_ACCESS ??= "playtest";

// Fichiers v1 à importer, écrits avant le premier require de la base
function writeLegacyFiles({ reports, history }) {
  if (reports) fs.writeFileSync(path.join(dataDir, "reports.json"), JSON.stringify(reports));
  if (history) fs.writeFileSync(path.join(dataDir, "stats-history.json"), JSON.stringify(history));
}

module.exports = { dataDir, writeLegacyFiles };
