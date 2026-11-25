-- Difficulté d'un tag de Connections : 1 facile, 2 moyen, 3 difficile.
-- Le générateur en tient compte (l'A-Side tire plus souvent les faciles, la
-- B-Side les difficiles) ; les tags existants sont moyens.
ALTER TABLE connection_tags ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3);
