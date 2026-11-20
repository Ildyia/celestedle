// Statistiques de l'onglet « Insights » de l'admin : ce que jouent les gens.
// since : première date comptée (AAAA-MM-JJ), "0000-01-01" pour tout.
// Parties finies seulement ; les duels ont leurs propres tables et ne sont
// comptés qu'à part.
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
  duels: db.prepare(`
    SELECT COUNT(*) AS rooms, SUM(started_at IS NOT NULL) AS played, SUM(is_public = 0) AS private
    FROM duel_rooms WHERE created_at >= @since
  `)
};

const parisHour = (iso) => Number(new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).slice(0, 2)) % 24;

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
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 31),
    duels: stmts.duels.get({ since: since === "0000-01-01" ? since : `${since}T00:00:00` })
  };
}

module.exports = { insights };
