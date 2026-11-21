// Statistiques de l'onglet « Insights » de l'admin : ce que jouent les gens.
// since : première date comptée (AAAA-MM-JJ), "0000-01-01" pour tout.
// Parties finies seulement ; les duels ont leurs propres tables et ne sont
// comptés qu'à part. Connections : grilles du jour seulement (pas
// l'entraînement).
const db = require("../db");

const LIMIT = 15;

const stmts = {
  // Premier essai de chaque partie (Celestedle), par mode
  openers: db.prepare(`
    SELECT e.name, COUNT(*) AS games, SUM(s.status = 'won') AS wins, ROUND(AVG(s.tries), 1) AS avgTries
    FROM game_summaries s
    JOIN guesses gu ON gu.game_id = s.id
      AND gu.position = (SELECT MIN(position) FROM guesses WHERE game_id = s.id)
    JOIN elements e ON e.id = gu.element_id
    WHERE s.mode = @mode AND s.date >= @since AND s.status <> 'playing'
    GROUP BY e.id ORDER BY games DESC, wins DESC LIMIT ${LIMIT}
  `),
  // Tous les essais, tous modes de Celestedle
  mostGuessed: db.prepare(`
    SELECT e.name, COUNT(*) AS times
    FROM guesses gu JOIN games g ON g.id = gu.game_id JOIN elements e ON e.id = gu.element_id
    WHERE g.date >= @since
    GROUP BY e.id ORDER BY times DESC LIMIT ${LIMIT}
  `),
  // Victoires par nombre d'essais (indices compris)
  tries: db.prepare(`
    SELECT MIN(tries + hints, 10) AS cost, COUNT(*) AS games
    FROM game_summaries WHERE mode = @mode AND date >= @since AND status = 'won'
    GROUP BY cost ORDER BY cost
  `),
  outcomes: db.prepare(`
    SELECT status, COUNT(*) AS games FROM game_summaries
    WHERE mode = @mode AND date >= @since AND status <> 'playing' GROUP BY status
  `),
  hints: db.prepare(`
    SELECT h.type, COUNT(*) AS uses
    FROM game_hints h JOIN games g ON g.id = h.game_id
    WHERE g.date >= @since GROUP BY h.type ORDER BY uses DESC
  `),
  gamesWithHints: db.prepare(`
    SELECT COUNT(*) AS games, SUM(hints > 0) AS withHints FROM game_summaries
    WHERE date >= @since AND status <> 'playing'
  `),
  // Heure de fin des parties (convertie à l'heure de Paris côté JS)
  finishTimes: db.prepare(`
    SELECT finished_at FROM games WHERE date >= @since AND finished_at IS NOT NULL
    UNION ALL
    SELECT finished_at FROM connection_games
    WHERE finished_at IS NOT NULL AND date NOT LIKE 'practice%'
      AND (CASE WHEN date LIKE 'hard:%' THEN substr(date, 6) ELSE date END) >= @since
  `),
  // Parties et joueurs par jour, par jeu
  daily: db.prepare(`
    SELECT date, 'celestedle' AS game, COUNT(*) AS games, COUNT(DISTINCT player_id) AS players
    FROM games WHERE date >= @since GROUP BY date
    UNION ALL
    SELECT CASE WHEN date LIKE 'hard:%' THEN substr(date, 6) ELSE date END AS day, 'connections', COUNT(*), COUNT(DISTINCT player_id)
    FROM connection_games WHERE date NOT LIKE 'practice%'
      AND (CASE WHEN date LIKE 'hard:%' THEN substr(date, 6) ELSE date END) >= @since
    GROUP BY day
  `),
  // Joueurs distincts par jour, tous jeux confondus
  players: db.prepare(`
    SELECT day, COUNT(DISTINCT player_id) AS players FROM (
      SELECT date AS day, player_id FROM games
      UNION ALL SELECT CASE WHEN date LIKE 'hard:%' THEN substr(date, 6) ELSE date END, player_id
      FROM connection_games WHERE date NOT LIKE 'practice%'
    ) WHERE day >= @since GROUP BY day
  `),
  // Connections : parties finies, avec leur grille (une grille refaite depuis
  // la partie n'est plus la même : on ne la compte pas, voir plus bas)
  cxGames: db.prepare(`
    SELECT g.id, g.date, g.status, g.puzzle_version AS gameVersion, p.version AS puzzleVersion, p.groups,
           (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id) AS hints
    FROM connection_games g JOIN connection_puzzles p ON p.date = g.date
    WHERE g.status <> 'playing' AND g.date NOT LIKE 'practice%'
      AND (CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END) >= @since
  `),
  cxAttempts: db.prepare(`
    SELECT a.game_id AS gameId, a.group_index AS groupIndex, a.element_ids AS elementIds
    FROM connection_attempts a JOIN connection_games g ON g.id = a.game_id
    WHERE g.status <> 'playing' AND g.date NOT LIKE 'practice%'
      AND (CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END) >= @since
  `),
  cxHints: db.prepare(`
    SELECT h.type, COUNT(*) AS uses
    FROM connection_hints h JOIN connection_games g ON g.id = h.game_id
    WHERE g.date NOT LIKE 'practice%'
      AND (CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END) >= @since
    GROUP BY h.type ORDER BY uses DESC
  `),
  elementNames: db.prepare("SELECT id, name FROM elements"),
  duels: db.prepare(`
    SELECT COUNT(*) AS rooms, SUM(started_at IS NOT NULL) AS played, SUM(is_public = 0) AS private
    FROM duel_rooms WHERE created_at >= @since
  `)
};

