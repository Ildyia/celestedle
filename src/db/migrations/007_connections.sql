-- Connections : 16 éléments à ranger en 4 groupes de 4. Les groupes viennent
-- des attributs des éléments et de tags propres à ce mode (jamais utilisés
-- par le jeu principal).

-- Tag : les éléments cochés l'ont, tous les autres ne l'ont pas. reviewed_at
-- (format datetime('now'), comme elements.created_at) date le dernier passage
-- en revue : un élément créé après n'a pas été classé et rend le tag
-- incomplet.
CREATE TABLE connection_tags (
  id          INTEGER PRIMARY KEY,
  label       TEXT UNIQUE NOT NULL COLLATE NOCASE,
  description TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE connection_tag_elements (
  tag_id     INTEGER NOT NULL REFERENCES connection_tags(id) ON DELETE CASCADE,
  element_id INTEGER NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
  PRIMARY KEY (tag_id, element_id)
);

-- Grille du jour, figée à la création : groups = JSON
-- [{ key, label, level, elementIds: [4 ids] }], du plus facile (level 0) au
-- plus dur ; tiles = ordre d'affichage des 16 ids
CREATE TABLE connection_puzzles (
  date       TEXT PRIMARY KEY,
  groups     TEXT NOT NULL,
  tiles      TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('auto', 'admin')),
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE connection_games (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL,
  player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  puzzle_version INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  UNIQUE (date, player_id)
);
CREATE INDEX connection_games_by_day ON connection_games (date, status);

-- Une proposition de 4 cases ; group_index = groupe trouvé, NULL = erreur
CREATE TABLE connection_attempts (
  game_id     INTEGER NOT NULL REFERENCES connection_games(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  element_ids TEXT NOT NULL,                       -- JSON trié, pour repérer les doublons
  group_index INTEGER,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, position)
);
