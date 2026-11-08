-- Techs : un Celestedle dont la réponse est une technique de jeu. Tables à
-- part des éléments (les identifiants des deux catalogues ne se mélangent
-- pas), mêmes colonnes de partie que games / guesses / game_hints.
CREATE TABLE techs (
  id            INTEGER PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT UNIQUE NOT NULL COLLATE NOCASE,
  category      TEXT NOT NULL,
  difficulty    TEXT NOT NULL,
  utility       TEXT NOT NULL,
  dash_required TEXT NOT NULL,
  hardcoded     TEXT NOT NULL,
  media         TEXT,                               -- image ou GIF envoyé depuis l'admin
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Autres noms acceptés : « super » pour « Superdash (Super) »
CREATE TABLE tech_aliases (
  alias   TEXT PRIMARY KEY COLLATE NOCASE,
  tech_id INTEGER NOT NULL REFERENCES techs(id) ON DELETE CASCADE
);

-- Une tech par jour et par mode (tech, tech-hard)
CREATE TABLE tech_secrets (
  date       TEXT NOT NULL,
  mode       TEXT NOT NULL CHECK (mode IN ('tech', 'tech-hard')),
  element_id INTEGER NOT NULL REFERENCES techs(id),
  source     TEXT NOT NULL CHECK (source IN ('auto', 'admin')),
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, mode)
);

CREATE TABLE tech_games (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('tech', 'tech-hard')),
  player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'playing'
                 CHECK (status IN ('playing', 'won', 'forfeit', 'lost')),
  secret_version INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  wasted_tries   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (date, mode, player_id)
);
CREATE INDEX tech_games_by_day ON tech_games (date, mode, status);

CREATE TABLE tech_guesses (
  game_id    INTEGER NOT NULL REFERENCES tech_games(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  element_id INTEGER NOT NULL REFERENCES techs(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, position)
);

CREATE TABLE tech_hints (
  game_id    INTEGER NOT NULL REFERENCES tech_games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('opposite', 'secret_info', 'truth_and_lies', 'info')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);

CREATE VIEW tech_game_summaries AS
  SELECT g.*,
         (SELECT COUNT(*) FROM tech_guesses gu WHERE gu.game_id = g.id) + g.wasted_tries AS tries,
         (SELECT COUNT(*) FROM tech_hints gh WHERE gh.game_id = g.id) AS hints,
         CASE WHEN g.finished_at IS NULL THEN NULL
              ELSE CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER)
         END AS seconds
  FROM tech_games g;
