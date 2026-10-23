const statsRepo = require("../repositories/stats");
const { HttpError } = require("../utils/http-error");
const { todayParis, weekStart, addDays } = require("../utils/dates");
const { getMode } = require("./modes");

const PERIODS = ["daily", "weekly", "global"];

function toEntry(row, playerId) {
  return {
    rank: row.rank ?? null,
    player: { id: row.id, name: row.name, avatar: row.avatar, color: row.color },
    isMe: row.id === playerId,
    tries: row.tries ?? null,
    seconds: row.seconds ?? null,
    points: row.points ?? null,
    wins: row.wins ?? null,
    avgTries: row.avgTries ?? null,
    totalSeconds: row.totalSeconds ?? null
  };
}

function getLeaderboard(period, modeId, playerId = null) {
  if (!PERIODS.includes(period)) throw new HttpError(400, `Unknown period "${period}"`);
  const mode = getMode(modeId);
  const today = todayParis();

  let rows;
  let range;
  let oneShots = [];
  if (period === "daily") {
    rows = statsRepo.dailyLeaderboard(today, mode.id, playerId);
    oneShots = statsRepo.dailyOneShots(today, mode.id).map((row) => toEntry(row, playerId));
    range = { from: today, to: today };
  } else {
    range =
      period === "weekly"
        ? { from: weekStart(today), to: addDays(weekStart(today), 6) }
        : { from: "0000-01-01", to: "9999-12-31" };
    rows = statsRepo.aggregatedLeaderboard(mode.id, range.from, range.to, playerId);
  }

  const entries = rows.map((row) => toEntry(row, playerId));
  return {
    period,
    mode: mode.id,
    range: period === "global" ? null : range,
    top: entries.filter((e) => e.rank <= 50),
    me: entries.find((e) => e.isMe) ?? null,
    // Victoires au premier essai du jour, hors classement
    oneShots
  };
}

module.exports = { PERIODS, getLeaderboard };
