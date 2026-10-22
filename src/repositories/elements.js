const db = require("../db");
const { writeElementAttributes, toSlug } = require("../db/sync-elements");

// Forme renvoyée aux routes : { id, nom, type, lieu[], couleur[], shape, ... }.
// Les noms de champs français sont ceux de db.json et de l'API v1.
const SELECT_ELEMENT = `
  SELECT e.id, e.name, e.slug, e.sprite, e.is_active, e.managed_by,
         t.slug AS type, s.slug AS shape
  FROM elements e
  JOIN types t ON t.id = e.type_id
  JOIN shapes s ON s.id = e.shape_id
`;

const stmts = {
  active: db.prepare(`${SELECT_ELEMENT} WHERE e.is_active = 1`),
  all: db.prepare(SELECT_ELEMENT),
  byName: db.prepare(`${SELECT_ELEMENT} WHERE e.name = ?`),
  byId: db.prepare(`${SELECT_ELEMENT} WHERE e.id = ?`),
  byAlias: db.prepare(`${SELECT_ELEMENT} JOIN aliases a ON a.element_id = e.id WHERE a.alias = ?`),
  locations: db.prepare(`
    SELECT el.element_id, l.slug
    FROM element_locations el JOIN locations l ON l.id = el.location_id
    ORDER BY el.element_id, el.position
  `),
  colors: db.prepare(`
    SELECT ec.element_id, c.slug
    FROM element_colors ec JOIN colors c ON c.id = ec.color_id
    ORDER BY ec.element_id, ec.position
  `),
  locationsOf: db.prepare(`
    SELECT l.slug FROM element_locations el JOIN locations l ON l.id = el.location_id
    WHERE el.element_id = ? ORDER BY el.position
  `),
  colorsOf: db.prepare(`
    SELECT c.slug FROM element_colors ec JOIN colors c ON c.id = ec.color_id
    WHERE ec.element_id = ? ORDER BY ec.position
  `),
  aliases: db.prepare(`
    SELECT a.alias, e.name FROM aliases a JOIN elements e ON e.id = a.element_id
    WHERE e.is_active = 1 ORDER BY a.alias
  `),
  vocab: {
    types: db.prepare("SELECT slug FROM types ORDER BY slug"),
    shapes: db.prepare("SELECT slug FROM shapes ORDER BY slug"),
    colors: db.prepare("SELECT slug FROM colors ORDER BY slug"),
    locations: db.prepare("SELECT slug FROM locations ORDER BY chapter, slug")
  },
  insert: db.prepare(`
    INSERT INTO elements (slug, name, type_id, shape_id, sprite, is_active, managed_by)
    VALUES (@slug, @name, (SELECT id FROM types LIMIT 1), (SELECT id FROM shapes LIMIT 1),
            @sprite, @isActive, 'admin')
  `),
  update: db.prepare(`
    UPDATE elements SET name = @name, sprite = @sprite, is_active = @isActive,
      managed_by = 'admin', updated_at = datetime('now')
    WHERE id = @id
  `)
};

function groupByElement(rows) {
  const map = new Map();
  for (const { element_id, slug } of rows) {
    if (!map.has(element_id)) map.set(element_id, []);
    map.get(element_id).push(slug);
  }
  return map;
}

function toElement(row, lieu, couleur) {
  return {
    id: row.id,
    nom: row.name,
    slug: row.slug,
    type: row.type,
    lieu,
    couleur,
    shape: row.shape,
    sprite: row.sprite,
    isActive: row.is_active !== 0,
    managedBy: row.managed_by
  };
}

function byName(a, b) {
  return a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0;
}

function withAttributesBulk(rows) {
  const locations = groupByElement(stmts.locations.all());
  const colors = groupByElement(stmts.colors.all());
  return rows
    .map((row) => toElement(row, locations.get(row.id) || [], colors.get(row.id) || []))
    .sort(byName);
}

function withAttributes(row) {
  if (!row) return null;
  return toElement(
    row,
    stmts.locationsOf.all(row.id).map((r) => r.slug),
    stmts.colorsOf.all(row.id).map((r) => r.slug)
  );
}

// Éléments jouables, triés comme l'ancien Object.keys(db.json).sort() : cet
// ordre détermine le mot du jour tiré automatiquement.
function listActive() {
  return withAttributesBulk(stmts.active.all());
}

function listAll() {
  return withAttributesBulk(stmts.all.all());
}

// Recherche insensible à la casse (colonne COLLATE NOCASE)
function findByName(name) {
  return withAttributes(stmts.byName.get(String(name ?? "").trim()));
}

// Nom officiel ou synonyme officiel (aliases.json)
function findByNameOrAlias(input) {
  const name = String(input ?? "").trim();
  if (!name) return null;
  return withAttributes(stmts.byName.get(name) ?? stmts.byAlias.get(name.toLowerCase()));
}

function findById(id) {
  return withAttributes(stmts.byId.get(id));
}

function listAliases() {
  return Object.fromEntries(stmts.aliases.all().map((r) => [r.alias, r.name]));
}

function vocabulary() {
  return Object.fromEntries(
    Object.entries(stmts.vocab).map(([key, stmt]) => [key, stmt.all().map((r) => r.slug)])
  );
}

// Création et modification depuis l'admin : l'élément passe en
// managed_by = 'admin' et la synchronisation de db.json ne le touche plus.
const create = db.transaction((input) => {
  const id = stmts.insert.run({
    slug: toSlug(input.name),
    name: input.name,
    sprite: input.sprite ?? null,
    isActive: input.isActive === false ? 0 : 1
  }).lastInsertRowid;
  writeElementAttributes(db, id, input);
  return findById(id);
});

const update = db.transaction((id, input) => {
  const current = findById(id);
  if (!current) return null;
  stmts.update.run({
    id,
    name: input.name ?? current.nom,
    sprite: input.sprite === undefined ? current.sprite : input.sprite,
    isActive: (input.isActive ?? current.isActive) ? 1 : 0
  });
  writeElementAttributes(db, id, {
    type: input.type ?? current.type,
    shape: input.shape ?? current.shape,
    lieu: input.lieu ?? current.lieu,
    couleur: input.couleur ?? current.couleur
  });
  return findById(id);
});

// Même format que db.json, pour recopier les changements de l'admin dans le dépôt
function exportAsDbJson() {
  const out = {};
  for (const el of listActive()) {
    out[el.nom] = { couleur: el.couleur, shape: el.shape, lieu: el.lieu, type: el.type };
  }
  return out;
}

module.exports = {
  listActive,
  listAll,
  findByName,
  findByNameOrAlias,
  findById,
  listAliases,
  vocabulary,
  create,
  update,
  exportAsDbJson
};
