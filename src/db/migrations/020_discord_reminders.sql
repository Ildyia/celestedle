-- Rappels de série du bot Discord (/reminder) : un message privé à l'heure
-- choisie (heure de Paris), les jours où le joueur n'a pas encore joué.
-- last_sent : dernier jour (AAAA-MM-JJ) où le rappel a été traité.
CREATE TABLE discord_reminders (
  discord_user_id TEXT PRIMARY KEY,
  hour            INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  last_sent       TEXT,
  created_at      TEXT NOT NULL
);
