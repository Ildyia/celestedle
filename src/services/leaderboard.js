const statsRepo = require("../repositories/stats");
const { HttpError } = require("../utils/http-error");
const { todayParis, weekStart, addDays } = require("../utils/dates");
const { getMode } = require("./modes");
const ranking = require("./ranking");
const connections = require("./connections");
const staff = require("./staff");
const trophies = require("./trophies");

const PERIODS = ["daily", "weekly", "global"];
const LIMIT = 50;
// Classements du jour : un par mode ; « cx-… » pour Connections
const CONNECTIONS_BOARDS = { "cx-normal": "normal", "cx-hard": "hard" };
const TECH_BOARDS = ["tech", "tech-hard"];

function toEntry(row, playerId) {
  return {
    rank: row.rank ?? null,
    player: { id: row.id, name: row.name, avatar: row.avatar, color: row.color },
    isMe: row.id === playerId,
    tries: row.tries ?? null,
    hints: row.hints ?? null,
    seconds: row.seconds ?? null
  };
}

function dailyBoard(board, player) {
  const playerId = player?.id ?? null;
  const today = todayParis();
  const range = { from: today, to: today };
  if (CONNECTIONS_BOARDS[board]) {
    if (!staff.canPlaytest(player)) throw new HttpError(403, "Connections isn't open yet.");
    const top = connections.leaderboard(playerId, CONNECTIONS_BOARDS[board]);
    return { period: "daily", mode: board, range, top, me: top.find((e) => e.isMe) ?? null, oneShots: [] };
  }
  if (TECH_BOARDS.includes(board) && !staff.canPlay("techs", player)) {
    throw new HttpError(403, "This mode isn't open yet.");
  }
  const mode = TECH_BOARDS.includes(board) ? { id: board } : getMode(board);
  const entries = statsRepo.dailyLeaderboard(today, mode.id, playerId).map((row) => toEntry(row, playerId));
  return {
    period: "daily",
    mode: mode.id,
    range,
    top: entries.filter((e) => e.rank <= LIMIT),
    me: entries.find((e) => e.isMe) ?? null,
    // Victoires au premier essai du jour, hors classement
    oneShots: statsRepo.dailyOneShots(today, mode.id).map((row) => toEntry(row, playerId))
  };
}

// Semaine : somme des scores (l'assiduité compte) ; global : moyenne lissée
// (le niveau compte). Tous les modes ensemble.
function combinedBoard(period, playerId) {
  const today = todayParis();
  const range =
    period === "weekly"
      ? { from: weekStart(today), to: addDays(weekStart(today), 6) }
      : { from: "0000-01-01", to: "9999-12-31" };
  const listed = new Map(statsRepo.listedPlayers().map((p) => [p.id, p]));
  const totals = ranking
    .playerTotals(ranking.scoreGames(statsRepo.rankedResults(range.from, range.to)))
    .filter((t) => listed.has(t.playerId));
  const value = period === "weekly" ? (t) => t.points : (t) => t.rating;
  totals.sort((a, b) => value(b) - value(a) || b.wins - a.wins || b.games - a.games);

  const entries = totals.map((t, i) => {
    const p = listed.get(t.playerId);
    return {
      rank: i + 1,
      player: { id: p.id, name: p.name, avatar: p.avatar, color: p.color },
      isMe: p.id === playerId,
      score: Math.round(value(t) * 10) / 10,
      games: t.games,
      wins: t.wins
    };
  });
  return {
    period,
    mode: null,
    range: period === "global" ? null : range,
    top: entries.slice(0, LIMIT),
    me: entries.find((e) => e.isMe) ?? null,
    oneShots: []
  };
}

// Trophées à côté des noms (services/trophies.js) : champion en titre, et
// record de trophées du mode (du jour) ou de tous les modes (semaine, général)
function withTrophies(board) {
  const marks = trophies.boardMarks(board.period === "daily" ? board.mode : null);
  const mark = (entry) =>
    entry && {
      ...entry,
      champion: entry.player.id === marks.champion,
      record: entry.player.id === marks.record ? marks.recordCount : 0
    };
  return { ...board, top: board.top.map(mark), me: mark(board.me), oneShots: board.oneShots.map(mark) };
}

// mode : celui du classement du jour (ignoré pour la semaine et le global)
function getLeaderboard(period, mode, player = null) {
  if (!PERIODS.includes(period)) throw new HttpError(400, `Unknown period "${period}"`);
  return withTrophies(period === "daily" ? dailyBoard(mode, player) : combinedBoard(period, player?.id ?? null));
}

module.exports = { PERIODS, getLeaderboard };
