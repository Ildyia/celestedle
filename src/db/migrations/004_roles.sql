-- Accès admin porté par les comptes : propriétaire (toutes les permissions,
-- un seul) et administrateurs (nombre de modifications limité par jour)
ALTER TABLE players ADD COLUMN role TEXT NOT NULL DEFAULT 'player'
  CHECK (role IN ('player', 'administrator', 'owner'));
CREATE UNIQUE INDEX players_single_owner ON players (role) WHERE role = 'owner';

-- Journal des modifications faites depuis l'admin (sert aussi au quota)
CREATE TABLE admin_actions (
  id         INTEGER PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_actions_by_player ON admin_actions (player_id, created_at);
