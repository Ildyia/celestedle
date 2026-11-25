// Onglet admin « Progression » : où en sont les joueurs sur la montagne
// (chapitres, fraises) et quels tampons sont durs ou faciles à obtenir.
// Tout est recalculé à partir des parties, comme les achievements : rien
// n'est stocké, et un joueur supprimé disparaît des chiffres.
const db = require("../db");
const { ACHIEVEMENTS, allGames, achievementsOf } = require("./achievements");
const { CHAPTERS, climbOf } = require("./chapters");

const TOP = 15;

// Joueurs enregistrés qui ont terminé au moins une partie, avec la date de la
// dernière. Les profils anonymes (jamais enregistrés) sont écartés : un même
// joueur en laisse souvent plusieurs (autre appareil, navigateur vidé).
const playedStmt = db.prepare(`
  SELECT p.id, p.name, p.avatar, p.color, p.is_hidden AS isHidden, MAX(d.date) AS lastPlayed
  FROM players p
  JOIN (
    SELECT player_id, date FROM game_summaries WHERE status <> 'playing'
    UNION ALL SELECT player_id, date FROM tech_game_summaries WHERE status <> 'playing'
    UNION ALL SELECT player_id, substr(date, instr(date, ':') + 1)
      FROM connection_games WHERE status <> 'playing' AND date NOT LIKE 'practice%'
  ) d ON d.player_id = p.id
  WHERE p.is_anonymous = 0
  GROUP BY p.id
`);

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const average = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/**
 * since : seuls les joueurs dont la dernière partie date de ce jour ou après
 * (« actifs ») ; "0000-01-01" pour tout le monde.
 */
function progression(since = "0000-01-01") {
  const rows = playedStmt.all().filter((p) => p.lastPlayed >= since);
  const players = rows.map((p) => {
    const games = allGames(p.id);
    const climb = climbOf(games);
    const stamps = achievementsOf(games);
    return {
      player: p,
      berries: climb.berries,
      chapter: climb.chapter,
      falls: climb.chapters.reduce((s, c) => s + c.deaths, 0),
      // Jours de montée : de la première partie au jour où chaque chapitre est atteint
      reached: climb.chapters.map((c) => (c.reachedOn ? daysBetween(climb.chapters[0].reachedOn, c.reachedOn) : null)),
      stamps
    };
  });
  const n = players.length;

  const chapters = CHAPTERS.map((c, i) => {
    const reached = players.filter((p) => p.chapter >= i);
    return {
      name: c.name,
      berries: c.berries,
      // Joueurs qui y sont en ce moment / qui l'ont atteint un jour
      current: players.filter((p) => p.chapter === i).length,
      reached: reached.length,
      medianDays: i === 0 ? 0 : median(reached.map((p) => p.reached[i]))
    };
  });

  const achievements = ACHIEVEMENTS.map((a, i) => {
    const goal = a.progress([])[1];
    const earned = players.filter((p) => p.stamps[i].earned);
    const others = players.filter((p) => !p.stamps[i].earned);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      earned: earned.length,
      // Où en sont ceux qui ne l'ont pas : part moyenne du but (progressions à plusieurs étapes)
      avgProgress: goal === 1 ? null : round1(average(others.map((p) => (p.stamps[i].current / p.stamps[i].goal) * 100))),
      goal
    };
  }).sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name));

  const stampCounts = players.map((p) => p.stamps.filter((s) => s.earned).length);
  const stampsHistogram = Array.from({ length: ACHIEVEMENTS.length + 1 }, (_, k) => stampCounts.filter((c) => c === k).length);

  const furthest = [...players]
    .sort((a, b) => b.berries - a.berries || b.stamps.filter((s) => s.earned).length - a.stamps.filter((s) => s.earned).length || a.falls - b.falls)
    .slice(0, TOP)
    .map((p) => ({
      id: p.player.id,
      name: p.player.name,
      avatar: p.player.avatar,
      color: p.player.color,
      isHidden: p.player.isHidden === 1,
      berries: p.berries,
      chapter: p.chapter,
      chapterName: CHAPTERS[p.chapter].name,
      falls: p.falls,
      stamps: p.stamps.filter((s) => s.earned).length,
      lastPlayed: p.player.lastPlayed
    }));

  const berries = players.map((p) => p.berries);
  const meanChapter = average(players.map((p) => p.chapter));
  return {
    players: n,
    summary: {
      avgBerries: round1(average(berries)),
      medianBerries: median(berries),
      maxBerries: n ? Math.max(...berries) : null,
      avgChapter: round1(meanChapter),
      // Chapitre du joueur « médian »
      medianChapter: n ? CHAPTERS[Math.floor(median(players.map((p) => p.chapter)))].name : null,
      avgStamps: round1(average(stampCounts)),
      winRate: round1(average(players.map((p) => (p.berries + p.falls ? (p.berries / (p.berries + p.falls)) * 100 : 0))))
    },
    chapters,
    achievements,
    stamps: { total: ACHIEVEMENTS.length, histogram: stampsHistogram },
    furthest
  };
}

module.exports = { progression };
