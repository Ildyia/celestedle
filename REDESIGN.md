# Refonte visuelle « menus de Celeste »

Branche de travail : `ui-celeste` (partie de `main`).
Récupérer main régulièrement : `git fetch origin && git merge origin/main`.

## Ce qui est déjà là (squelette)

| Fichier | Rôle |
|---|---|
| `public/celeste-ui.css` | Style **commun** : police, couleurs, ciel, montagne, texte à contour, `.hl` qui clignote, `.paper` |
| `public/menu.css` | Style de la page de menu seulement (écrans titre, fichiers, modes, options) |
| `public/menu.html` | Nouvelle page d'accueil, ouverte sur `/menu.html` en attendant de remplacer `index.html` |
| `public/js/menu.js` | Navigation entre écrans (Enter, Échap, clics) déjà branchée ; le contenu est à faire (`TODO` dans le code) |

Rien d'autre n'a changé : le serveur et les pages de jeu sont intacts.

**Règle :** `menu.js` affiche et ne réinvente rien. Il passe par `api.js`, `player.js`, `storage.js` et `profile.js`.

## À faire, dans l'ordre conseillé

### 1. Écran Titre (≈ 30 min)
- [ ] Neige : créer des `.snow` dans `#scene` (voir la maquette).
- [ ] Décider : un joueur qui a déjà un profil saute-t-il le titre ?

### 2. Écran Fichier = profil (≈ 3-4 h)
- [ ] Ticket du profil : nom, avatar (`avatarUrl()` de `profile.js`), victoires, série et temps (`api.myStats`).
- [ ] Actions sous le ticket : Begin, Rename (`player.update`), Recovery code (`player.token`).
- [ ] Emplacements « New file » (`player.ensure()`) et « Restore » (`player.restore(code)`).
- [ ] Navigation ↑↓ entre emplacements (`slotIndex`).

### 3. Écran Modes = chapitres (≈ 3-4 h)
- [ ] Masquer Connections et Techs sans accès (`api.connectionsAccess()` / `api.techsAccess()`, comme `game-tabs.js`).
- [ ] Description de chaque jeu et mode (reprendre `rules-text.js`).
- [ ] Record du joueur dans le mode choisi (`api.myStats`).
- [ ] Bandeau « déjà joué aujourd'hui ».
- [ ] Clavier : ←→ pour le jeu, Tab ou A/B pour le côté.
- [ ] Choisir de vraies icônes par jeu (celles du squelette sont provisoires).

### 4. Journal = classement (≈ 2-3 h)
- [ ] Ouvrir le classement (`leaderboard.js`) dans une fenêtre papier au lieu du toast.

### 5. Options (≈ 1-2 h)
- [ ] Brancher sur les vraies préférences : exporter `OPTIONS` de `options.js` ou garder `OPTION_ROWS` avec les mêmes `KEYS`.
- [ ] Ajouter les lignes Back, Credits et Legal notice ; ←→ pour changer une valeur.

### 6. Finitions du menu (≈ 2 h)
- [ ] Aide clavier en bas à droite (`renderHints`).
- [ ] Style du toast (`.toast-notification` de `toast.js`), à la place de `#toast` dans `menu.css`.
- [ ] `prefers-reduced-motion` : couper le clignotement, la neige et le zoom.
- [ ] Vérifier sur mobile (360 px) et au clavier seul.

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
