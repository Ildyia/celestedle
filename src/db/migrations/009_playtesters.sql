-- Playtesters : accès aux modes en test (Connections), sans droits admin.
-- Colonne à part plutôt qu'une valeur de role : changer la contrainte CHECK
-- de role demanderait de reconstruire players, que d'autres tables
-- référencent avec ON DELETE CASCADE.
ALTER TABLE players ADD COLUMN is_playtester INTEGER NOT NULL DEFAULT 0;
