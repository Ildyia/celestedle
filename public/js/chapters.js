// MAQUETTE : progression en chapitres sur la montagne (voir REDESIGN.md).
// Chaque victoire (une fraise) fait monter ; le total de fraises donne le
// chapitre atteint. Un sentier en pointillé relie sept repères, du pied de la
// montagne au sommet, et un feu de camp marque le chapitre en cours.
// Pour l'instant, rien ne vient du serveur : on regarde le rendu avec
//   menu.html?chapter=3&berries=14
// Sans ce paramètre, rien ne s'affiche.

// x / y : position du repère dans le dessin de la montagne (1600 × 700)
export const CHAPTERS = [
  { name: "Forsaken City", berries: 1, x: 250, y: 540 },
  { name: "Old Site", berries: 5, x: 395, y: 578 },
  { name: "Celestial Resort", berries: 12, x: 520, y: 478 },
  { name: "Golden Ridge", berries: 25, x: 640, y: 472 },
  { name: "Mirror Temple", berries: 45, x: 722, y: 452 },
  { name: "Reflection", berries: 70, x: 800, y: 352 },
  { name: "The Summit", berries: 100, x: 892, y: 268 }
];

/** Chapitre atteint avec ce nombre de fraises : 0 (prologue) à 7. */
export function chapterFor(berries) {
  return CHAPTERS.filter((c) => berries >= c.berries).length;
}

/** Réglage de la maquette dans l'adresse, ou null. */
export function previewChapter() {
  const params = new URLSearchParams(location.search);
  if (!params.has("chapter") && !params.has("berries")) return null;
  const berries = params.has("berries") ? Number(params.get("berries")) : null;
  const chapter = params.has("chapter") ? Math.max(0, Math.min(CHAPTERS.length, Number(params.get("chapter")))) : chapterFor(berries);
  return { chapter, berries: berries ?? (chapter ? CHAPTERS[chapter - 1].berries : 0) };
}

const points = (list) => list.map((c) => `${c.x},${c.y}`).join(" ");

/** Le sentier et ses repères, en SVG posé sur le dessin de la montagne. */
export function trailSvg(chapter) {
  const start = { x: 150, y: 560 };
  const reached = [start, ...CHAPTERS.slice(0, chapter)];
  const marks = CHAPTERS.map((c, i) => {
    const state = i + 1 < chapter ? "done" : i + 1 === chapter ? "here" : "ahead";
    return `<g class="trail-mark ${state}"><circle cx="${c.x}" cy="${c.y}" r="7" /><text x="${c.x}" y="${c.y + 26}" text-anchor="middle">${i + 1}</text></g>`;
  }).join("");
  const here = chapter ? CHAPTERS[chapter - 1] : start;
  return `<svg class="trail" viewBox="0 0 1600 700" aria-hidden="true">
    <polyline class="trail-path" points="${points([start, ...CHAPTERS])}" />
    <polyline class="trail-path walked" points="${points(reached)}" />
    ${marks}
    <image class="trail-camp" href="assets/entities/bonfire.png" x="${here.x - 44}" y="${here.y - 74}" width="88" height="88" />
  </svg>`;
}

/** Texte du livre : chapitre en cours et avancée vers le suivant. */
export function chapterProgress({ chapter, berries }) {
  const current = chapter ? `Chapter ${chapter} · ${CHAPTERS[chapter - 1].name}` : "Prologue";
  const next = CHAPTERS[chapter];
  if (!next) return { title: current, text: "Summit reached", ratio: 1 };
  const from = chapter ? CHAPTERS[chapter - 1].berries : 0;
  return { title: current, text: `${berries} / ${next.berries} strawberries to ${next.name}`, ratio: Math.max(0, Math.min(1, (berries - from) / (next.berries - from))) };
}
