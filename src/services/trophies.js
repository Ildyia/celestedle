// Trophées des classements, calculés à partir des parties (rien n'est stocké) :
// - « Winner » : premier du classement d'un jour terminé, dans un mode
//   (normal, hard, tech, tech-hard, cx-normal, cx-hard) ;
// - « Champion » : premier du classement d'une semaine terminée (tous les
//   modes ensemble, comme le classement de la semaine).
// Ils servent de statistiques au profil et marquent deux joueurs dans les
// classements : le champion en titre (dernière semaine terminée) et celui qui
// a le plus de trophées.
// Seuls les jours et les semaines terminés comptent : le résultat ne change
// qu'à minuit, on le garde donc en mémoire pour la journée (et 10 minutes au
// plus, pour suivre un profil qui se cache).
const statsRepo = require("../repositories/stats");
const ranking = require("./ranking");
const { todayParis, weekStart, addDays } = require("../utils/dates");

const CACHE_MS = 10 * 60 * 1000;
let cache = null;

// Gagnant d'une semaine, avec les règles du classement de la semaine
function weeklyChampions(lastDay, listed) {
  const scored = ranking.scoreGames(statsRepo.rankedResults("0000-01-01", lastDay));
  const weeks = new Map();
  for (const game of scored) {
    if (!listed.has(game.playerId)) continue;
    const week = weekStart(game.date);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(game);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, games]) => {
      const totals = ranking.playerTotals(games);
      totals.sort((a, b) => b.points - a.points || b.wins - a.wins || b.games - a.games);
      return { week, playerId: totals[0].playerId };
    });
}

// Détenteur d'un record : le plus de trophées, puis le plus récent à en gagner
function recordHolder(counts, lastWon) {
  let best = null;
  for (const [playerId, count] of counts) {
    if (!best || count > best.count || (count === best.count && lastWon.get(playerId) > lastWon.get(best.playerId))) {
      best = { playerId, count };
    }
  }
  return best;
}

function compute(today) {
  const listed = new Set(statsRepo.listedPlayers().map((p) => p.id));
  const winners = statsRepo.pastDailyWinners(today);
  const champions = weeklyChampions(addDays(weekStart(today), -1), listed);

  // Par joueur : jours gagnés par mode, semaines gagnées
  const players = new Map();
  const of = (id) => {
    if (!players.has(id)) players.set(id, { winner: 0, winnerByBoard: {}, champion: 0 });
    return players.get(id);
  };
  // Records : par mode (jours gagnés) et en tout (jours + semaines)
  const byBoard = new Map();
  const totals = new Map();
  const lastWon = new Map();
  const lastWonIn = new Map();
  const won = (id, date) => {
    if (!(lastWon.get(id) >= date)) lastWon.set(id, date);
    totals.set(id, (totals.get(id) ?? 0) + 1);
  };
  for (const { playerId, board, date } of winners) {
    const p = of(playerId);
    p.winner++;
    p.winnerByBoard[board] = (p.winnerByBoard[board] ?? 0) + 1;
    if (!byBoard.has(board)) byBoard.set(board, new Map());
    byBoard.get(board).set(playerId, (byBoard.get(board).get(playerId) ?? 0) + 1);
    const key = `${board}|${playerId}`;
    if (!(lastWonIn.get(key) >= date)) lastWonIn.set(key, date);
    won(playerId, date);
  }
  for (const { week, playerId } of champions) {
    of(playerId).champion++;
    won(playerId, addDays(week, 6));
  }

  const records = {};
  for (const [board, counts] of byBoard) {
    const last = new Map([...counts.keys()].map((id) => [id, lastWonIn.get(`${board}|${id}`)]));
    records[board] = recordHolder(counts, last);
  }
  return {
    players,
    titleHolder: champions.length && champions.at(-1).week === addDays(weekStart(today), -7) ? champions.at(-1).playerId : null,
    records,
    overall: recordHolder(totals, lastWon)
  };
}

function current() {
  const today = todayParis();
  if (!cache || cache.today !== today || Date.now() - cache.at > CACHE_MS) {
    cache = { today, at: Date.now(), data: compute(today) };
  }
  return cache.data;
}

/** Trophées d'un joueur : { winner, winnerByBoard, champion, isChampion }. */
function playerTrophies(playerId) {
  const data = current();
  const p = data.players.get(playerId) ?? { winner: 0, winnerByBoard: {}, champion: 0 };
  return { ...p, isChampion: data.titleHolder === playerId };
}

/**
 * Marques à poser à côté des noms d'un classement : board est le mode d'un
 * classement du jour, ou null pour la semaine et le général (record en tout).
 */
function boardMarks(board) {
  const data = current();
  const record = board ? data.records[board] : data.overall;
  return { champion: data.titleHolder, record: record ? record.playerId : null, recordCount: record ? record.count : 0 };
}

/** Pour les tests : oublie le calcul gardé en mémoire. */
function resetCache() {
  cache = null;
}

module.exports = { playerTrophies, boardMarks, resetCache };
