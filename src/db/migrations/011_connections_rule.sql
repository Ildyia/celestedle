-- Règle de génération d'une grille : "strict" (normal), "relaxed" ou "none"
-- (repli quand la règle stricte est impossible, ou mode Hard). Les grilles
-- existantes ne sont pas connues : NULL.
ALTER TABLE connection_puzzles ADD COLUMN rule TEXT;
