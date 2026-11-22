-- Boîte aux lettres : courrier pour tous (player_id NULL) ou pour un joueur.
-- kind : 'news' (annonces, notes de mise à jour), 'poll' et 'reply' viendront
-- ensuite (déjà permis ici : SQLite ne sait pas modifier un CHECK).
-- slug : identifiant fixe d'une lettre créée par une migration.
CREATE TABLE mail (
  id                 INTEGER PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('news', 'poll', 'reply')),
  slug               TEXT UNIQUE,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  player_id          TEXT REFERENCES players(id) ON DELETE CASCADE,
  author_id          TEXT,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX mail_by_player ON mail (player_id, created_at);

CREATE TABLE mail_reads (
  mail_id   INTEGER NOT NULL REFERENCES mail(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  read_at   TEXT NOT NULL,
  PRIMARY KEY (mail_id, player_id)
);

-- La carte postale de la mise à jour du 15 novembre devient la première lettre
INSERT INTO mail (kind, slug, title, body, created_at, updated_at) VALUES (
  'news',
  'welcome-v4',
  'A big update for Celestedle!',
  'Hey everyone! Here''s what''s new on the mountain:

- **Celeste-style menus**: your profile is a save ticket, you pick a game on the mountain, and the sky follows your time of day.
- **Chapters**: every win is a strawberry that takes you higher, from Forsaken City all the way to the moon. Each chapter unlocks a character''s portraits and a new colour for your file. Open the **Map** to see your climb.
- **Stamps**: secret achievements to collect on your ticket. Get them all for a golden file!
- **Duels**: race another climber on the same random element, in a public or private room.
- **Journal**: your progress, strawberries and deaths per chapter, and every ranking. Click a name to see their file.
- **Trophies**: finish a day first in a mode, or a week first overall, and it shows in the rankings.

The old look is still there: Options, Modern game pages.

*A word on how this was made: most of the code for this update was written by an AI. The ideas, the design choices and every decision about the game are human.*

Thanks for climbing with me!
— Amélia / Ildyia',
  '2026-11-15T12:00:00.000Z',
  '2026-11-15T12:00:00.000Z'
);
