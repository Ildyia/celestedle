-- Indice « split » de la C-Side (une case de chaque groupe restant) : SQLite
-- ne modifie pas un CHECK, on reconstruit la table (aucune vue ne la lit).
CREATE TABLE connection_hints_new (
  game_id    INTEGER NOT NULL REFERENCES connection_games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('kinds', 'category', 'pair', 'split')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);
INSERT INTO connection_hints_new SELECT game_id, type, payload, created_at FROM connection_hints;
DROP TABLE connection_hints;
ALTER TABLE connection_hints_new RENAME TO connection_hints;
