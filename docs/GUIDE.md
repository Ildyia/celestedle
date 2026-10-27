# Guide du projet Celestedle

Ce guide explique comment le projet est rangé, comment une action du joueur traverse le code, et où intervenir pour chaque type de modification.

## 1. Le principe

Celestedle est un **serveur Node.js** (Express). Il garde le mot du jour, les parties et les joueurs dans une **base SQLite**, et sert des **pages web** qui lui envoient des requêtes.

```
Navigateur (public/)  ──requête HTTP──►  Serveur (src/)  ──►  Base SQLite (data/celestedle.db)
        ◄───────────── réponse JSON ─────────────┘
```

> **Règle d'or :** le navigateur ne décide de rien. Il affiche et il demande. C'est le serveur qui vérifie, calcule et enregistre, parce qu'un joueur peut modifier tout ce qui tourne dans son navigateur.

## 2. Le front : `public/`

Du HTML, du CSS et des modules JavaScript, sans framework ni étape de build.

| Fichier | Rôle |
| --- | --- |
| `index.html`, `style.css` | La page du jeu principal |
| `connections.html` + `.css` | La page Connections |
| `admin.html` + `.css` | Le panneau admin |
| `js/app.js` | Point d'entrée du jeu : crée les objets et les branche ensemble |
| `js/game.js` | Logique de la page : clics, essais, indices, fin de partie |
| `js/api.js` | Toutes les requêtes vers le serveur. Pour appeler une route, c'est ici |
| `js/hints.js` | Comment chaque indice est affiché |
| `js/board.js`, `suggestions.js`, `share.js`… | Des morceaux spécialisés : tableau, autocomplétion, partage |
| `js/admin/*.js` | Un fichier par onglet de l'admin |

## 3. Le back : `src/`

Le serveur est organisé **en couches**. Une requête descend de couche en couche, et chaque couche a un seul métier.

| Couche | Rôle |
| --- | --- |
| `routes/` | Reçoit la requête, vérifie qui la fait, appelle le bon service |
| `services/` | La logique du jeu : règles, calculs, vérifications |
| `repositories/` | Lit et écrit dans la base. Que du SQL, aucune règle de jeu |
| `db/` | La connexion à la base et ses migrations |

Si un calcul est faux, on regarde dans `services`. Si une requête SQL est fausse, dans `repositories`. Si une URL ne répond pas, dans `routes`.

| Emplacement | Contenu |
| --- | --- |
| `server.js` | Démarre tout : l'application, le bot Discord, l'écoute du port |
| `app.js` | Configure Express : middlewares et routes |
| `config.js` | Lit les variables d'environnement (`.env`) |
| `routes/api/*.js` | Les URL : `game.js` pour `/api/game/…`, `admin.js`, `connections.js`… |
| `middleware/` | Ce qui passe avant chaque route : identifier le joueur (`player.js`), vérifier les droits admin (`admin-auth.js`), limiter le spam (`rate-limit.js`), formater les erreurs (`errors.js`) |
| `services/` | `games.js` (une partie), `daily.js` (tirage du mot du jour), `compare.js` (vert, orange, rouge), `hints.js` (indices), `modes.js` et `mode-rules.js` (Normal et Hard), `connections*.js`, `staff.js` (rôles, accès au playtest) |
| `repositories/` | Les requêtes SQL, un fichier par table ou par thème |
| `db/migrations/` | L'historique de la structure de la base |
| `discord/` | Le bot qui publie les reports de bugs |
| `utils/` | Petits outils : dates, `HttpError`… |

À la racine du dépôt :

- `db.json` : la liste des éléments du jeu, avec leur type, leurs chapitres, leur couleur et leur forme. Elle est recopiée dans la base à chaque démarrage par `db/sync-elements.js`.
- `aliases.json` : les noms alternatifs des éléments.
- `test/` : les tests automatiques.

## 4. Le trajet d'une requête

Exemple : le joueur clique sur un bouton d'indice.

1. **`public/js/game.js`** : le clic appelle `useHint(type)`.
2. **`public/js/api.js`** : `api.hint(…)` envoie `POST /api/game/hint` avec un JSON `{ mode, type, wordId }`.
3. **`src/middleware/player.js`** : retrouve le joueur grâce à son jeton et le range dans `req.player`.
4. **`src/routes/api/game.js`** : lit `req.body` et appelle `games.useHint(…)`.
5. **`src/services/games.js`** : vérifie les règles (partie en cours, indice pas déjà utilisé, maximum pas atteint), puis appelle `buildHint`.
6. **`src/services/hints.js`** : calcule le contenu de l'indice.
7. **`src/repositories/games.js`** : enregistre l'indice en base.
8. **`public/js/hints.js`** : la réponse JSON remonte au navigateur, qui affiche l'indice.

> **Retenir :** une nouvelle fonctionnalité traverse ces couches dans cet ordre. Quand quelque chose casse, on remonte le trajet étape par étape.

## 5. Concepts clés

### Les erreurs avec `HttpError`

```js
throw new HttpError(400, "Unknown element.");
```

Un service lève une erreur, `middleware/errors.js` l'attrape et renvoie `{ error: "Unknown element." }` avec le code HTTP indiqué. Le front affiche ce message tel quel. Codes utilisés : **400** demande invalide, **401** pas connecté, **403** pas le droit, **404** introuvable, **409** conflit avec l'état actuel.

### Les migrations

La structure de la base ne se modifie jamais à la main. Chaque changement passe par un fichier `NNN_nom.sql` dans `src/db/migrations/`. Au démarrage, `db/migrate.js` lit le numéro de la dernière migration appliquée (`PRAGMA user_version`) et joue les suivantes une seule fois, dans l'ordre.

