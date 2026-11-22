// Récaps postés par le bot Discord : celui de la veille, chaque jour à minuit,
// et le champion de la semaine terminée, le lundi. Données seulement : la mise
// en forme est dans src/discord/recap-embeds.js.
// Rien n'est dévoilé qui ne soit déjà public : réponses et grilles d'un jour
// fini, joueurs visibles des classements, Connections seulement s'il est
// ouvert à tous.
const statsRepo = require("../repositories/stats");
const secretsRepo = require("../repositories/secrets");
const elementsRepo = require("../repositories/elements");
const connectionsRepo = require("../repositories/connections");
const insightsRepo = require("../repositories/insights");
const ranking = require("./ranking");
const staff = require("./staff");
const { addDays } = require("../utils/dates");

const PODIUM = 3;
const SIDES = ["normal", "hard"];

function celestedleDay(date, mode) {
  const secret = secretsRepo.get(date, mode);
  const stats = statsRepo.communityStats(date, mode);
  return {
    mode,
    answer: secret ? elementsRepo.findById(secret.element_id)?.nom ?? null : null,
    finished: stats.finished,
    wins: stats.wins,
    winRate: stats.winRate,
    avgTries: stats.avgTries,
    podium: statsRepo
      .dailyLeaderboard(date, mode, null)
      .slice(0, PODIUM)
      .map((r) => ({ name: r.name, tries: r.tries, hints: r.hints }))
  };
}

function connectionsDay(date, mode) {
  const key = mode === "hard" ? `hard:${date}` : date;
  const { finished, wins } = connectionsRepo.dayStats(key);
  // Le groupe le moins trouvé (égalité : le premier de la grille)
  const hardest = insightsRepo
    .groupsFound(key)
    .filter((g) => g.players > 0)
    .reduce((min, g) => (!min || g.found / g.players < min.found / min.players ? g : min), null);
  return {
    mode,
    finished,
    wins,
    winRate: finished ? Math.round((wins / finished) * 100) : null,
    hardest: hardest ? { label: hardest.label, share: Math.round((hardest.found / hardest.players) * 100) } : null,
    podium: connectionsRepo
      .dailyBoard(key)
      .slice(0, PODIUM)
      .map((r) => ({ name: r.name, mistakes: r.mistakes, hints: r.hints }))
  };
}

/** Récap d'un jour terminé, tous les jeux. */
function dailyRecap(date) {
  return {
    date,
    celestedle: SIDES.map((mode) => celestedleDay(date, mode)),
    connections: staff.connectionsAccess() === "public" ? SIDES.map((mode) => connectionsDay(date, mode)) : null
  };
}

/** Podium de la semaine du lundi `monday`, avec les règles du classement de la semaine. */
function weeklyRecap(monday) {
  const to = addDays(monday, 6);
  const listed = new Map(statsRepo.listedPlayers().map((p) => [p.id, p]));
  const totals = ranking
    .playerTotals(ranking.scoreGames(statsRepo.rankedResults(monday, to)))
    .filter((t) => listed.has(t.playerId))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.games - a.games);
  return {
    from: monday,
    to,
    podium: totals.slice(0, PODIUM).map((t) => ({ name: listed.get(t.playerId).name, points: Math.round(t.points), wins: t.wins, games: t.games }))
  };
}

module.exports = { dailyRecap, weeklyRecap };
