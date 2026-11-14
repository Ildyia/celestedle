// Progression en chapitres : chaque victoire (une fraise) fait monter sur la
// montagne, le total de fraises donne le chapitre atteint. Comme dans le
// journal du jeu, on compte aussi les fraises et les « morts » (parties
// perdues ou abandonnées) de chaque chapitre.
// Calculé à partir des parties déjà jouées, comme les achievements : c'est
// rétroactif et rien n'est stocké.
// Les repères sur la montagne sont côté client (public/js/chapters.js).

// berries : fraises à avoir pour atteindre le chapitre
const CHAPTERS = [
  { name: "Prologue", berries: 0 },
  { name: "Forsaken City", berries: 1 },
  { name: "Old Site", berries: 5 },
  { name: "Celestial Resort", berries: 12 },
  { name: "Golden Ridge", berries: 25 },
  { name: "Mirror Temple", berries: 45 },
  { name: "Reflection", berries: 70 },
  { name: "The Summit", berries: 100 }
];

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

module.exports = { CHAPTERS, climbOf };
