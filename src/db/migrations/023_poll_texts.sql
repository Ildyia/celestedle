-- Sondages : réponse libre « Other… » et commentaire, lus seulement par
-- l'équipe (sans nom, comme les votes).
-- allow_other : une case « Other » avec un texte (position -1 dans poll_votes) ;
-- allow_comments : un commentaire facultatif.
ALTER TABLE mail ADD COLUMN allow_other INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail ADD COLUMN allow_comments INTEGER NOT NULL DEFAULT 0;

CREATE TABLE poll_texts (
  mail_id    INTEGER NOT NULL REFERENCES mail(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('other', 'comment')),
  text       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mail_id, voter, kind)
);
