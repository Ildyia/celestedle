// Achievements (tampons du ticket de fichier). Calculés à partir des parties
// déjà jouées, sans table à part : ils sont rétroactifs et ne peuvent pas se
// désynchroniser. Chaque achievement a une progression (current / goal).
// Les tampons qui les illustrent sont décrits côté client (public/js/stamps.js),
// avec le même identifiant.
const statsRepo = require("../repositories/stats");
const { streaks } = require("./players");

// Une partie = { game, side, date, won, tries, hints }
function allGames(playerId) {
  const games = statsRepo.playerAllGames(playerId).map((g) => ({
    game: g.mode.startsWith("tech") ? "techs" : "celestedle",
    side: g.mode === "hard" || g.mode === "tech-hard" ? "b" : "a",
    date: g.date,
    won: g.status === "won",
    tries: g.tries,
    hints: g.hints
  }));
  for (const [mode, side] of [["normal", "a"], ["hard", "b"]]) {
    for (const g of statsRepo.playerConnectionGames(playerId, mode)) {
      games.push({ game: "connections", side, date: g.date, won: g.status === "won", tries: g.tries, hints: g.hints });
    }
  }
  return games;
}

const count = (list, test) => list.filter(test).length;

const ACHIEVEMENTS = [
  {
    id: "strawberry",
    name: "First Strawberry",
    description: "Win a game, any game.",
    progress: (games) => [count(games, (g) => g.won), 1]
  },
  {
    id: "skull",
    name: "B-Side Survivor",
    description: "Win a B-Side (Hard) game.",
    progress: (games) => [count(games, (g) => g.won && g.side === "b"), 1]
  },
  {
    id: "winged",
    name: "Winged Strawberry",
    description: "Win Celestedle or Techs on the very first try, without hints.",
    progress: (games) => [count(games, (g) => g.won && g.game !== "connections" && g.tries === 1 && g.hints === 0), 1]
  },
  {
    id: "heart",
    name: "Crystal Heart",
    description: "Win both the A-Side and the B-Side of a game on the same day.",
    progress: (games) => {
      const sides = new Map();
      for (const g of games) {
        if (!g.won) continue;
        const key = `${g.game}|${g.date}`;
        sides.set(key, (sides.get(key) ?? new Set()).add(g.side));
      }
      return [[...sides.values()].some((set) => set.size === 2) ? 1 : 0, 1];
    }
  },
  {
    id: "summit",
    name: "Summit Streak",
    description: "Win 7 days in a row on the same game and side.",
    progress: (games) => {
      let best = 0;
      for (const game of ["celestedle", "connections", "techs"]) {
        for (const side of ["a", "b"]) {
          const dates = games.filter((g) => g.won && g.game === game && g.side === side).map((g) => g.date).sort();
          best = Math.max(best, streaks([...new Set(dates)]).best);
        }
      }
      return [best, 7];
    }
  },
  {
    id: "feather",
    name: "Seasoned Climber",
    description: "Win 25 games in total.",
    progress: (games) => [count(games, (g) => g.won), 25]
  }
];

function playerAchievements(player) {
  const games = allGames(player.id);
  return ACHIEVEMENTS.map(({ id, name, description, progress }) => {
    const [current, goal] = progress(games);
    return { id, name, description, current: Math.min(current, goal), goal, earned: current >= goal };
  });
}

module.exports = { ACHIEVEMENTS, playerAchievements };
