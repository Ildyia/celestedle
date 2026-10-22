-- Vocabulaires contrôlés : remplacent ALL_TYPES, ALL_shapeES, ALL_LOCATIONS, ALL_COLORS
CREATE TABLE types (
  id    INTEGER PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL
);
CREATE TABLE shapes (
  id    INTEGER PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL
);
CREATE TABLE locations (
  id      INTEGER PRIMARY KEY,
  slug    TEXT UNIQUE NOT NULL,
  label   TEXT NOT NULL,
  chapter INTEGER NOT NULL            -- 0 prologue … 9 farewell, 99 inconnu
);
CREATE TABLE colors (
  id    INTEGER PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  hex   TEXT
);

CREATE TABLE elements (
  id         INTEGER PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,                 -- "badeline-orb", ne change jamais
  name       TEXT UNIQUE NOT NULL COLLATE NOCASE,  -- "badeline orb", tel que dans db.json
  type_id    INTEGER NOT NULL REFERENCES types(id),
  shape_id   INTEGER NOT NULL REFERENCES shapes(id),
  sprite     TEXT,                                 -- remplace mapping.json
  is_active  INTEGER NOT NULL DEFAULT 1,           -- retiré du jeu sans casser l'historique
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE element_locations (
  element_id  INTEGER NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  position    INTEGER NOT NULL,                    -- ordre d'affichage
  PRIMARY KEY (element_id, location_id)
);
CREATE TABLE element_colors (
  element_id INTEGER NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  color_id   INTEGER NOT NULL REFERENCES colors(id),
  position   INTEGER NOT NULL,
  PRIMARY KEY (element_id, color_id)
);
CREATE TABLE aliases (                             -- synonymes officiels (phase 4)
  alias      TEXT PRIMARY KEY COLLATE NOCASE,
  element_id INTEGER NOT NULL REFERENCES elements(id) ON DELETE CASCADE
);

CREATE TABLE daily_secrets (
  date       TEXT PRIMARY KEY,                     -- "2026-10-22", fuseau Europe/Paris
  element_id INTEGER NOT NULL REFERENCES elements(id),
  source     TEXT NOT NULL CHECK (source IN ('auto', 'admin')),
  version    INTEGER NOT NULL DEFAULT 1,           -- +1 à chaque changement admin
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE game_results (                        -- phase 2
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL REFERENCES daily_secrets(date),
  player_id  TEXT NOT NULL,
  outcome    TEXT NOT NULL CHECK (outcome IN ('win', 'forfeit')),
  tries      INTEGER NOT NULL CHECK (tries BETWEEN 1 AND 500),
  hints      INTEGER NOT NULL CHECK (hints BETWEEN 0 AND 3),
  seconds    INTEGER NOT NULL CHECK (seconds >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, player_id)
);

CREATE TABLE reports (                             -- phase 3
  id                 TEXT PRIMARY KEY,
  element_id         INTEGER REFERENCES elements(id),
  bug_type           TEXT NOT NULL,
  description        TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 1000),
  is_spoiler         INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'working', 'fixed', 'cant_reproduce', 'wrong')),
  discord_public_id  TEXT,
  discord_private_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE report_votes (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  voter_id  TEXT NOT NULL,                         -- "web:<uuid>" ou "discord:<id>"
  value     INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (report_id, voter_id)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIEW daily_stats AS
  SELECT date,
         COUNT(*) AS victories,
         ROUND(AVG(tries), 1) AS avg_tries,
         ROUND(AVG(hints), 1) AS avg_hints,
         CAST(ROUND(AVG(seconds)) AS INTEGER) AS avg_seconds
  FROM game_results
  WHERE outcome = 'win'
  GROUP BY date;