// Grilles trouvées dans moins de joueurs que ça : pas classées (trop peu de
// parties pour dire si un groupe est dur)
const MIN_PLAYERS = 3;
const KIND_NAMES = ["type", "shape", "colour", "chapter", "tag"];

/**
 * Connections, par mode : issues, erreurs des victoires, taux de réussite
 * par sorte de groupe, groupes les plus durs et éléments qui piègent le plus
 * (présents dans les mauvaises propositions).
 */
function connectionsInsights(since) {
  const games = stmts.cxGames.all({ since }).filter((g) => g.gameVersion === g.puzzleVersion);
  const byGame = new Map(games.map((g) => [g.id, { found: new Set(), mistakes: 0 }]));
  const decoys = new Map();
  for (const a of stmts.cxAttempts.all({ since })) {
    const game = byGame.get(a.gameId);
    if (!game) continue;
    if (a.groupIndex === null) {
      game.mistakes++;
      for (const id of JSON.parse(a.elementIds)) decoys.set(id, (decoys.get(id) ?? 0) + 1);
    } else game.found.add(a.groupIndex);
  }

  const modes = {};
  const groups = new Map();
  for (const g of games) {
    const mode = g.date.startsWith("hard:") ? "hard" : "normal";
    const m = (modes[mode] ??= { outcomes: { won: 0, lost: 0 }, mistakes: [0, 0, 0, 0, 0], hints: 0, kinds: {} });
    const { found, mistakes } = byGame.get(g.id);
    m.outcomes[g.status] = (m.outcomes[g.status] ?? 0) + 1;
    if (g.status === "won") m.mistakes[Math.min(mistakes, 4)]++;
    if (g.hints) m.hints++;
    JSON.parse(g.groups).forEach((group, index) => {
      // Les anciennes grilles n'ont pas « kind » : on le lit dans la clé
      const kind = group.kind ?? group.key.split(":")[0];
      const k = (m.kinds[kind] ??= { seen: 0, found: 0 });
      k.seen++;
      if (found.has(index)) k.found++;
      const id = `${g.date}|${index}`;
      const row = groups.get(id) ?? { date: g.date.replace("hard:", ""), mode, label: group.label, kind, players: 0, found: 0 };
      row.players++;
      if (found.has(index)) row.found++;
      groups.set(id, row);
    });
  }
  for (const m of Object.values(modes)) {
    m.kinds = KIND_NAMES.filter((k) => m.kinds[k]).map((kind) => ({ kind, ...m.kinds[kind] }));
  }
  const names = new Map(stmts.elementNames.all().map((e) => [e.id, e.name]));
  return {
    modes,
    hints: stmts.cxHints.all({ since }),
    hardest: [...groups.values()]
      .filter((r) => r.players >= MIN_PLAYERS)
      .sort((a, b) => a.found / a.players - b.found / b.players || b.players - a.players)
      .slice(0, LIMIT),
    decoys: [...decoys.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LIMIT)
      .filter(([id]) => names.has(id))
      .map(([id, times]) => ({ name: names.get(id), times }))
  };
}

// Un seul formateur : toLocaleString en crée un à chaque appel, et des
// dizaines de milliers d'appels bloquaient le serveur plusieurs secondes
const PARIS_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false });
const parisHour = (iso) => Number(PARIS_HOUR.format(new Date(iso))) % 24;

function insights(since) {
  const byMode = (stmt) => ({ normal: stmt.all({ mode: "normal", since }), hard: stmt.all({ mode: "hard", since }) });
  const hours = Array.from({ length: 24 }, () => 0);
  for (const { finished_at: at } of stmts.finishTimes.all({ since })) hours[parisHour(at)]++;

  // Jours : une ligne par date, une colonne par jeu, joueurs distincts par jeu
  const days = new Map();
  for (const row of stmts.daily.all({ since })) {
    const day = days.get(row.date) ?? { date: row.date, celestedle: 0, connections: 0, players: 0 };
    day[row.game] = row.games;
    days.set(row.date, day);
  }
  for (const { day, players } of stmts.players.all({ since })) if (days.has(day)) days.get(day).players = players;

  return {
    since,
    openers: byMode(stmts.openers),
    mostGuessed: stmts.mostGuessed.all({ since }),
    tries: byMode(stmts.tries),
    outcomes: byMode(stmts.outcomes),
    hints: stmts.hints.all({ since }),
    gamesWithHints: stmts.gamesWithHints.get({ since }),
    hours,
    connections: connectionsInsights(since),
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31),
    duels: stmts.duels.get({ since: since === "0000-01-01" ? since : `${since}T00:00:00` })
  };
}

module.exports = { insights };
