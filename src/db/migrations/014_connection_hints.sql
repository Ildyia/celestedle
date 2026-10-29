-- Indices de Connections : chacun une fois par partie. payload = JSON de ce
-- qui a été révélé (tiré au moment de l'utiliser, il ne change plus ensuite)
CREATE TABLE connection_hints (
  game_id    INTEGER NOT NULL REFERENCES connection_games(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('kinds', 'category', 'pair')),
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type)
);
