-- Sondages de la boîte aux lettres (mail.kind = 'poll').
-- multiple : plusieurs cases permises ; closes_at : fin des votes (NULL :
-- ouvert jusqu'à ce que l'équipe le ferme) ; discord_closed : message Discord
-- déjà passé aux résultats finaux.
ALTER TABLE mail ADD COLUMN multiple INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mail ADD COLUMN closes_at TEXT;
ALTER TABLE mail ADD COLUMN discord_closed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE poll_options (
  mail_id  INTEGER NOT NULL REFERENCES mail(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label    TEXT NOT NULL,
  PRIMARY KEY (mail_id, position)
);

-- voter : « player:<id> », ou « discord:<id> » pour un compte Discord lié à
-- aucun profil. Un vote = l'ensemble des cases cochées par un votant.
CREATE TABLE poll_votes (
  mail_id    INTEGER NOT NULL REFERENCES mail(id) ON DELETE CASCADE,
  voter      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (mail_id, voter, position)
);
CREATE INDEX poll_votes_by_voter ON poll_votes (voter);
