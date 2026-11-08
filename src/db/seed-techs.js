const fs = require("fs");
const path = require("path");
const { toSlug } = require("./sync-elements");

const TECHS_FILE = path.join(__dirname, "../..", "techs.json");

// Autres noms tirés du nom : « Superdash (Super) » donne « Superdash » et
// « Super », « Jellyvator / Theovator » donne les deux noms
function aliasesFromName(name) {
  const aliases = new Set();
  const paren = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    aliases.add(paren[1].trim());
    aliases.add(paren[2].trim());
  }
  if (name.includes(" / ")) name.split(" / ").forEach((part) => aliases.add(part.trim()));
  aliases.delete(name);
  return [...aliases].filter(Boolean);
}

// techs.json remplit la table la première fois seulement : ensuite, les techs
// se gèrent dans l'admin
function seedTechs(db) {
  if (db.prepare("SELECT COUNT(*) AS n FROM techs").get().n > 0) return;
  if (!fs.existsSync(TECHS_FILE)) return;
  const techs = JSON.parse(fs.readFileSync(TECHS_FILE, "utf8"));
  const insert = db.prepare(`
    INSERT INTO techs (slug, name, category, difficulty, utility, dash_required, hardcoded)
    VALUES (@slug, @name, @category, @difficulty, @utility, @dash_required, @hardcoded)
  `);
  const alias = db.prepare("INSERT OR IGNORE INTO tech_aliases (alias, tech_id) VALUES (?, ?)");
  db.transaction(() => {
    for (const tech of techs) {
      const id = insert.run({ ...tech, slug: toSlug(tech.name) }).lastInsertRowid;
      for (const a of aliasesFromName(tech.name)) alias.run(a, id);
    }
  })();
  console.log(`[DB] ${techs.length} techs importées depuis techs.json`);
}

module.exports = { seedTechs, aliasesFromName };