> **Attention :** ne modifie jamais une migration déjà déployée, elle ne serait pas rejouée sur les bases existantes. Crée toujours un nouveau fichier avec le numéro suivant.

SQLite ne sait pas modifier une contrainte `CHECK` ou supprimer certaines colonnes. Dans ce cas, on reconstruit la table : créer la nouvelle, copier les données, supprimer l'ancienne, renommer. Si une vue lit cette table (comme `game_summaries` pour `game_hints`), il faut supprimer la vue avant et la recréer après.

### Les transactions

`db.transaction(() => { … })` regroupe plusieurs écritures : soit tout passe, soit rien. Si une erreur survient au milieu, la base revient à son état d'avant. C'est pour ça que `guess` et `useHint` sont enveloppés dedans.

### Le mot du jour et `wordId`

`services/daily.js` tire le mot à partir de la date (fuseau Europe/Paris) et de `RANDOM_SEED`, donc il est le même pour tout le monde. Le `wordId` vaut `date#version` : la version augmente quand l'admin change le mot. Si un joueur agit sur un ancien mot (après minuit, par exemple), le serveur répond 409 et la page se recharge. Connections fonctionne pareil avec un `gridId`.

### Rôles et accès

Les rôles (`owner`, `administrator`…) sont gérés dans `services/staff.js`. `middleware/admin-auth.js` protège les routes admin. L'accès à Connections (staff, playtest ou public) se règle depuis l'admin.

### Les réglages

La table `settings` est un simple stockage clé et valeur (`repositories/settings.js`). On y met les petits paramètres modifiables depuis l'admin sans toucher au code.

## 6. Git et déploiements

| Branche | Destination | Déclenchement |
| --- | --- | --- |
| `main` | Le site en production, via GitHub Actions (`.github/workflows/deploy.yml`) | À chaque push |
| `beta` | Le site beta, via Render | À chaque push |
| autre branche | Nulle part | Pour travailler tranquillement |

Une routine sûre :

```bash
git checkout -b ma-feature          # 1. une branche à toi
# … tu codes …
npm test && npm run lint            # 2. tout doit passer
git add -A && git commit -m "Ajoute l'indice info"
git checkout beta && git pull && git merge ma-feature && git push   # 3. tester sur la beta
git checkout main && git pull && git merge beta && git push         # 4. puis la prod
```

> **Attention :** pousser sur `beta` ou `main` met le site à jour immédiatement. Fais toujours `git pull` avant de fusionner : quelqu'un d'autre a peut-être poussé entre-temps.

Le numéro de version se trouve dans `package.json` et s'affiche sur le site.

## 7. Commandes du quotidien

Le projet demande **Node.js 22 ou plus**. Avec une version plus ancienne, `npm test` ne trouve pas les fichiers de test. Avec [nvm](https://github.com/nvm-sh/nvm) : `nvm install 22 && nvm use 22`, puis `npm rebuild`.

```bash
npm install      # après un pull qui change package.json
npm start        # lance le site sur http://localhost:3000
npm test         # lance les tests
npm run lint     # vérifie le style et les erreurs courantes
```

La base locale se trouve dans `data/celestedle.db`. Pour repartir de zéro, supprime-la : elle sera recréée au démarrage. Les variables d'environnement utiles (`PORT`, `RANDOM_SEED`, `ADMIN_PASSWORD`, `DISCORD_BOT_TOKEN`…) sont décrites dans le `readme.md`.

## 8. Je veux faire X, je vais où ?

| Je veux… | Fichiers à toucher |
| --- | --- |
| Corriger les infos d'un élément | `db.json`, ou le panneau admin |
| Changer un texte affiché | Le `.html` correspondant, ou `public/js/rules-text.js` pour les règles |
| Changer le style | `style.css`, `connections.css`, `admin.css` |
| Changer une règle de mode | `src/services/mode-rules.js` (essais, temps, nombre d'indices) |
| Ajouter un indice | `services/hints.js` (`HINT_TYPES` et `BUILDERS`), une migration pour le `CHECK` de `game_hints`, l'affichage dans `public/js/hints.js`, le bouton dans `index.html` |
| Ajouter une route d'API | `routes/api/xxx.js`, puis `services/xxx.js`, `repositories/xxx.js` et `public/js/api.js` |
| Ajouter une colonne ou une table | Une nouvelle migration `0NN_xxx.sql`, puis le repository |
| Ajouter un réglage admin | `repositories/settings.js`, une route dans `routes/api/admin.js`, `public/js/admin/settings.js` |

## 9. Déboguer

- **Console du navigateur** (F12) : les erreurs JavaScript sont dans l'onglet Console, les requêtes et leurs réponses dans l'onglet Network.
- **Terminal de `npm start`** : les erreurs serveur s'y affichent avec le fichier et la ligne.
- **Remonter le trajet** de la section 4 : à quelle étape la donnée devient-elle fausse ? Un `console.log(variable)` à chaque étape suffit souvent.
- **Les tests** : `node --test test/hints.test.js` lance un seul fichier. Les tests existants sont aussi de bons exemples d'utilisation de chaque fonction.

## 10. Bonnes pratiques

- **Copier l'existant.** Avant d'écrire quelque chose de nouveau, trouve une fonctionnalité qui ressemble et imite sa structure.
- **Une fonction, un rôle.** Si une fonction lit la base, calcule et formate, découpe-la.
- **Valider côté serveur**, toujours, même si le front vérifie déjà.
- **Des petits commits** avec un message clair. Ils sont plus faciles à relire et à annuler.
- **Un test par bug corrigé**, pour qu'il ne revienne pas.
