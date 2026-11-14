# Refonte visuelle « menus de Celeste »

Branche de travail : `ui-celeste` (partie de `main`).
Récupérer main régulièrement : `git fetch origin && git merge origin/main`.

## État : v1 du menu faite

| Fichier | Rôle |
|---|---|
| `public/celeste-ui.css` | Style **commun** : police, couleurs, ciel, lune, montagne et drapeau du sommet, texte à contour, `.hl` qui clignote, `.paper` |
| `public/menu.css` | Style de la page de menu : écrans, endroit de la montagne par jeu (`body[data-game]`), journal |
| `public/menu.html` | Nouvelle page d'accueil, sur `/menu.html` en attendant de remplacer `index.html` |
| `public/js/menu.js` | Tout le menu : profil, jeux, options, journal, clavier, neige |

**Règle :** `menu.js` affiche et ne réinvente rien : il passe par `api.js`, `player.js`, `storage.js` et `profile.js`.

Déjà en place :
- **Titre** : lune en croissant entourée d'étoiles, drapeau rectangulaire qui flotte au sommet, neige, touche « C » qui clignote en bas à droite.
- **Fichier** : tickets dans le style du jeu, entièrement en CSS (aucune image du jeu) : papier à encoches et contour à l'encre, portrait tenu par du scotch, nom, dernier jeu choisi, fraises = victoires. Le ticket choisi glisse à gauche et son talon perforé sort : un cœur par partie gagnée aujourd'hui (colonnes = jeux, bleu = A-Side, rouge = B-Side), crâne = défaites, série, meilleur temps. Entrée ouvre le ticket (Begin, Rename, Recovery code ; le code s'affiche dans le talon).
- **Tampons = achievements** : calculés par le serveur à partir des parties déjà jouées (`src/services/achievements.js`, `GET /players/me/achievements`, rétroactifs, sans table). Chaque tampon est dessiné en SVG par `js/stamps.js` (`stampSvg`) façon tampon postal : double cercle, nom en arc en haut, détail en arc en bas, image du jeu au centre, passée à l'encre par un filtre SVG (une couleur, zones claires = papier) avec une usure aléatoire (`public/assets/stamps/`, tirées du graphics dump de Celeste ; Assist Mode = le logo du site). Le ticket a un emplacement par tampon (`TICKET_SLOTS`, les plus rares aux plus grandes places) et montre une version compacte, sans texte, avec un gros symbole ; au survol, la version complète avec le nom. Le journal montre la version complète. Page « Stamps » du journal (progression), notification quand un tampon est gagné depuis la dernière visite. `menu.html?stamps=all` les montre tous. Tous les tampons gagnés : le ticket devient doré (classe `golden`, avec un reflet qui passe). Pour en ajouter un : une entrée dans `ACHIEVEMENTS` (serveur) et une dans `STAMPS` (client).
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
- [ ] `index.html` → `celestedle.html` (et mettre à jour les liens : `game-tabs`, `menu.js`, `credits`, admin…).
- [ ] `menu.html` → `index.html`.
- [ ] Tester sur la beta avant main.

### 8. Rhabiller les pages de jeu, une par une (≈ 10-20 h)
- [ ] Charger `celeste-ui.css` sur `celestedle.html`, `connections.html` et `techs.html`.
- [ ] Changer surtout le HTML et le CSS, pas la logique (`game.js`, `connections.js`, `techs-app.js`).
- [ ] Ajouter un bouton « retour au menu » sur chaque page.
- [ ] À terme, retirer `theme-celeste.css` si le nouveau style le remplace.

## Tester en local

```bash
npm install
npm start          # puis http://localhost:3000/menu.html
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
- Le menu ouvre lui-même profil, classements et signalement (`js/menu-panels.js`) : il va chercher leur HTML dans `index.html` au premier besoin (une seule source) et branche les mêmes modules que la page de jeu. Pour leur style, `menu.html` charge `style.css` et `modern.css` (classe `ui-modern` sur `<html>`).
- Fait : Celestedle, Connections, Techs. `interface.js` ne propose que ce que la page a (Connections : pas d'Options, Rankings fait défiler jusqu'au classement de la page). Le titre devient le nom du jeu. Lien Admin dans la barre du haut pour l'équipe (et dans les options du menu).
- Écran de fin façon « chapitre terminé » : les jeux annoncent la fin d'une partie jouée pendant la visite (`js/game-end.js`, événement `game-end`) ; `interface.js` affiche le bilan (titre, réponse, essais / indices / temps qui défilent, prochaine partie, Share / Rankings / Menu / Close). Pas d'écran quand on recharge une partie déjà finie.

## Ajouts récents

- **Aperçu de lien** : `src/app.js` ajoute `og:image` (adresse complète, d'après la requête) au `<head>` des pages ; l'image est `public/assets/og.png` (capture de l'écran titre, 1200 × 630).
- **Tampon tout juste gagné** : il s'abat sur le ticket à la première vue des fichiers (`.stamp.fresh`, `menu.css`).
- **Fiche d'un joueur** : `GET /players/:id/card` (profils cachés ou anonymes : 404). Dans le journal, un clic sur une ligne de classement montre son ticket ; depuis une page de jeu, le nom mène à `menu.html?player=<id>`.
- **Sons** : `js/sound.js` (Web Audio, aucun fichier), option « Sounds », coupée par défaut.
