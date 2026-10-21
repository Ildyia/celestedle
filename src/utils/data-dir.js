const fs = require("fs");
const path = require("path");

// Fichiers écrits pendant l'exécution (reports, stats). En prod, ce dossier est
// un volume Docker : il survit aux redéploiements, contrairement au conteneur.
const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, "../../data")
);

// Anciens emplacements, repris une seule fois si le fichier n'existe pas encore
const LEGACY_PATHS = {
  "reports.json": path.join(__dirname, "../reports.json"),
  "stats-history.json": path.join(__dirname, "../../stats-history.json")
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function dataPath(fileName) {
  const target = path.join(DATA_DIR, fileName);
  const legacy = LEGACY_PATHS[fileName];
  if (!fs.existsSync(target) && legacy && fs.existsSync(legacy)) {
    fs.copyFileSync(legacy, target);
    console.log(`[DATA] ${fileName} repris depuis ${legacy}`);
  }
  return target;
}

module.exports = { DATA_DIR, dataPath };
