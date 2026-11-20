-- Techs retirées : le jeu n'était pas assez fun. Fermé à tous (l'équipe
-- aussi), quel que soit le réglage d'avant ; parties et techs sont gardées.
-- Pour les rouvrir : onglet Techs de l'admin, « Who can play ».
INSERT INTO settings (key, value) VALUES ('techs_access', 'closed')
  ON CONFLICT (key) DO UPDATE SET value = 'closed';
