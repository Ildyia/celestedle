-- Profils créés automatiquement au premier essai : anonymes (absents des
-- classements) tant que le joueur n'a pas enregistré son profil. Les profils
-- existants déjà personnalisés restent classés.
ALTER TABLE players ADD COLUMN is_anonymous INTEGER NOT NULL DEFAULT 1;
UPDATE players SET is_anonymous = 0
  WHERE role <> 'player'
     OR discord_tag IS NOT NULL
     OR name NOT GLOB 'Climber [0-9][0-9][0-9][0-9]';
