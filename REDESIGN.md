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
- **Tampons** : listés dans `js/stamps.js` (icône teintée par masque, couleur, position, taille, angle, cercle ou non). `earnedStamps()` renvoie [] en attendant les achievements ; `menu.html?stamps=all` les montre tous.
- **Modes** : un endroit de la montagne par jeu (la caméra « monte » jusqu'au sommet pour Techs), A-Side et B-Side, règles du mode, état de la partie du jour, record perso (Celestedle) ou chiffres du jour (Connections, Techs). Connections et Techs n'apparaissent qu'avec l'accès.
- **Journal** (J) : stats perso et lien vers les classements (`index.html#leaderboard`).
- **Options** : mêmes préférences que les pages de jeu, mode performance (`body.perf` : sans neige ni scintillements, contours allégés, cadrage sans zoom), Credits, Legal notice. Tant que le joueur n'a pas choisi, il s'active tout seul si les premiers changements d'écran tournent sous 30 images/s.
- Clavier partout, aide en bas à droite, mobile, `prefers-reduced-motion`.

## Montagne

`public/assets/menu/mountain.svg` est la source (polygones modifiables) ;
la page affiche `mountain.png`, son export en 4000 × 1750 px. Après une
modification du SVG, réexporter le PNG (Inkscape, ou ouvrir le SVG dans le
navigateur et l'exporter à cette taille). Le PNG est là pour Firefox, qui
redessine les images SVG à chaque étape d'un zoom.

## Idées pour la suite

- [ ] Stats perso de Connections et Techs dans le journal (il manque une route `…/me/stats` côté serveur).
- [ ] Classement directement dans le journal, au lieu du lien vers l'ancienne page.
- [ ] Petits drapeaux sur la montagne à l'endroit de chaque jeu.
- [ ] Supprimer son profil depuis le ticket (aujourd'hui : dans l'ancienne fenêtre profil).

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
