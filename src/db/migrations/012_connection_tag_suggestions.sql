-- Idées de tags proposées depuis la page Connections, relues par l'équipe
-- admin. Le profil supprimé, la suggestion reste (sans auteur).
CREATE TABLE connection_tag_suggestions (
  id         INTEGER PRIMARY KEY,
  player_id  TEXT REFERENCES players(id) ON DELETE SET NULL,
  label      TEXT NOT NULL,
  elements   TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
