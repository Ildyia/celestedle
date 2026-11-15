// Progression en chapitres sur la montagne (voir REDESIGN.md).
// Chaque victoire (une fraise) fait monter ; le total de fraises donne le
// chapitre atteint. Un sentier en pointillé relie sept repères, du pied de la
// montagne au sommet, et le repère de la carte du jeu marque le chapitre en cours.
// Le serveur calcule la progression (src/services/chapters.js, envoyée avec
// les achievements) ; ici, on place les repères et on dessine.
// Pour voir un autre état sans le jouer : menu.html?chapter=3&berries=14

// x / y : position du repère dans le dessin de la montagne (1600 × 700).
// Les noms et les seuils sont ceux du serveur (ils servent ici à l'aperçu).
export const CHAPTERS = [
  { name: "Forsaken City", berries: 1, x: 250, y: 540 },
  { name: "Old Site", berries: 5, x: 395, y: 578 },
  { name: "Celestial Resort", berries: 12, x: 520, y: 478 },
  { name: "Golden Ridge", berries: 25, x: 640, y: 472 },
  { name: "Mirror Temple", berries: 45, x: 722, y: 452 },
  { name: "Reflection", berries: 70, x: 800, y: 352 },
  { name: "The Summit", berries: 100, x: 892, y: 268 },
  // Sur la Lune : le repère est posé sur la lune (#moon, menu.js), le sentier
  // part du sommet vers le ciel. La lune bouge à part de la montagne (et
  // selon la taille de l'écran) : x / y sont une première visée, que
  // aimAtMoon corrige sur la vraie position de la lune.
  { name: "Farewell", berries: 150, moon: true, x: 1290, y: -40 }
];
const ON_MOUNTAIN = CHAPTERS.filter((c) => !c.moon);
// Le chapitre en cours est montré par le repère de la carte du jeu (graphics
// dump, Mountain/marker) : Madeline qui court dans une épingle dorée. Ses 10
// images sont côte à côte dans assets/menu/marker-run.png (300 × 300 chacune).
// dx / dy : coin de l'image par rapport au repère, la pointe de l'épingle dessus.
const MARKER = { size: 80, dx: -40, dy: -78 };
const markerSvg = (x, y, className) =>
  `<svg class="${className}" x="${x + MARKER.dx}" y="${y + MARKER.dy}" width="${MARKER.size}" height="${MARKER.size}" viewBox="0 0 300 300"><clipPath id="marker-clip"><rect width="300" height="300" /></clipPath><g clip-path="url(#marker-clip)"><image class="marker-frames" href="assets/menu/marker-run.png" width="3000" height="300" /></g></svg>`;
// Du sommet à la lune : courbe qui monte puis s'incline vers (x, y)
const moonPath = (x, y) => {
  const top = ON_MOUNTAIN.at(-1);
  return `M ${top.x} ${top.y} Q ${Math.round(top.x + (x - top.x) * 0.27)} ${Math.round(y + (top.y - y) * 0.3)} ${Math.round(x)} ${Math.round(y)}`;
};
const MOON_PATH = moonPath(CHAPTERS.at(-1).x, CHAPTERS.at(-1).y);

/**
 * Fait finir le sentier du ciel sur la lune. target : point de l'écran
 * (en pixels) où se trouve le repère de la lune.
 */
export function aimAtMoon(svg, target) {
  const ctm = svg?.getScreenCTM();
  if (!ctm) return;
  const point = new DOMPoint(target.x, target.y).matrixTransform(ctm.inverse());
  for (const path of svg.querySelectorAll(".moon-path")) path.setAttribute("d", moonPath(point.x, point.y));
  // Repère qui monte jusqu'à la lune (annonce de Farewell)
  const camp = svg.querySelector(".trail-camp.leaving");
  if (camp) {
    const top = ON_MOUNTAIN.at(-1);
    camp.setAttribute("x", point.x + MARKER.dx);
    camp.setAttribute("y", point.y + MARKER.dy);
    camp.parentNode.style.setProperty("--dx", `${top.x - point.x}px`);
    camp.parentNode.style.setProperty("--dy", `${top.y - point.y}px`);
  }
}

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

