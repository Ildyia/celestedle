# Refonte visuelle « menus de Celeste »

Branche de travail : `ui-celeste` (partie de `main`).
Récupérer main régulièrement : `git fetch origin && git merge origin/main`.

## État : v1 du menu faite

| Fichier | Rôle |
|---|---|
| `public/celeste-ui.css` | Style **commun** : police, couleurs, ciel, lune, montagne et drapeau du sommet, texte à contour, `.hl` qui clignote, `.paper` |
| `public/menu.css` | Style de la page de menu : écrans, endroit de la montagne par jeu (`body[data-game]`), journal |
| `public/index.html` | Page d'accueil : le menu (ex-`menu.html`, qui redirige maintenant ici) ; le jeu est sur `celestedle.html` |
| `public/js/menu.js` | Tout le menu : profil, jeux, options, journal, clavier, neige |

**Règle :** `menu.js` affiche et ne réinvente rien : il passe par `api.js`, `player.js`, `storage.js` et `profile.js`.

Déjà en place :
- **Titre** : lune en croissant entourée d'étoiles, drapeau rectangulaire qui flotte au sommet, neige, touche « C » qui clignote en bas à droite.
- **Fichier** : tickets dans le style du jeu, entièrement en CSS (aucune image du jeu) : papier à encoches et contour à l'encre, portrait tenu par du scotch, nom, dernier jeu choisi, fraises = victoires. Le ticket choisi glisse à gauche et son talon perforé sort : un cœur par partie gagnée aujourd'hui (colonnes = jeux, bleu = A-Side, rouge = B-Side), crâne = défaites, série, meilleur temps. Entrée ouvre le ticket (Begin, Rename, Recovery code ; le code s'affiche dans le talon).
- **Tampons = achievements** : calculés par le serveur à partir des parties déjà jouées (`src/services/achievements.js`, `GET /players/me/achievements`, rétroactifs, sans table). Chaque tampon est dessiné en SVG par `js/stamps.js` (`stampSvg`) façon tampon postal : double cercle, nom en arc en haut, détail en arc en bas, image du jeu au centre, passée à l'encre par un filtre SVG (une couleur, zones claires = papier) avec une usure aléatoire (`public/assets/stamps/`, tirées du graphics dump de Celeste ; Assist Mode = le logo du site). Le ticket a un emplacement par tampon (`TICKET_SLOTS`, les plus rares aux plus grandes places) et montre une version compacte, sans texte, avec un gros symbole ; au survol, la version complète avec le nom. Le journal montre la version complète. Page « Stamps » du journal (progression), notification quand un tampon est gagné depuis la dernière visite. `index.html?stamps=all` les montre tous. Tous les tampons gagnés : le ticket devient doré (classe `golden`, avec un reflet qui passe). Pour en ajouter un : une entrée dans `ACHIEVEMENTS` (serveur) et une dans `STAMPS` (client).
- **Modes** : un endroit de la montagne par jeu (Celestedle, le jeu principal, au sommet avec le grand drapeau rouge ; Techs sur le pic de devant, Connections sur le pic du fond), A-Side et B-Side, règles du mode, état de la partie du jour, record perso (Celestedle) ou chiffres du jour (Connections, Techs). Connections et Techs n'apparaissent qu'avec l'accès.
- **Report a bug** (B) : bouton à côté de Journal et Options, ouvre le signalement dans le menu (aussi dans les options).
- **Journal** (J) : un carnet comme celui du jeu (`js/journal.js`), papier crème ligné, onglets marque-page, pages tournées avec ← →. Pages : Progress (stats perso), Today (classement du jour d'un jeu et d'un côté), This week et All time (tous modes).
- **Options** : mêmes préférences que les pages de jeu, mode performance (`body.perf` : sans neige ni scintillements, contours allégés, cadrage sans zoom), Credits, Legal notice. Tant que le joueur n'a pas choisi, il s'active tout seul si les premiers changements d'écran tournent sous 30 images/s.
- Clavier partout, aide en bas à droite, mobile, `prefers-reduced-motion`.

## Montagne

`public/assets/menu/mountain.svg` est la source (polygones modifiables) ;
la page affiche `mountain.png`, son export en 4000 × 1750 px. Après une
modification du SVG, réexporter le PNG (Inkscape, ou ouvrir le SVG dans le
navigateur et l'exporter à cette taille). Le PNG est là pour Firefox, qui
redessine les images SVG à chaque étape d'un zoom.

## Idées pour la suite

- [x] Stats perso de Connections et Techs dans le journal (`/connections/me/stats`, `/techs/me/stats`).
- [x] Classement directement dans le journal (pages Today, This week, All time).
- [x] Ciel selon l'heure locale (nuit, aube, jour, crépuscule) : `js/sky.js`, couleurs dans `modern.css`, option « Sky » (Auto, ou un ciel fixe : Dawn, Day, Dusk, Night).
- [x] Un drapeau par jeu sur la montagne (Celestedle bleu, Connections doré si accessible, Techs = drapeau du sommet) ; celui du jeu choisi grandit.
- [x] Supprimer son fichier depuis le ticket (Delete, avec confirmation).

### 7. Bascule (≈ 1 h)
- [x] `index.html` → `celestedle.html` (liens mis à jour : `game-tabs`, `menu.js`, `credits`, admin, duels…).
- [x] `menu.html` → `index.html` (`menu.html` reste, il redirige vers l'accueil en gardant `?…` et `#…`).
- [ ] Tester sur la beta avant main.

### 8. Rhabiller les pages de jeu, une par une (≈ 10-20 h)
- [ ] Charger `celeste-ui.css` sur `celestedle.html`, `connections.html` et `techs.html`.
- [ ] Changer surtout le HTML et le CSS, pas la logique (`game.js`, `connections.js`, `techs-app.js`).
- [ ] Ajouter un bouton « retour au menu » sur chaque page.
- [ ] À terme, retirer `theme-celeste.css` si le nouveau style le remplace.

## Tester en local

```bash
npm install
npm start          # puis http://localhost:3000/
npm run lint
npm test
```

## Pages de jeu : interface Modern

Option « Modern Interface (beta) » (options de la page de jeu) ou « Modern game pages » (options du menu), clé `celestedle_modern_ui`, éteinte par défaut tant que la refonte n'est pas finie. La Classic reste la page complète d'avant.

**En Modern, la page ne garde que le jeu ; tout le reste vit dans le menu :**

| Sur la page Classic | En Modern |
|---|---|
| Profil | ticket du menu (Rename, Edit profile) |
| Rankings | bouton en haut de la page, menu pause, pages du journal du menu |
| Règles | bouton en haut de la page, menu pause (fiches par rubrique en Modern) |
| Options | menu pause (Échap ou ❚❚) |
| Normal / Hard | menu pause (« Switch to B-Side ») ou le livre du menu |
| Community Stats, Next Word in | livre du menu (« Today on the mountain », « Next climb in ») |
| Found a bug?, Discord, GitHub, Ko-fi, Credits | options du menu |
| Onglets des jeux | icônes du menu |

- `modern.css` : tout est rangé sous `html.ui-modern`. Sans la classe, la page reste exactement la Classic.
- La classe est posée dès le `<head>` par un petit script (pas d'éclair au chargement). `js/interface.js` l'ajoute ou la retire quand l'option change, et construit le décor, « ◂ Menu  ❚❚ Pause », le côté joué sous le titre et le menu pause (Resume, Rules, Options, Switch side, Return to menu).
- Style : HUD sobre comme le jeu en partie (bandeaux et panneaux noirs translucides, sans contour coloré) ; seules les couleurs du jeu ressortent. Le drapeau du sommet flotte aussi dans le décor.
- Le menu ouvre lui-même profil, classements et signalement (`js/menu-panels.js`) : il va chercher leur HTML dans `celestedle.html` au premier besoin (une seule source) et branche les mêmes modules que la page de jeu. Pour leur style, le menu (`index.html`) charge `style.css` et `modern.css` (classe `ui-modern` sur `<html>`).
- Fait : Celestedle, Connections, Techs. `interface.js` ne propose que ce que la page a (Connections : pas d'Options, Rankings fait défiler jusqu'au classement de la page). Le titre devient le nom du jeu. Lien Admin dans la barre du haut pour l'équipe (et dans les options du menu).
- Écran de fin façon « chapitre terminé » : les jeux annoncent la fin d'une partie jouée pendant la visite (`js/game-end.js`, événement `game-end`) ; `interface.js` affiche le bilan (titre, réponse, essais / indices / temps qui défilent, prochaine partie, Share / Rankings / Menu / Close). Pas d'écran quand on recharge une partie déjà finie.

## Ajouts récents

- **Aperçu de lien** : `src/app.js` ajoute `og:image` (adresse complète, d'après la requête) au `<head>` des pages ; l'image est `public/assets/og.png` (capture de l'écran titre, 1200 × 630).
- **Tampon tout juste gagné** : il s'abat sur le ticket à la première vue des fichiers (`.stamp.fresh`, `menu.css`).
- **Fiche d'un joueur** : `GET /players/:id/card` (profils cachés ou anonymes : 404). Dans le journal, un clic sur une ligne de classement montre son ticket ; depuis une page de jeu, le nom mène à `index.html?player=<id>`.
- **Sons** : `js/sound.js` (Web Audio, aucun fichier), option « Sounds », coupée par défaut.
- **Chapitres** (sentier visible seulement sur la carte et pendant l'annonce d'un chapitre) : `src/services/chapters.js` (seuils en fraises, fraises et morts par chapitre, calculés depuis les parties), envoyés avec les achievements (`climb`). `public/js/chapters.js` place les sept repères et dessine le sentier et le repère de la carte du jeu (chapitre en cours) ; le livre affiche le chapitre en cours ; page « Climb » du journal. Aperçu d'un autre état : `index.html?chapter=3&berries=14`.
  - Les fraises et les morts du ticket (et de la fiche publique) sont celles des chapitres : une victoire ou une défaite sur n'importe quel jeu.
  - Récompenses : chaque chapitre débloque un personnage et une couleur (`family` / `color` dans `CHAPTERS`, côté serveur). Les personnages sont dans `src/services/avatars.js` (Madeline et la fraise à Forsaken City, Granny et l'oiseau à Farewell) : une image ouverte à tous (`AVATARS`), les autres (expressions des dialogues, sprite en jeu, variantes, tirées du graphics dump) dans `public/assets/avatars/<famille>/`, identifiant `famille/nom`. `/players/options` envoie `families` et `rewards` ; la fenêtre de profil montre une case par personnage (badge « +N » ou cadenas) et ouvre ses images dans une bande sous la grille ; `PATCH /players/me` refuse ce qui est encore verrouillé.
  - 8e chapitre, Farewell (150 fraises), sur la Lune : le sentier part du sommet vers le ciel, le repère du chapitre et celui de la carte sont posés sur la lune (`.moon-camp`).
  - Annonce : le dernier chapitre vu est gardé dans le navigateur (`celestedle_seen_chapter_<id>`). Au-delà, carte postale (chapitre, récompenses, prochain camp), puis la caméra montre la montagne, le sentier se trace et le repère monte. Pour la voir : `index.html?chapter=3&from=2`.
  - Carte : bouton « Map » ou touche M sur l'écran des jeux. Toute la montagne, les noms des chapitres, et la fiche du chapitre choisi (←→) : fraises, morts, date d'arrivée ou fraises manquantes, récompense.
  - Fiche publique : chapitre sous le nom, petit drapeau rouge au sommet, baie lunaire sur la Lune.
- **Tampons secrets** : dans le journal, un tampon pas encore gagné n'a ni nom, ni image, ni description.
- **Trophées** (`src/services/trophies.js`, calculés depuis les parties, gardés en mémoire pour la journée) : *Winner* = premier du classement d'un jour terminé, par mode ; *Champion* = premier du classement d'une semaine terminée. Ce sont des stats (page Progress du journal, fenêtre de profil, fiche publique), pas des tampons. Dans les classements : 🏆 à côté du champion en titre, baie lunaire à côté du record de trophées (jours gagnés dans ce mode pour un classement du jour, tous les trophées pour la semaine et le général).
- **Duels** (`src/services/duels.js`, `/api/duels`, migration 016, `public/js/duel.js`) : deux joueurs cherchent le même élément tiré au hasard, avec les règles A-Side ou B-Side. Un salon est public (listé dans la fenêtre « Duel » du menu, touche D) ou privé (rejoint par son lien `celestedle.html?duel=<id>`). Le duel commence à l'arrivée du second joueur ; la page de jeu joue alors la partie du salon et un panneau montre l'adversaire (ses lignes en couleurs, les noms seulement une fois sa propre partie finie), relu toutes les 2,5 s. Résultat : victoire > défaite, puis le moins d'essais (indice = essai), puis le plus rapide depuis le début du duel. Revanche : un salon privé, rejoint par l'autre. Un salon attend 30 min ; un duel dure au plus 30 min (partie pas finie = abandon). Parties dans leurs propres tables (`duel_*`) : ni stats, ni fraises, ni classements.
- **Admin, onglet Insights** (`src/repositories/insights.js`, `/api/admin/insights?days=7|30`) : openers par côté (avec le taux de victoire et les essais moyens des parties qui commencent ainsi), mots les plus essayés, victoires par nombre d'essais et issues, indices utilisés, heures de fin des parties (heure de Paris), duels, et l'activité jour par jour (joueurs distincts tous jeux confondus).
- **Techs retirées** : code supprimé (pages, routes, services, onglet admin, drapeau). Les tables restent : les parties jouées comptent toujours (fraises, tampons, trophées, semaine, All time). `techs.html` renvoie au choix des jeux.
- **Connections, variété** (`connections-generator.js`, `recentFor` dans `services/connections.js`) : les 4 catégories du jour d'abord, en rotation (mémoire des grilles des 30 derniers jours, les deux modes, poids 0,85 par jour ; une catégorie récente passe son tour), puis une vraie recherche d'éléments pour ces catégories (150 tirages, éléments récents évités, éléments « à tout faire » favorisés, la moins répétitive de 6 combinaisons) ; on ne change de catégories que si elles sont impossibles à remplir. Tag imposé une grille sur deux, un seul groupe « Found in … » en A-Side. Avant, 10 tirages ratés faisaient changer de catégories : les catégories faciles à remplir gagnaient toujours, avec leurs mêmes éléments.
- **Connections, génération hors du fil principal** : l'admin qui générait 14 grilles d'un coup bloquait le serveur (healthcheck Docker raté, Traefik répondait 404 à tout le monde). Ancien générateur rapide remis (en gardant « un tag une grille sur deux » et « un seul groupe Found in … » en A-Side), grilles tirées dans un worker thread (`services/connections-worker.js`), en avance pour aujourd'hui et les 2 jours suivants (au démarrage puis toutes les heures) ; l'admin n'en montre plus que 3 jours.
- **Connections, règle des faux groupes unifiée** : en A-Side, seul le faux groupe parfait est refusé (exactement 4 cases qui partagent une catégorie sans être un groupe), types et tags compris ; 5 cases ou plus d'un même type sont une fausse piste permise, comme pour les couleurs. Un tirage avec un faux groupe est réparé (une case échangée contre un autre membre de son groupe) au lieu d'être jeté : avec 400 tags d'essai, 20 grilles strictes sur 20 en 58 ms (avant : 7 sur 20, 656 ms).
- **Connections, diversité gardée** (rotation des catégories, éléments récents évités) avec, par ordre de priorité : grille sans faux groupe, puis plafond des éléments (sorti plus de 1,5 × la moyenne + 1 sur 30 jours : plus pioché), puis catégories de la veille écartées. Trois recherches successives (sans élément trop sorti ni catégorie de la veille, puis sans élément trop sorti, puis sans restriction) ; une catégorie qui échoue perd du poids pour la grille en cours. Simulé sur 60 jours avec 100 tags : 60 grilles strictes sur 60, élément le plus fréquent 1,8 × la moyenne (avant : 2,9 ×).
