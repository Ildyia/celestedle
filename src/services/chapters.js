// Progression en chapitres : chaque victoire (une fraise) fait monter sur la
// montagne, le total de fraises donne le chapitre atteint. Comme dans le
// journal du jeu, on compte aussi les fraises et les « morts » (parties
// perdues ou abandonnées) de chaque chapitre.
// Calculé à partir des parties déjà jouées, comme les achievements : c'est
// rétroactif et rien n'est stocké.
// Les repères sur la montagne sont côté client (public/js/chapters.js).

// berries : fraises à avoir pour atteindre le chapitre
// avatar / color : portrait et couleur de profil débloqués en l'atteignant
// (sprites de public/assets/entities, en plus de ceux de services/players.js)
const CHAPTERS = [
  { name: "Prologue", berries: 0 },
  { name: "Forsaken City", berries: 1, avatar: "flingbird", color: "#64748b" },
  { name: "Old Site", berries: 5, avatar: "cassette-tape", color: "#2dd4bf" },
  { name: "Celestial Resort", berries: 12, avatar: "key", color: "#b45309" },
  { name: "Golden Ridge", berries: 25, avatar: "golden-winged-strawberry", color: "#e0b43a" },
  { name: "Mirror Temple", berries: 45, avatar: "theo-crystal", color: "#5b21b6" },
  { name: "Reflection", berries: 70, avatar: "double-refill", color: "#1e3a8a" },
  { name: "The Summit", berries: 100, avatar: "summit-gems", color: "#f1f5f9" }
];

// Récompenses de chaque chapitre, pour la fenêtre de profil
const REWARDS = CHAPTERS.flatMap((c, chapter) => (c.avatar ? [{ chapter, name: c.name, avatar: c.avatar, color: c.color }] : []));

/** Portraits et couleurs débloqués jusqu'à ce chapitre. */
function unlockedRewards(chapter) {
  const rewards = REWARDS.filter((r) => r.chapter <= chapter);
  return { avatars: rewards.map((r) => r.avatar), colors: rewards.map((r) => r.color) };
}

/**
 * games : parties terminées ({ date, won, finishedAt }), dans n'importe quel ordre.
 * Une partie compte pour le chapitre où le joueur se trouvait en la jouant :
 * la victoire qui fait passer au chapitre suivant appartient encore à l'ancien.
 */
function climbOf(games) {
  const ordered = [...games].sort((a, b) => (a.finishedAt ?? a.date).localeCompare(b.finishedAt ?? b.date));
  const chapters = CHAPTERS.map((c) => ({ ...c, reachedOn: null, strawberries: 0, deaths: 0 }));
  let berries = 0;
  let chapter = 0;
  for (const game of ordered) {
    chapters[0].reachedOn ??= game.date;
    if (!game.won) {
      chapters[chapter].deaths++;
      continue;
    }
    berries++;
    chapters[chapter].strawberries++;
    while (chapter + 1 < CHAPTERS.length && berries >= CHAPTERS[chapter + 1].berries) {
      chapter++;
      chapters[chapter].reachedOn = game.date;
    }
  }
  return { berries, chapter, chapters };
}

module.exports = { CHAPTERS, REWARDS, climbOf, unlockedRewards };