/**
 * Le sentier et ses repères, en SVG posé sur le dessin de la montagne.
 * from : chapitre d'où l'on vient. Le bout de sentier de from à chapter se
 * trace alors peu à peu et le repère s'y déplace (annonce d'un chapitre).
 */
export function trailSvg(chapter, { from = null } = {}) {
  const start = { x: 150, y: 560 };
  const moving = from !== null && from < chapter;
  const reached = [start, ...ON_MOUNTAIN.slice(0, moving ? from : chapter)];
  const marks = ON_MOUNTAIN.map((c, i) => {
    const state = i + 1 < chapter ? "done" : i + 1 === chapter ? "here" : "ahead";
    // Le nom n'est montré que sur la carte (body.map-open)
    return `<g class="trail-mark ${state}" data-chapter="${i + 1}"><circle cx="${c.x}" cy="${c.y}" r="7" /><text x="${c.x}" y="${c.y + 26}" text-anchor="middle">${i + 1}</text><text class="trail-name" x="${c.x}" y="${c.y + 50}" text-anchor="middle">${c.name}</text></g>`;
  }).join("");
  // Sur la Lune, le repère est sur la lune (menu.js) : pas ici
  const here = chapter ? CHAPTERS[chapter - 1] : start;
  const onMoon = Boolean(here.moon);
  const was = moving && from ? CHAPTERS[from - 1] : start;
  // Nouveau bout : pointillé dévoilé par un masque qui s'allonge. Vers la
  // Lune, c'est la courbe du ciel qui se dévoile.
  const toMoon = moving && onMoon;
  const climbed = [was, ...ON_MOUNTAIN.slice(from, chapter)];
  const fresh = moving
    ? `<mask id="trail-reveal" maskUnits="userSpaceOnUse" x="-400" y="-1200" width="2400" height="1900">${climbed.length > 1 ? `<polyline class="trail-reveal" pathLength="1" points="${points(climbed)}" />` : ""}${toMoon ? `<path class="trail-reveal moon-path" pathLength="1" d="${MOON_PATH}" />` : ""}</mask>
    ${climbed.length > 1 ? `<polyline class="trail-path walked" mask="url(#trail-reveal)" points="${points(climbed)}" />` : ""}
    ${toMoon ? `<path class="trail-path to-moon walked moon-path" mask="url(#trail-reveal)" d="${MOON_PATH}" />` : ""}`
    : "";
  const shift = moving ? ` class="trail-camp-move" style="--dx: ${was.x - here.x}px; --dy: ${was.y - here.y}px"` : "";
  return `<svg class="trail${moving ? " advancing" : ""}" viewBox="0 0 1600 700" aria-hidden="true">
    <polyline class="trail-path" points="${points([start, ...ON_MOUNTAIN])}" />
    <path class="trail-path to-moon moon-path${chapter > ON_MOUNTAIN.length && !(moving && from <= ON_MOUNTAIN.length) ? " walked" : ""}" d="${MOON_PATH}" />
    <polyline class="trail-path walked" points="${points(reached)}" />
    ${fresh}
    ${marks}
    <g${shift}${onMoon && !moving ? ' style="display: none"' : ""}>${markerSvg(here.x, here.y, `trail-camp${onMoon ? " leaving" : ""}`)}</g>
  </svg>`;
}

/**
 * Texte du livre : chapitre en cours et avancée vers le suivant.
 * climb : { chapter, berries, chapters? } ; chapters est la liste du serveur
 * (prologue compris), sinon on prend les seuils d'ici (aperçu par l'adresse).
 */
export function chapterProgress({ chapter, berries, chapters }) {
  const list = chapters ? chapters.slice(1) : CHAPTERS;
  const current = chapter ? `Chapter ${chapter} · ${list[chapter - 1].name}` : "Prologue";
  const next = list[chapter];
  if (!next) return { title: current, text: "Summit reached", ratio: 1 };
  const from = chapter ? list[chapter - 1].berries : 0;
  return { title: current, text: `${berries} / ${next.berries} strawberries to ${next.name}`, ratio: Math.max(0, Math.min(1, (berries - from) / (next.berries - from))) };
}
