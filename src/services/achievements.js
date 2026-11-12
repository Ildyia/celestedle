// Achievements (tampons du ticket de fichier). Calculés à partir des parties
// déjà jouées, sans table à part : ils sont rétroactifs et ne peuvent pas se
// désynchroniser. Chaque achievement a une progression (current / goal).
// Les tampons qui les illustrent sont décrits côté client (public/js/stamps.js),
// avec le même identifiant.
const statsRepo = require("../repositories/stats");
const staff = require("./staff");
const { streaks } = require("./players");
const { getModeRules } = require("./mode-rules");
const techs = require("./techs");
const connections = require("./connections");

// Une fraise = une victoire, comme le compteur du ticket
const STRAWBERRIES_100 = 175;
const STRAWBERRIES_MAX = 202;
const SPEEDRUN_SECONDS = 5 * 60;

// Indices « normaux » autorisés dans un mode (sans Element Info)
function maxHintsOf(game, side) {
  if (game === "connections") return connections.MAX_HINTS[side === "b" ? "hard" : "normal"];
  if (game === "techs") return techs.getRules(side === "b" ? "tech-hard" : "tech").maxHints;
  return getModeRules(side === "b" ? "hard" : "normal").maxHints;
}

// Date et heure de Paris d'un horodatage ISO : « AAAA-MM-JJ HH:MM:SS »
const parisClock = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Paris" });

// Une partie = { game, side, date, won, lost, tries, hints, regularHints, wastedTries, finishedAt }
function allGames(playerId) {
  const games = statsRepo.playerAllGames(playerId).map((g) => ({
    game: g.mode.startsWith("tech") ? "techs" : "celestedle",
    side: g.mode === "hard" || g.mode === "tech-hard" ? "b" : "a",
    date: g.date,
    won: g.status === "won",
    tries: g.tries,
    hints: g.hints,
    regularHints: g.regularHints,
    wastedTries: g.wastedTries,
    finishedAt: g.finishedAt
  }));
  for (const [mode, side] of [["normal", "a"], ["hard", "b"]]) {
    for (const g of statsRepo.playerConnectionGames(playerId, mode)) {
      games.push({
        game: "connections",
        side,
        date: g.date,
        won: g.status === "won",
        tries: g.tries,
        hints: g.hints,
        regularHints: g.hints,
        wastedTries: 0,
        finishedAt: g.finishedAt
      });
    }
  }
  return games.map((g) => ({ ...g, lost: !g.won }));
}

// Modes ouverts à tous : Celestedle toujours, les autres jeux quand l'admin
// les a ouverts. Perfectionist et Bad day portent sur ces modes-là.
function publicModes() {
  const modes = ["celestedle|a", "celestedle|b"];
  if (staff.gameAccess("connections") === "public") modes.push("connections|a", "connections|b");
  if (staff.gameAccess("techs") === "public") modes.push("techs|a", "techs|b");
  return modes;
}

// Un jour où toutes les parties des modes publics vérifient `test`
function fullDay(games, test) {
  const modes = publicModes();
  const days = new Map();
  for (const g of games) {
    const mode = `${g.game}|${g.side}`;
    if (!modes.includes(mode) || !test(g)) continue;
    days.set(g.date, (days.get(g.date) ?? new Set()).add(mode));
  }
  return [...days.values()].some((set) => set.size === modes.length) ? 1 : 0;
}

const count = (list, test) => list.filter(test).length;
const wins = (games) => count(games, (g) => g.won);

const ACHIEVEMENTS = [
  {
    id: "strawberry",
    name: "First Strawberry",
    description: "Win a game, any game.",
    progress: (games) => [wins(games), 1]
  },
  {
    id: "lucky",
    name: "Lucky Guess",
    description: "Win a B-Side on your very first guess, without hints.",
    progress: (games) => [count(games, (g) => g.won && g.side === "b" && g.game !== "connections" && g.tries === 1 && g.hints === 0), 1]
  },
  {
    id: "golden",
    name: "Golden Strawberry",
    description: "Win a B-Side without any hint and without a single refused guess.",
    progress: (games) => [count(games, (g) => g.won && g.side === "b" && g.game !== "connections" && g.hints === 0 && g.wastedTries === 0), 1]
  },
  {
    id: "assist",
    name: "Assist Mode",
    description: "Win after using every hint of the mode.",
    progress: (games) => [count(games, (g) => g.won && maxHintsOf(g.game, g.side) > 0 && g.regularHints >= maxHintsOf(g.game, g.side)), 1]
  },
  {
    id: "speedrun",
    name: "Speedrunner",
    description: "Win a game less than 5 minutes after the daily reset (midnight, Paris time).",
    progress: (games) => [
      count(games, (g) => {
        if (!g.won || !g.finishedAt) return false;
        const [day, time] = parisClock(g.finishedAt).split(" ");
        const [h, m, sec] = time.split(":").map(Number);
        return day === g.date && h * 3600 + m * 60 + sec < SPEEDRUN_SECONDS;
      }),
      1
    ]
  },
  {
    id: "perfect",
    name: "Perfectionist",
    description: "Win every mode open to everyone on the same day.",
    progress: (games) => [fullDay(games, (g) => g.won), 1]
  },
  {
    id: "badday",
    name: "Bad Day",
    description: "Lose (or give up) every mode open to everyone on the same day.",
    progress: (games) => [fullDay(games, (g) => g.lost), 1]
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
    id: "hundred",
    name: "100%",
    description: `Collect ${STRAWBERRIES_100} strawberries (one per win).`,
    progress: (games) => [wins(games), STRAWBERRIES_100]
  },
  {
    id: "max",
    name: "Max%",
    description: `Collect ${STRAWBERRIES_MAX} strawberries (one per win).`,
    progress: (games) => [wins(games), STRAWBERRIES_MAX]
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
