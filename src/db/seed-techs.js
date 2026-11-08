const fs = require("fs");
const path = require("path");
const { toSlug } = require("./sync-elements");

const TECHS_FILE = path.join(__dirname, "../..", "techs.json");
const FIELDS = ["category", "difficulty", "utility", "dash_required", "hardcoded"];

// Version de techs.json : quand elle augmente, les techs manquantes sont
// ajoutées au démarrage suivant (voir syncTechs)
const SEED_VERSION = 2;
const SEED_VERSION_KEY = "techs_seed_version";

// Valeurs de la première liste (version 1). Une tech dont un champ a encore
// cette valeur n'a pas été modifiée dans l'admin : la version 2 la remplace.
const V1 = {
  "climbhop": ["Mechanics", "Beginner", "Stamina Preservation", "no", "yes"],
  "corner correction": ["Mechanics", "Passive", "Leniency", "no", "yes"],
  "coyote time": ["Mechanics", "Passive", "Leniency", "no", "yes"],
  "dash attack": ["Mechanics", "Beginner", "Interaction Window", "yes", "yes"],
  "fastfalling": ["Mechanics", "Beginner", "Vertical Speed", "no", "yes"],
  "liftboost": ["Mechanics", "Beginner", "Momentum Transfer", "no", "yes"],
  "superdash (super)": ["Dash Tech", "Intermediate", "Horizontal Speed", "yes", "yes"],
  "hyperdash (hyper)": ["Dash Tech", "Intermediate", "Horizontal Speed", "yes", "yes"],
  "extended super/hyper": ["Dash Tech", "Intermediate", "Dash Recovery", "yes", "derived"],
  "wavedash": ["Dash Tech", "Intermediate", "Horizontal Speed", "yes", "derived"],
  "ultradash (ultra)": ["Dash Tech", "Advanced", "Momentum Multiplier", "yes", "yes"],
  "wallbounce (wb)": ["Dash Tech", "Intermediate", "Vertical Height", "yes", "yes"],
  "demodash": ["Dash Tech", "Advanced", "Hitbox Reduction", "yes", "yes"],
  "neutral jump": ["Dashless Tech", "Intermediate", "Dashless Climb", "no", "derived"],
  "cornerboost (cb)": ["Dashless Tech", "Advanced", "Horizontal Speed", "no", "derived"],
  "jellyvator / theovator": ["Entity Tech", "Expert", "Infinite Height", "no", "derived"]
};

// Noms de la version 1 renommés en version 2
const RENAMED = { "demodash (demo)": "demodash", "neutral jump (neutral)": "neutral jump" };

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

function readTechs() {
  if (!fs.existsSync(TECHS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TECHS_FILE, "utf8"));
}

function allAliases(tech) {
  return [...new Set([...aliasesFromName(tech.name), ...(tech.aliases ?? [])])];
}

// Remplit la table au premier démarrage. Ensuite, à chaque nouvelle version
// de techs.json : ajoute les techs manquantes et met à jour les champs que
// l'admin n'a pas modifiés. Une tech modifiée ou créée dans l'admin garde ses
// valeurs ; les synonymes sont seulement ajoutés.
function seedTechs(db) {
  const getVersion = db.prepare("SELECT value FROM settings WHERE key = ?");
  const current = Number(getVersion.get(SEED_VERSION_KEY)?.value ?? 0);
  if (current >= SEED_VERSION) return;
  const techs = readTechs();
  if (techs.length === 0) return;

  const empty = db.prepare("SELECT COUNT(*) AS n FROM techs").get().n === 0;
  const insert = db.prepare(`
    INSERT INTO techs (slug, name, category, difficulty, utility, dash_required, hardcoded)
    VALUES (@slug, @name, @category, @difficulty, @utility, @dash_required, @hardcoded)
  `);
  const byName = db.prepare("SELECT * FROM techs WHERE name = ?");
  const rename = db.prepare("UPDATE techs SET name = ?, updated_at = datetime('now') WHERE id = ?");
  const setField = Object.fromEntries(
    FIELDS.map((f) => [f, db.prepare(`UPDATE techs SET ${f} = ?, updated_at = datetime('now') WHERE id = ?`)])
  );
  const alias = db.prepare("INSERT OR IGNORE INTO tech_aliases (alias, tech_id) VALUES (?, ?)");
  let added = 0;
  let updated = 0;

  db.transaction(() => {
    for (const tech of techs) {
      const oldName = RENAMED[tech.name.toLowerCase()];
      const row = byName.get(tech.name) ?? (oldName ? byName.get(oldName) : null);
      if (!row) {
        const id = insert.run({ ...tech, slug: toSlug(tech.name) }).lastInsertRowid;
        for (const a of allAliases(tech)) alias.run(a, id);
        added += 1;
        continue;
      }
      const v1 = V1[row.name.toLowerCase()];
      if (!v1) continue; // créée dans l'admin : on n'y touche pas
      let changed = false;
      if (row.name !== tech.name && oldName === row.name.toLowerCase()) {
        rename.run(tech.name, row.id);
        changed = true;
      }
      FIELDS.forEach((f, i) => {
        if (String(row[f]).toLowerCase() === v1[i].toLowerCase() && row[f] !== tech[f]) {
          setField[f].run(tech[f], row.id);
          changed = true;
        }
      });
      for (const a of allAliases(tech)) alias.run(a, row.id);
      if (changed) updated += 1;
    }
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      SEED_VERSION_KEY,
      String(SEED_VERSION)
    );
  })();
  console.log(
    empty
      ? `[DB] ${added} techs importées depuis techs.json`
      : `[DB] techs.json v${SEED_VERSION} : ${added} techs ajoutées, ${updated} mises à jour`
  );
}

module.exports = { seedTechs, aliasesFromName, SEED_VERSION };
