const db = require("../db");
const { toSlug } = require("../db/sync-elements");

// Champs d'une tech, dans l'ordre des colonnes du jeu
const TECH_FIELDS = ["category", "difficulty", "utility", "dash_required", "hardcoded"];

const stmts = {
  active: db.prepare("SELECT * FROM techs WHERE is_active = 1 ORDER BY name"),
  all: db.prepare("SELECT * FROM techs ORDER BY name"),
  byId: db.prepare("SELECT * FROM techs WHERE id = ?"),
  byName: db.prepare("SELECT * FROM techs WHERE name = ?"),
  byAlias: db.prepare("SELECT t.* FROM techs t JOIN tech_aliases a ON a.tech_id = t.id WHERE a.alias = ?"),
  aliases: db.prepare("SELECT alias, tech_id FROM tech_aliases ORDER BY alias"),
  aliasesOf: db.prepare("SELECT alias FROM tech_aliases WHERE tech_id = ? ORDER BY alias"),
  activeAliases: db.prepare(`
    SELECT a.alias, t.name FROM tech_aliases a JOIN techs t ON t.id = a.tech_id
    WHERE t.is_active = 1 ORDER BY a.alias
  `),
  count: db.prepare("SELECT COUNT(*) AS n FROM techs"),
  insert: db.prepare(`
    INSERT INTO techs (slug, name, category, difficulty, utility, dash_required, hardcoded, media, is_active)
    VALUES (@slug, @name, @category, @difficulty, @utility, @dash_required, @hardcoded, @media, @isActive)
  `),
  update: db.prepare(`
    UPDATE techs SET name = @name, category = @category, difficulty = @difficulty, utility = @utility,
      dash_required = @dash_required, hardcoded = @hardcoded, media = @media, is_active = @isActive,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  clearAliases: db.prepare("DELETE FROM tech_aliases WHERE tech_id = ?"),
  addAlias: db.prepare("INSERT OR IGNORE INTO tech_aliases (alias, tech_id) VALUES (?, ?)")
};

// Même forme que les éléments pour le moteur de jeu : nom sous « nom »
function toTech(row) {
  if (!row) return null;
  return {
    id: row.id,
    nom: row.name,
    slug: row.slug,
    ...Object.fromEntries(TECH_FIELDS.map((f) => [f, row[f]])),
    media: row.media,
    isActive: row.is_active !== 0,
    aliases: stmts.aliasesOf.all(row.id).map((r) => r.alias)
  };
}

function listActive() {
  return stmts.active.all().map(toTech);
}

function listAll() {
  return stmts.all.all().map(toTech);
}

function findById(id) {
  return toTech(stmts.byId.get(id));
}

function findByName(name) {
  return toTech(stmts.byName.get(String(name ?? "").trim()));
}

function findByNameOrAlias(input) {
  const name = String(input ?? "").trim();
  if (!name) return null;
  return toTech(stmts.byName.get(name) ?? stmts.byAlias.get(name));
}

// { alias: nom de la tech }, pour la liste des suggestions
function listAliases() {
  return Object.fromEntries(stmts.activeAliases.all().map((r) => [r.alias, r.name]));
}

// Valeurs existantes de chaque champ (indices « 1 vérité, 2 mensonges »)
function vocabulary() {
  const techs = listActive();
  return Object.fromEntries(
    TECH_FIELDS.map((f) => [f, [...new Set(techs.map((t) => String(t[f]).toLowerCase()))].sort()])
  );
}

function writeAliases(id, aliases) {
  stmts.clearAliases.run(id);
  for (const alias of aliases) stmts.addAlias.run(alias, id);
}

const create = db.transaction((input) => {
  const id = stmts.insert.run({
    slug: toSlug(input.name),
    name: input.name,
    ...Object.fromEntries(TECH_FIELDS.map((f) => [f, input[f]])),
    media: input.media ?? null,
    isActive: input.isActive === false ? 0 : 1
  }).lastInsertRowid;
  writeAliases(id, input.aliases ?? []);
  return findById(id);
});

const update = db.transaction((id, input) => {
  const current = findById(id);
  if (!current) return null;
  stmts.update.run({
    id,
    name: input.name ?? current.nom,
    ...Object.fromEntries(TECH_FIELDS.map((f) => [f, input[f] ?? current[f]])),
    media: input.media === undefined ? current.media : input.media,
    isActive: (input.isActive ?? current.isActive) ? 1 : 0
  });
  if (input.aliases) writeAliases(id, input.aliases);
  return findById(id);
});

function count() {
  return stmts.count.get().n;
}

module.exports = {
  TECH_FIELDS,
  listActive,
  listAll,
  findById,
  findByName,
  findByNameOrAlias,
  listAliases,
  vocabulary,
  create,
  update,
  count
};
