-- Messages envoyés à l'équipe depuis le menu (« Contact the team »), en
-- dehors des reports. La réponse part en lettre personnelle (mail.about =
-- « contact:<id> »).
CREATE TABLE contact_messages (
  id         INTEGER PRIMARY KEY,
  player_id  TEXT REFERENCES players(id) ON DELETE SET NULL,
  topic      TEXT NOT NULL CHECK (topic IN ('question', 'idea', 'problem', 'other')),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at TEXT NOT NULL
);
CREATE INDEX contact_messages_by_status ON contact_messages (status, created_at);
