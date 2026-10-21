const db = require("../db");

// Les routes attendent encore la forme de db.json : { nom, type, lieu[],
// couleur[], shape }. Le renommage en anglais viendra avec la phase 2.
const stmts = {
  elements: db.prepare(`
    SELECT e.id, e.name, e.sprite, t.slug AS type, s.slug AS shape
    FROM elements e
    JOIN types t ON t.id = e.type_id
    JOIN shapes s ON s.id = e.shape_id
    WHERE e.is_active = 1
  `),
  byName: db.prepare(`
    SELECT e.id, e.name, e.sprite, e.is_active, t.slug AS type, s.slug AS shape
    FROM elements e
    JOIN types t ON t.id = e.type_id
    JOIN shapes s ON s.id = e.shape_id
    WHERE e.name = ?
  `),
  byId: db.prepare(`
    SELECT e.id, e.name, e.sprite, e.is_active, t.slug AS type, s.slug AS shape
    FROM elements e
    JOIN types t ON t.id = e.type_id
    JOIN shapes s ON s.id = e.shape_id
    WHERE e.id = ?
  `),
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

function toLegacyShape(row, lieu, couleur) {
  return {
    id: row.id,
    nom: row.name,
    type: row.type,
    lieu,
    couleur,
    shape: row.shape,
    sprite: row.sprite,
    isActive: row.is_active !== 0
  };
}

// Éléments jouables, triés comme l'ancien Object.keys(db.json).sort() : cet
// ordre détermine le mot du jour tiré automatiquement.
function listActive() {
  const locations = groupByElement(stmts.locations.all());
  const colors = groupByElement(stmts.colors.all());
  return stmts.elements
    .all()
    .map((row) =>
      toLegacyShape(row, locations.get(row.id) || [], colors.get(row.id) || [])
    )
    .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
}

function withAttributes(row) {
  if (!row) return null;
  return toLegacyShape(
    row,
    stmts.locationsOf.all(row.id).map((r) => r.slug),
    stmts.colorsOf.all(row.id).map((r) => r.slug)
  );
}

// Recherche insensible à la casse (colonne COLLATE NOCASE)
function findByName(name) {
  return withAttributes(stmts.byName.get(String(name ?? "").trim()));
}

function findById(id) {
  return withAttributes(stmts.byId.get(id));
}

module.exports = { listActive, findByName, findById };
