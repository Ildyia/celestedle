const db = require("../db");

// Victoire au premier essai sans indice : pure chance, affichée à part dans le
// classement du jour (elle compte normalement pour la semaine et le global)
const ONE_SHOT_SQL = "(s.status = 'won' AND s.tries = 1 AND s.hints = 0)";
const RANKED_WIN_SQL = "(s.status = 'won' AND (s.tries > 1 OR s.hints > 0))";

// Joueurs visibles dans les classements
const LISTED_SQL = "p.is_hidden = 0 AND p.is_anonymous = 0";

const LEADERBOARD_LIMIT = 50;

// Requêtes du jour d'une table de parties : game_summaries (Celestedle) ou
// tech_game_summaries (techs), mêmes colonnes
function dayStatements(table) {
  return {
    // Moyennes sur les victoires ; taux de victoire sur les parties terminées
    community: db.prepare(`
    SELECT COALESCE(SUM(status = 'won'), 0) AS wins,
           COUNT(*) AS finished,
           ROUND(AVG(CASE WHEN status = 'won' THEN tries END), 1) AS avgTries,
           ROUND(AVG(CASE WHEN status = 'won' THEN hints END), 1) AS avgHints,
           CAST(ROUND(AVG(CASE WHEN status = 'won' THEN seconds END)) AS INTEGER) AS avgSeconds
    FROM ${table} s
    WHERE date = ? AND mode = ? AND status <> 'playing'
  `),

    daily: db.prepare(`
    WITH ranked AS (
      SELECT p.id, p.name, p.avatar, p.color, s.tries, s.hints, s.seconds,
             -- Un indice compte comme un essai
             ROW_NUMBER() OVER (ORDER BY s.tries + s.hints, s.seconds, s.finished_at) AS rank
      FROM ${table} s JOIN players p ON p.id = s.player_id
      WHERE s.date = @date AND s.mode = @mode AND ${RANKED_WIN_SQL} AND ${LISTED_SQL}
    )
    SELECT * FROM ranked WHERE rank <= @limit OR id = @playerId ORDER BY rank
  `),

    dailyOneShots: db.prepare(`
    SELECT p.id, p.name, p.avatar, p.color, s.tries, s.seconds
    FROM ${table} s JOIN players p ON p.id = s.player_id
    WHERE s.date = @date AND s.mode = @mode AND ${ONE_SHOT_SQL} AND ${LISTED_SQL}
    ORDER BY s.finished_at
    LIMIT @limit
  `),

    dayOverview: db.prepare(`
    SELECT mode,
           COUNT(*) AS players,
           SUM(status = 'won') AS wins,
           SUM(status = 'forfeit') AS forfeits,
           SUM(status = 'lost') AS losses,
           SUM(status = 'playing') AS playing,
           ROUND(AVG(CASE WHEN status = 'won' THEN tries END), 1) AS avgTries,
           CAST(ROUND(AVG(CASE WHEN status = 'won' THEN seconds END)) AS INTEGER) AS avgSeconds,
           ROUND(AVG(hints), 1) AS avgHints
    FROM ${table} WHERE date = ? GROUP BY mode
  `)
  };
}

const DAY = {
  game_summaries: dayStatements("game_summaries"),
  tech_game_summaries: dayStatements("tech_game_summaries")
};

// Les modes des techs (tech, tech-hard) ont leurs propres tables
function dayFor(mode) {
  return DAY[
    String(mode).startsWith("tech") ? "tech_game_summaries" : "game_summaries"
  ];
}

