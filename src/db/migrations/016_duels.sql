-- Duels : deux joueurs cherchent le même élément, tiré au hasard (pas celui
-- du jour). Un salon est public (listé) ou privé (rejoint par son lien).
-- Les parties ont leurs propres tables, mêmes colonnes que games / guesses /
-- game_hints : elles ne comptent ni dans les stats, ni dans les fraises, ni
-- dans les classements. date = « duel:<id du salon> ».
CREATE TABLE duel_rooms (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL CHECK (mode IN ('normal', 'hard')),
  element_id  INTEGER NOT NULL REFERENCES elements(id),
  is_public   INTEGER NOT NULL DEFAULT 1,
  host_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  guest_id    TEXT REFERENCES players(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  started_at  TEXT,                  -- arrivée du second joueur : le duel commence
  closed_at   TEXT,                  -- salon fermé par son hôte avant le début
  rematch_id  TEXT                   -- salon de la revanche, s'il y en a une
);
CREATE INDEX duel_rooms_open ON duel_rooms (is_public, guest_id, closed_at, created_at);

CREATE TABLE duel_games (
  id             INTEGER PRIMARY KEY,
  date           TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('normal', 'hard')),
  player_id      TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'playing'
                 CHECK (status IN ('playing', 'won', 'forfeit', 'lost')),
  secret_version INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  wasted_tries   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (date, mode, player_id)
);

CREATE TABLE duel_guesses (
  game_id    INTEGER NOT NULL REFERENCES duel_games(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  element_id INTEGER NOT NULL REFERENCES elements(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, position)
);

CREATE TABLE duel_hints (
  game_id    INTEGER NOT NULL REFERENCES duel_games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('opposite', 'secret_info', 'truth_and_lies', 'info')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);

CREATE VIEW duel_game_summaries AS
  SELECT g.*,
         (SELECT COUNT(*) FROM duel_guesses gu WHERE gu.game_id = g.id) + g.wasted_tries AS tries,
         (SELECT COUNT(*) FROM duel_hints gh WHERE gh.game_id = g.id) AS hints,
         CASE WHEN g.finished_at IS NULL THEN NULL
              ELSE CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER)
         END AS seconds
  FROM duel_games g;
