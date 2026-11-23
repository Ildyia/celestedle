-- Réponses personnelles : ce à quoi la lettre répond (« report:<id> »,
-- « report:<id>:fixed » pour la lettre automatique d'un report corrigé,
-- « suggestion:<id> »). Sert à ne pas envoyer deux fois la lettre automatique
-- et à montrer dans l'admin qu'on a déjà répondu.
ALTER TABLE mail ADD COLUMN about TEXT;
CREATE INDEX mail_by_about ON mail (about);
