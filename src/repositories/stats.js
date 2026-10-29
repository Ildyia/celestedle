const db = require("../db");

// Victoire au premier essai sans indice : pure chance, affichée à part dans le
// classement du jour (elle compte normalement pour la semaine et le global)
const ONE_SHOT_SQL = "(s.status = 'won' AND s.tries = 1 AND s.hints = 0)";
const RANKED_WIN_SQL = "(s.status = 'won' AND (s.tries > 1 OR s.hints > 0))";

// Joueurs visibles dans les classements
const LISTED_SQL = "p.is_hidden = 0 AND p.is_anonymous = 0";

const LEADERBOARD_LIMIT = 50;

const stmts = {
  // Moyennes sur les victoires ; taux de victoire sur les parties terminées
  community: db.prepare(`
    SELECT COALESCE(SUM(status = 'won'), 0) AS wins,
           COUNT(*) AS finished,
           ROUND(AVG(CASE WHEN status = 'won' THEN tries END), 1) AS avgTries,
           ROUND(AVG(CASE WHEN status = 'won' THEN hints END), 1) AS avgHints,
           CAST(ROUND(AVG(CASE WHEN status = 'won' THEN seconds END)) AS INTEGER) AS avgSeconds
    FROM game_summaries s
    WHERE date = ? AND mode = ? AND status <> 'playing'
  `),

  daily: db.prepare(`
    WITH ranked AS (
      SELECT p.id, p.name, p.avatar, p.color, s.tries, s.hints, s.seconds,
             -- Un indice compte comme un essai
             ROW_NUMBER() OVER (ORDER BY s.tries + s.hints, s.seconds, s.finished_at) AS rank
      FROM game_summaries s JOIN players p ON p.id = s.player_id
      WHERE s.date = @date AND s.mode = @mode AND ${RANKED_WIN_SQL} AND ${LISTED_SQL}
    )
    SELECT * FROM ranked WHERE rank <= @limit OR id = @playerId ORDER BY rank
  `),

  dailyOneShots: db.prepare(`
    SELECT p.id, p.name, p.avatar, p.color, s.tries, s.seconds
    FROM game_summaries s JOIN players p ON p.id = s.player_id
    WHERE s.date = @date AND s.mode = @mode AND ${ONE_SHOT_SQL} AND ${LISTED_SQL}
    ORDER BY s.finished_at
    LIMIT @limit
  `),

  // Parties terminées de tous les modes sur une période (semaine ou global),
  // y compris des profils non listés : ils comptent pour comparer les joueurs
  // du jour, mais ne sont pas affichés
  rankedResults: db.prepare(`
    SELECT s.player_id AS playerId, s.mode AS board, s.date, s.status = 'won' AS won,
           s.tries + s.hints AS cost -- un indice compte comme un essai
    FROM game_summaries s
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

  listedPlayers: db.prepare(`
    SELECT p.id, p.name, p.avatar, p.color FROM players p WHERE ${LISTED_SQL}
  `),

  playerGames: db.prepare(`
    SELECT date, status, tries, seconds FROM game_summaries
    WHERE player_id = ? AND mode = ? AND status <> 'playing'
    ORDER BY date
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
    FROM game_summaries WHERE date = ? GROUP BY mode
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
  const { finished, ...stats } = stmts.community.get(date, mode);
  return { ...stats, winRate: finished ? Math.round((stats.wins / finished) * 100) : null };
}

function dailyLeaderboard(date, mode, playerId) {
  return stmts.daily.all({ date, mode, playerId, limit: LEADERBOARD_LIMIT });
}

function dailyOneShots(date, mode) {
  return stmts.dailyOneShots.all({ date, mode, limit: LEADERBOARD_LIMIT });
}

function rankedResults(from, to) {
  return stmts.rankedResults.all({ from, to }).map((r) => ({ ...r, won: r.won === 1 }));
}

function listedPlayers() {
  return stmts.listedPlayers.all();
}

function playerGames(playerId, mode) {
  return stmts.playerGames.all(playerId, mode);
}

function dayOverview(date) {
  return stmts.dayOverview.all(date);
}

function history() {
  return { days: stmts.history.all(), legacy: stmts.legacyHistory.all() };
}

function wordStats() {
  return stmts.wordStats.all().map((w) => ({ ...w, isActive: w.isActive === 1 }));
}

module.exports = {
  communityStats,
  dailyLeaderboard,
  dailyOneShots,
  rankedResults,
  listedPlayers,
  playerGames,
  dayOverview,
  history,
  wordStats
};
