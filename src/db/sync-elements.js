const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const ELEMENTS_FILE = path.join(ROOT, "db.json");
const ALIASES_FILE = path.join(ROOT, "aliases.json");
const SPRITES_FILE = path.join(ROOT, "public/assets/entities/mapping.json");

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
  return (Array.isArray(value) ? value : [value]).map((v) =>
    String(v).trim().toLowerCase()
  );
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Trouve ou crée une valeur de vocabulaire (types, shapes, colors, locations)
function vocabResolver(db) {
  const cache = new Map();
  const statements = {};
  for (const table of ["types", "shapes", "colors", "locations"]) {
    statements[table] = {
      insert: db.prepare(
        table === "locations"
          ? `INSERT INTO locations (slug, label, chapter) VALUES (@slug, @slug, @chapter)
             ON CONFLICT(slug) DO NOTHING`
          : `INSERT INTO ${table} (slug, label) VALUES (@slug, @slug)
             ON CONFLICT(slug) DO NOTHING`
      ),
      get: db.prepare(`SELECT id FROM ${table} WHERE slug = ?`)
    };
  }

  return (table, slug) => {
    const key = `${table}:${slug}`;
    if (!cache.has(key)) {
      const chapter = CHAPTERS.indexOf(slug);
      statements[table].insert.run({ slug, chapter: chapter === -1 ? 99 : chapter });
      cache.set(key, statements[table].get.get(slug).id);
    }
    return cache.get(key);
  };
}

// Écrit type, forme, lieux et couleurs d'un élément. Partagé avec l'éditeur
// de l'admin.
function writeElementAttributes(db, elementId, attrs) {
  const vocabId = vocabResolver(db);
  db.prepare(
    `UPDATE elements SET type_id = ?, shape_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    vocabId("types", asList(attrs.type)[0]),
    vocabId("shapes", asList(attrs.shape)[0]),
    elementId
  );

  db.prepare("DELETE FROM element_locations WHERE element_id = ?").run(elementId);
  const addLocation = db.prepare(
    "INSERT INTO element_locations (element_id, location_id, position) VALUES (?, ?, ?)"
  );
  asList(attrs.lieu).forEach((slug, i) =>
    addLocation.run(elementId, vocabId("locations", slug), i)
  );

  db.prepare("DELETE FROM element_colors WHERE element_id = ?").run(elementId);
  const addColor = db.prepare(
    "INSERT INTO element_colors (element_id, color_id, position) VALUES (?, ?, ?)"
  );
  asList(attrs.couleur).forEach((slug, i) =>
    addColor.run(elementId, vocabId("colors", slug), i)
  );
}

// Recopie db.json, mapping.json et aliases.json dans la base à chaque
// démarrage. Les éléments modifiés dans l'admin (managed_by = 'admin') ne
// sont pas touchés. Les éléments retirés de db.json sont désactivés, pas
// supprimés, pour garder l'historique des mots du jour.
function syncElementsFromJson(db) {
  const elements = readJson(ELEMENTS_FILE);
  const sprites = readJson(SPRITES_FILE);
  const aliases = fs.existsSync(ALIASES_FILE) ? readJson(ALIASES_FILE) : {};
  const vocabId = vocabResolver(db);

  const findElement = db.prepare("SELECT id, managed_by FROM elements WHERE name = ?");
  const insertElement = db.prepare(`
    INSERT INTO elements (slug, name, type_id, shape_id, sprite, is_active)
    VALUES (@slug, @name, @typeId, @shapeId, @sprite, 1)
  `);
  const refreshElement = db.prepare(`
    UPDATE elements SET sprite = @sprite, is_active = 1, updated_at = datetime('now')
    WHERE id = @id
  `);

  const sync = db.transaction(() => {
    const seenIds = [];

    for (const [name, attrs] of Object.entries(elements)) {
      const existing = findElement.get(name);
      if (existing?.managed_by === "admin") {
        seenIds.push(existing.id);
        continue;
      }

      let id = existing?.id;
      const sprite = sprites[name.toLowerCase()] ?? null;
      if (id) {
        refreshElement.run({ id, sprite });
      } else {
        id = insertElement.run({
          slug: toSlug(name),
          name,
          typeId: vocabId("types", asList(attrs.type)[0]),
          shapeId: vocabId("shapes", asList(attrs.shape)[0]),
          sprite
        }).lastInsertRowid;
      }
      writeElementAttributes(db, id, attrs);
      seenIds.push(id);
    }

    const placeholders = seenIds.map(() => "?").join(",");
    const deactivated = db
      .prepare(
        `UPDATE elements SET is_active = 0, updated_at = datetime('now')
         WHERE is_active = 1 AND managed_by = 'json' AND id NOT IN (${placeholders})`
      )
      .run(...seenIds).changes;

    // Synonymes officiels : remplacés entièrement par aliases.json
    db.prepare("DELETE FROM aliases").run();
    const addAlias = db.prepare(
      "INSERT OR IGNORE INTO aliases (alias, element_id) SELECT ?, id FROM elements WHERE name = ?"
    );
    for (const [alias, target] of Object.entries(aliases)) {
      addAlias.run(alias.trim().toLowerCase(), target);
    }

    return deactivated;
  });

  const deactivated = sync();
  console.log(
    `[DB] ${Object.keys(elements).length} éléments synchronisés depuis db.json` +
      (deactivated ? `, ${deactivated} désactivé(s)` : "")
  );
}

module.exports = { syncElementsFromJson, writeElementAttributes, toSlug, CHAPTERS };