const stmts = {
  // Parties terminées de tous les modes sur une période (semaine ou global),
  // y compris des profils non listés : ils comptent pour comparer les joueurs
  // du jour, mais ne sont pas affichés
  rankedResults: db.prepare(`
    SELECT s.player_id AS playerId, s.mode AS board, s.date, s.status = 'won' AS won,
           s.tries + s.hints AS cost -- un indice compte comme un essai
    FROM game_summaries s
    WHERE s.date BETWEEN @from AND @to AND s.status <> 'playing'
    UNION ALL
    SELECT s.player_id, s.mode, s.date, s.status = 'won', s.tries + s.hints
    FROM tech_game_summaries s
    WHERE s.date BETWEEN @from AND @to AND s.status <> 'playing'
    UNION ALL
    SELECT g.player_id,
           CASE WHEN g.date LIKE 'hard:%' THEN 'cx-hard' ELSE 'cx-normal' END,
           CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END,
           g.status = 'won',
           -- Un indice compte comme une erreur
           (SELECT COUNT(*) FROM connection_attempts a WHERE a.game_id = g.id AND a.group_index IS NULL)
             + (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id)
    FROM connection_games g
    WHERE g.status <> 'playing'
      AND (g.date BETWEEN @from AND @to OR g.date BETWEEN 'hard:' || @from AND 'hard:' || @to)
  `),

  // Premier de chaque classement du jour passé, par mode : les mêmes règles
  // que dailyLeaderboard (victoires classées, joueurs visibles) et que le
  // classement du jour de Connections
  pastDailyWinners: db.prepare(`
    WITH firsts AS (
      SELECT s.player_id AS playerId, s.mode AS board, s.date,
             ROW_NUMBER() OVER (PARTITION BY s.date, s.mode ORDER BY s.tries + s.hints, s.seconds, s.finished_at) AS rank
      FROM game_summaries s JOIN players p ON p.id = s.player_id
      WHERE s.date < @today AND ${RANKED_WIN_SQL} AND ${LISTED_SQL}
      UNION ALL
      SELECT s.player_id, s.mode, s.date,
             ROW_NUMBER() OVER (PARTITION BY s.date, s.mode ORDER BY s.tries + s.hints, s.seconds, s.finished_at)
      FROM tech_game_summaries s JOIN players p ON p.id = s.player_id
      WHERE s.date < @today AND ${RANKED_WIN_SQL} AND ${LISTED_SQL}
      UNION ALL
      SELECT playerId, board, date, ROW_NUMBER() OVER (PARTITION BY board, date ORDER BY cost, seconds, finished_at)
      FROM (
        SELECT g.player_id AS playerId,
               CASE WHEN g.date LIKE 'hard:%' THEN 'cx-hard' ELSE 'cx-normal' END AS board,
               CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END AS date,
               (SELECT COUNT(*) FROM connection_attempts a WHERE a.game_id = g.id AND a.group_index IS NULL)
                 + (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id) AS cost,
               julianday(g.finished_at) - julianday(g.started_at) AS seconds,
               g.finished_at
        FROM connection_games g JOIN players p ON p.id = g.player_id
        WHERE g.status = 'won' AND ${LISTED_SQL} AND g.date NOT LIKE 'practice%'
      )
      WHERE date < @today
    )
    SELECT playerId, board, date FROM firsts WHERE rank = 1
  `),

  listedPlayers: db.prepare(`
    SELECT p.id, p.name, p.avatar, p.color FROM players p WHERE ${LISTED_SQL}
  `),

  playerGames: db.prepare(`
    SELECT date, status, tries, seconds FROM game_summaries
    WHERE player_id = ? AND mode = ? AND status <> 'playing'
    ORDER BY date
  `),
  // Toutes les parties terminées d'un joueur, Celestedle et techs (achievements)
  // regularHints : sans l'indice Element Info, qui ne compte pas dans maxHints
  playerAllGames: db.prepare(`
    SELECT s.mode, s.date, s.status, s.tries, s.hints, s.wasted_tries AS wastedTries, s.finished_at AS finishedAt,
           (SELECT COUNT(*) FROM game_hints h WHERE h.game_id = s.id AND h.type <> 'info') AS regularHints
    FROM game_summaries s
    WHERE s.player_id = @playerId AND s.status <> 'playing'
    UNION ALL
    SELECT s.mode, s.date, s.status, s.tries, s.hints, s.wasted_tries, s.finished_at,
           (SELECT COUNT(*) FROM tech_hints h WHERE h.game_id = s.id AND h.type <> 'info')
    FROM tech_game_summaries s
    WHERE s.player_id = @playerId AND s.status <> 'playing'
  `),
  playerTechGames: db.prepare(`
    SELECT date, status, tries, seconds FROM tech_game_summaries
    WHERE player_id = ? AND mode = ? AND status <> 'playing'
    ORDER BY date
  `),
  // Grilles du jour de Connections (pas les grilles d'entraînement) : la date
  // est « AAAA-MM-JJ » en Normal, « hard:AAAA-MM-JJ » en Hard. Les erreurs
  // tiennent lieu d'essais.
  playerConnectionGames: db.prepare(`
    SELECT CASE WHEN g.date LIKE 'hard:%' THEN substr(g.date, 6) ELSE g.date END AS date,
           g.status,
           (SELECT COUNT(*) FROM connection_attempts a WHERE a.game_id = g.id AND a.group_index IS NULL) AS tries,
           (SELECT COUNT(*) FROM connection_hints h WHERE h.game_id = g.id) AS hints,
           g.finished_at AS finishedAt,
           CAST(ROUND((julianday(g.finished_at) - julianday(g.started_at)) * 86400) AS INTEGER) AS seconds
    FROM connection_games g
    WHERE g.player_id = @playerId AND g.status <> 'playing'
      AND CASE WHEN @mode = 'hard' THEN g.date LIKE 'hard:%' ELSE g.date NOT LIKE '%:%' END
    ORDER BY 1
  `),

  history: db.prepare(`
    SELECT d.date, d.mode, d.source, d.version, e.name AS word,
           COUNT(s.id) AS players,
           COALESCE(SUM(s.status = 'won'), 0) AS wins,
           COALESCE(SUM(s.status = 'forfeit'), 0) AS forfeits,
           COALESCE(SUM(s.status = 'lost'), 0) AS losses,
           COALESCE(SUM(s.status = 'playing'), 0) AS unfinished,
           ROUND(AVG(CASE WHEN s.status = 'won' THEN s.tries END), 1) AS avgTries,
           CAST(ROUND(AVG(CASE WHEN s.status = 'won' THEN s.seconds END)) AS INTEGER) AS avgSeconds
    FROM daily_secrets d
    JOIN elements e ON e.id = d.element_id
    LEFT JOIN game_summaries s ON s.date = d.date AND s.mode = d.mode
    GROUP BY d.date, d.mode
    ORDER BY d.date DESC, d.mode
  `),

  legacyHistory: db.prepare(`
    SELECT date, secret_word AS word, victories AS wins, avg_tries AS avgTries,
           avg_hints AS avgHints, avg_seconds AS avgSeconds
    FROM legacy_daily_stats ORDER BY date DESC
  `),

  wordStats: db.prepare(`
    SELECT e.id, e.name, e.sprite, e.is_active AS isActive,
           (SELECT COUNT(*) FROM daily_secrets d WHERE d.element_id = e.id) AS timesPicked,
           (SELECT MAX(date) FROM daily_secrets d WHERE d.element_id = e.id) AS lastPicked,
           (SELECT COUNT(*) FROM guesses g WHERE g.element_id = e.id) AS timesGuessed,
           (SELECT COUNT(*) FROM game_summaries s JOIN daily_secrets d
              ON d.date = s.date AND d.mode = s.mode
            WHERE d.element_id = e.id AND s.status <> 'playing') AS games,
           (SELECT COUNT(*) FROM game_summaries s JOIN daily_secrets d
              ON d.date = s.date AND d.mode = s.mode
            WHERE d.element_id = e.id AND s.status = 'won') AS wins,
           (SELECT ROUND(AVG(s.tries), 1) FROM game_summaries s JOIN daily_secrets d
              ON d.date = s.date AND d.mode = s.mode
            WHERE d.element_id = e.id AND s.status = 'won') AS avgTries,
           (SELECT COUNT(*) FROM legacy_daily_stats l WHERE l.secret_word = e.name) AS legacyDays,
           (SELECT COALESCE(SUM(victories), 0) FROM legacy_daily_stats l WHERE l.secret_word = e.name) AS legacyWins
    FROM elements e
    ORDER BY e.name
  `)
};

