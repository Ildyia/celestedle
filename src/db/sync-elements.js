const fs = require("fs");
const path = require("path");

const ELEMENTS_FILE = path.join(__dirname, "../../db.json");
const SPRITES_FILE = path.join(__dirname, "../../public/assets/entities/mapping.json");

// Ordre des chapitres, pour trier les lieux
const CHAPTERS = [
  "prologue",
  "city",
  "site",
  "resort",
  "ridge",
  "temple",
  "reflection",
  "summit",
  "core",
  "farewell"
];

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function asList(value) {
  return (Array.isArray(value) ? value : [value]).map((v) => String(v).trim());
}

// Recopie db.json et mapping.json dans la base à chaque démarrage. Les
// éléments retirés de db.json sont désactivés, pas supprimés, pour garder
// l'historique des mots du jour.
function syncElementsFromJson(db) {
  const elements = JSON.parse(fs.readFileSync(ELEMENTS_FILE, "utf8"));
  const sprites = JSON.parse(fs.readFileSync(SPRITES_FILE, "utf8"));

  const vocabIds = {};
  const vocabStatements = {};
  for (const table of ["types", "shapes", "colors", "locations"]) {
    const insert =
      table === "locations"
        ? `INSERT INTO locations (slug, label, chapter) VALUES (@slug, @slug, @chapter)
           ON CONFLICT(slug) DO NOTHING`
        : `INSERT INTO ${table} (slug, label) VALUES (@slug, @slug)
           ON CONFLICT(slug) DO NOTHING`;
    vocabStatements[table] = {
      insert: db.prepare(insert),
      get: db.prepare(`SELECT id FROM ${table} WHERE slug = ?`)
    };
    vocabIds[table] = new Map();
  }

  const vocabId = (table, slug) => {
    const cache = vocabIds[table];
    if (!cache.has(slug)) {
      const chapter = CHAPTERS.indexOf(slug);
      vocabStatements[table].insert.run({
        slug,
        chapter: chapter === -1 ? 99 : chapter
      });
      cache.set(slug, vocabStatements[table].get.get(slug).id);
    }
    return cache.get(slug);
  };

  const upsertElement = db.prepare(`
    INSERT INTO elements (slug, name, type_id, shape_id, sprite, is_active)
    VALUES (@slug, @name, @typeId, @shapeId, @sprite, 1)
    ON CONFLICT(name) DO UPDATE SET
      type_id = excluded.type_id,
      shape_id = excluded.shape_id,
      sprite = excluded.sprite,
      is_active = 1,
      updated_at = datetime('now')
  `);
  const getElementId = db.prepare("SELECT id FROM elements WHERE name = ?");
  const clearLocations = db.prepare("DELETE FROM element_locations WHERE element_id = ?");
  const clearColors = db.prepare("DELETE FROM element_colors WHERE element_id = ?");
  const addLocation = db.prepare(
    "INSERT INTO element_locations (element_id, location_id, position) VALUES (?, ?, ?)"
  );
  const addColor = db.prepare(
    "INSERT INTO element_colors (element_id, color_id, position) VALUES (?, ?, ?)"
  );

  const sync = db.transaction(() => {
    const activeIds = [];

    for (const [name, attrs] of Object.entries(elements)) {
      upsertElement.run({
        slug: toSlug(name),
        name,
        typeId: vocabId("types", String(attrs.type).trim()),
        shapeId: vocabId("shapes", String(attrs.shape).trim()),
        sprite: sprites[name.toLowerCase()] ?? null
      });
      const id = getElementId.get(name).id;
      activeIds.push(id);

      clearLocations.run(id);
      asList(attrs.lieu).forEach((slug, i) =>
        addLocation.run(id, vocabId("locations", slug), i)
      );
      clearColors.run(id);
      asList(attrs.couleur).forEach((slug, i) =>
        addColor.run(id, vocabId("colors", slug), i)
      );
    }

    const placeholders = activeIds.map(() => "?").join(",");
    return db
      .prepare(
        `UPDATE elements SET is_active = 0, updated_at = datetime('now')
         WHERE is_active = 1 AND id NOT IN (${placeholders})`
      )
      .run(...activeIds).changes;
  });

  const deactivated = sync();
  console.log(
    `[DB] ${Object.keys(elements).length} éléments synchronisés depuis db.json` +
      (deactivated ? `, ${deactivated} désactivé(s)` : "")
  );
}

module.exports = { syncElementsFromJson };
