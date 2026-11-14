// Progression en chapitres : chaque victoire (une fraise) fait monter sur la
// montagne, le total de fraises donne le chapitre atteint. Comme dans le
// journal du jeu, on compte aussi les fraises et les « morts » (parties
// perdues ou abandonnées) de chaque chapitre.
// Calculé à partir des parties déjà jouées, comme les achievements : c'est
// rétroactif et rien n'est stocké.
// Les repères sur la montagne sont côté client (public/js/chapters.js).
const { FAMILIES } = require("./avatars");

// berries : fraises à avoir pour atteindre le chapitre
// family / color : personnage (services/avatars.js) dont les portraits se
// débloquent en l'atteignant, et couleur de profil débloquée
const CHAPTERS = [
  { name: "Prologue", berries: 0 },
  { name: "Forsaken City", berries: 1, family: "strawberry", color: "#d7263d" },
  { name: "Old Site", berries: 5, family: "badeline", color: "#c04fc8" },
  { name: "Celestial Resort", berries: 12, family: "oshiro", color: "#8c1c3a" },
  { name: "Golden Ridge", berries: 25, family: "feather", color: "#ffd84d" },
  { name: "Mirror Temple", berries: 45, family: "theo", color: "#5b2d91" },
  { name: "Reflection", berries: 70, family: "kevin", color: "#5fbf4a" },
  { name: "The Summit", berries: 100, family: "golden-winged", color: "#f4f6fb" },
  // Sur la Lune
  { name: "Farewell", berries: 150, family: "granny", color: "#8b8fa3" }
];

// Récompenses de chaque chapitre, pour la fenêtre de profil
const REWARDS = CHAPTERS.flatMap((c, chapter) =>
  c.family ? [{ chapter, name: c.name, family: c.family, familyName: FAMILIES[c.family].name, avatars: FAMILIES[c.family].avatars, color: c.color }] : []
);

/** Portraits et couleurs débloqués jusqu'à ce chapitre. */
function unlockedRewards(chapter) {
  const rewards = REWARDS.filter((r) => r.chapter <= chapter);
  return { avatars: rewards.flatMap((r) => r.avatars), colors: rewards.map((r) => r.color) };
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
