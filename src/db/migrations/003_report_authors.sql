-- Tag Discord facultatif, visible seulement de l'admin pour recontacter un
-- joueur au sujet de ses reports
ALTER TABLE players ADD COLUMN discord_tag TEXT;

-- Auteur d'un report (NULL pour les reports de la v1 ou sans profil)
ALTER TABLE reports ADD COLUMN player_id TEXT REFERENCES players(id) ON DELETE SET NULL;
CREATE INDEX reports_by_player ON reports (player_id);
