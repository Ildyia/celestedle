const statsRepo = require("../repositories/stats");
const { HttpError } = require("../utils/http-error");
const { todayParis, weekStart, addDays } = require("../utils/dates");
const { getMode } = require("./modes");
const ranking = require("./ranking");
const connections = require("./connections");
const staff = require("./staff");
const seasons = require("./seasons");

const PERIODS = ["daily", "weekly", "season"];
const LIMIT = 50;
// Classements du jour : un par mode ; « cx-… » pour Connections
const CONNECTIONS_BOARDS = { "cx-normal": "normal", "cx-hard": "hard" };

function toEntry(row, playerId) {
  return {
    rank: row.rank ?? null,
    player: { id: row.id, name: row.name, avatar: row.avatar, color: row.color },
    isMe: row.id === playerId,
    tries: row.tries ?? null,
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
  const mode = getMode(board);
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

// Semaine : somme des scores (l'assiduité compte) ; saison : moyenne lissée
// (le niveau compte). Tous les modes ensemble.
function combinedBoard(period, playerId, seasonId) {
  const today = todayParis();
  const season = period === "season" ? (seasonId ? seasons.find(seasonId) : seasons.current()) : null;
  const range = season
    ? { from: season.from, to: season.to ?? today }
    : { from: weekStart(today), to: addDays(weekStart(today), 6) };
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
    range,
    // Saison affichée et liste des saisons (en cours d'abord) pour choisir
    season,
    seasons: season ? seasons.list() : undefined,
    top: entries.slice(0, LIMIT),
    me: entries.find((e) => e.isMe) ?? null,
    oneShots: []
  };
}

// mode : celui du classement du jour ; seasonId : une saison passée (par
// défaut celle en cours). Ignorés pour les autres périodes.
function getLeaderboard(period, mode, player = null, seasonId = null) {
  if (!PERIODS.includes(period)) throw new HttpError(400, `Unknown period "${period}"`);
  return period === "daily" ? dailyBoard(mode, player) : combinedBoard(period, player?.id ?? null, seasonId);
}

module.exports = { PERIODS, getLeaderboard };
