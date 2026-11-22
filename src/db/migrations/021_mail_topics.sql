-- Lettres « news » : annonce ou notes de mise à jour, chacune postée dans son
-- salon Discord. La carte postale de la mise à jour était des notes de mise à jour.
ALTER TABLE mail ADD COLUMN topic TEXT CHECK (topic IN ('announcement', 'patch-notes'));
UPDATE mail SET topic = 'announcement' WHERE kind = 'news';
UPDATE mail SET topic = 'patch-notes' WHERE slug = 'welcome-v4';