function communityStats(date, mode) {
  const { finished, ...stats } = dayFor(mode).community.get(date, mode);
  return {
    ...stats,
    winRate: finished ? Math.round((stats.wins / finished) * 100) : null
  };
}

function dailyLeaderboard(date, mode, playerId) {
  return dayFor(mode).daily.all({
    date,
    mode,
    playerId,
    limit: LEADERBOARD_LIMIT
  });
}

function dailyOneShots(date, mode) {
  return dayFor(mode).dailyOneShots.all({
    date,
    mode,
    limit: LEADERBOARD_LIMIT
  });
}

function rankedResults(from, to) {
  return stmts.rankedResults
    .all({ from, to })
    .map((r) => ({ ...r, won: r.won === 1 }));
}

function pastDailyWinners(today) {
  return stmts.pastDailyWinners.all({ today });
}

function listedPlayers() {
  return stmts.listedPlayers.all();
}

// Parties terminées d'un joueur dans un mode (Celestedle ou techs)
function playerGames(playerId, mode) {
  const stmt = String(mode).startsWith("tech") ? stmts.playerTechGames : stmts.playerGames;
  return stmt.all(playerId, mode);
}

function playerAllGames(playerId) {
  return stmts.playerAllGames.all({ playerId });
}

function playerConnectionGames(playerId, mode) {
  return stmts.playerConnectionGames.all({ playerId, mode });
}

// Chiffres du jour par mode, pour Celestedle ou pour les techs
function dayOverview(date, { techs = false } = {}) {
  return DAY[techs ? "tech_game_summaries" : "game_summaries"].dayOverview.all(
    date
  );
}

function history() {
  return { days: stmts.history.all(), legacy: stmts.legacyHistory.all() };
}

function wordStats() {
  return stmts.wordStats
    .all()
    .map((w) => ({ ...w, isActive: w.isActive === 1 }));
}

module.exports = {
  playerAllGames,
  playerConnectionGames,
  communityStats,
  dailyLeaderboard,
  dailyOneShots,
  rankedResults,
  pastDailyWinners,
  listedPlayers,
  playerGames,
  dayOverview,
  history,
  wordStats
};
