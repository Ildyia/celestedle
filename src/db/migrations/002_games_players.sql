-- Parties tenues par le serveur, profils joueurs, mode Hard, éléments
-- modifiables depuis l'admin. game_results (jamais utilisée) est remplacée
-- par games / guesses / game_hints.
DROP VIEW daily_stats;
DROP TABLE game_results;

CREATE TABLE players (
  id           TEXT PRIMARY KEY,                   -- identifiant public
  token_hash   TEXT UNIQUE NOT NULL,               -- SHA-256 du jeton secret
  name         TEXT NOT NULL,
  avatar       TEXT NOT NULL,
  color        TEXT NOT NULL,
  is_hidden    INTEGER NOT NULL DEFAULT 0,         -- absent des classements
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- Un mot par jour et par mode
CREATE TABLE daily_secrets_v2 (
  date       TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('normal', 'hard')),
  element_id INTEGER NOT NULL REFERENCES elements(id),
  source     TEXT NOT NULL CHECK (source IN ('auto', 'admin')),
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, mode)
);
INSERT INTO daily_secrets_v2 (date, mode, element_id, source, version, created_at, updated_at)
  SELECT date, 'normal', element_id, source, version, created_at, updated_at
  FROM daily_secrets;
DROP TABLE daily_secrets;
ALTER TABLE daily_secrets_v2 RENAME TO daily_secrets;

-- Horodatages ISO 8601 en UTC, écrits par l'application
CREATE TABLE games (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('normal', 'hard')),
  player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'playing'
                 CHECK (status IN ('playing', 'won', 'forfeit', 'lost')),
  secret_version INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  UNIQUE (date, mode, player_id)
);
CREATE INDEX games_by_day ON games (date, mode, status);
CREATE INDEX games_by_player ON games (player_id, mode, date);

CREATE TABLE guesses (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  element_id INTEGER NOT NULL REFERENCES elements(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, position)
);
CREATE INDEX guesses_by_element ON guesses (element_id);

CREATE TABLE game_hints (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('opposite', 'secret_info', 'truth_and_lies')),
  payload    TEXT NOT NULL,                        -- indice figé au moment de l'utilisation
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);

-- Résumé d'une partie : essais, indices et durée calculés
CREATE VIEW game_summaries AS
  SELECT g.*,
         (SELECT COUNT(*) FROM guesses gu WHERE gu.game_id = g.id) AS tries,
         (SELECT COUNT(*) FROM game_hints gh WHERE gh.game_id = g.id) AS hints,
         CASE WHEN g.finished_at IS NULL THEN NULL
              ELSE CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER)
         END AS seconds
  FROM games g;

-- Stats d'avant la 2.0 (stats-history.json), sans détail par joueur
CREATE TABLE legacy_daily_stats (
  date        TEXT NOT NULL,
  secret_word TEXT NOT NULL,
  victories   INTEGER NOT NULL,
  avg_tries   REAL NOT NULL,
  avg_hints   REAL NOT NULL,
  avg_seconds INTEGER NOT NULL,
  PRIMARY KEY (date, secret_word)
);

-- Un élément modifié dans l'admin n'est plus écrasé par db.json
ALTER TABLE elements ADD COLUMN managed_by TEXT NOT NULL DEFAULT 'json'
  CHECK (managed_by IN ('json', 'admin'));

-- Nom affiché d'un report, même quand l'élément n'existe pas en base
ALTER TABLE reports ADD COLUMN element_name TEXT;
CREATE INDEX reports_by_status ON reports (status);
