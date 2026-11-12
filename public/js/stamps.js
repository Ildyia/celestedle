// Tampons du ticket de fichier, façon tampon postal : un double cercle à
// l'encre d'une couleur, le nom écrit en arc en haut, un mot en arc en bas,
// et au centre une image du jeu, en couleur.
// Chaque tampon illustre l'achievement de même identifiant, calculé par le
// serveur (src/services/achievements.js, GET /players/me/achievements).
// Pour voir le rendu de tous les tampons : menu.html?stamps=all

// Du plus rare au plus courant (les plus rares prennent les grandes places
// du ticket, voir TICKET_SLOTS). `image` : image du jeu au centre, dans
// assets/stamps/ (graphics dump de Celeste) ; `top` / `bottom` : textes des arcs.
export const STAMPS = [
  { id: "max", top: "MAX%", bottom: "202 BERRIES", image: "max.png", color: "#b07a1e", label: "Max%" },
  { id: "hundred", top: "100%", bottom: "175 BERRIES", image: "hundred.png", color: "#5a7fc4", label: "100%" },
  { id: "golden", top: "GOLDEN", bottom: "B-SIDE", image: "golden.png", color: "#c9952c", label: "Golden Strawberry" },
  { id: "lucky", top: "LUCKY GUESS", bottom: "1ST TRY", image: "lucky.png", color: "#8a6a4f", label: "Lucky Guess" },
  { id: "perfect", top: "PERFECTIONIST", bottom: "ALL WON", image: "perfect.png", color: "#c26fb4", label: "Perfectionist" },
  { id: "summit", top: "SUMMIT STREAK", bottom: "7 DAYS", image: "summit.png", color: "#5e8f78", label: "Summit Streak" },
  { id: "speedrun", top: "SPEEDRUNNER", bottom: "SUB 5 MIN", image: "speedrun.png", color: "#3f8f8a", label: "Speedrunner" },
  { id: "assist", top: "ASSIST MODE", bottom: "ALL HINTS", image: "assist.png", color: "#4a74c4", label: "Assist Mode" },
  { id: "badday", top: "BAD DAY", bottom: "ALL LOST", image: "badday.png", color: "#e0703a", label: "Bad Day" },
  { id: "strawberry", top: "FIRST BERRY", bottom: "1ST WIN", image: "strawberry.png", color: "#c45a50", label: "First Strawberry" }
];

// Emplacements sur le ticket, en % du ticket (800 × 300) : tout autour du
// nom et du compteur de fraises, un par tampon, entièrement sur le papier et
// à l'écart des encoches (la hauteur d'un tampon vaut size × 8/3 % du ticket).
// Le plus rare des tampons gagnés prend le premier. Au survol, un tampon
// montre sa version complète, avec son nom.
export const TICKET_SLOTS = [
  { x: 78, y: 6, size: 14, rotate: 10 },
  { x: 34, y: 60, size: 13, rotate: -14 },
  { x: 80, y: 56, size: 13, rotate: -6 },
  { x: 36, y: 5, size: 11, rotate: -10 },
  { x: 63, y: 4, size: 10, rotate: 16 },
  { x: 48, y: 67, size: 10, rotate: 8 },
  { x: 66, y: 67, size: 10, rotate: 12 },
  { x: 50, y: 4, size: 10, rotate: -4 },
  { x: 70, y: 36, size: 8, rotate: -18 },
  { x: 88, y: 41, size: 7, rotate: 22 }
];

const PREVIEW_ALL = new URLSearchParams(location.search).get("stamps") === "all";

let earned = [];

/** Retient les achievements gagnés (liste renvoyée par le serveur). */
export function setAchievements(list) {
  earned = list.filter((a) => a.earned).map((a) => a.id);
}

/** Tampons gagnés par ce profil, du plus rare au plus courant. */
export function earnedStamps() {
  const ids = PREVIEW_ALL ? STAMPS.map((s) => s.id) : earned;
  return STAMPS.filter((s) => ids.includes(s.id));
}

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let uid = 0;

// Image du centre, en couleur. `box` : carré occupé dans le dessin 100 × 100.
function centerSymbol(stamp, box) {
  const at = (100 - box) / 2;
  return `<image href="assets/stamps/${stamp.image}" x="${at}" y="${at}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet" />`;
}

/**
 * Le dessin d'un tampon, en SVG (100 × 100), à insérer tel quel.
 * full : avec le nom et le détail en arc (journal, survol) ; sinon version
 * compacte pour le ticket, où le texte serait trop petit : cercle et gros symbole.
 */
export function stampSvg(stamp, { full = true } = {}) {
  const id = `stamp-${stamp.id}-${uid++}`;
  const c = stamp.color;
  if (!full) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="46" fill="none" stroke="${c}" stroke-width="5" />
    <circle cx="50" cy="50" r="37" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="4 3" />
    ${centerSymbol(stamp, 60)}
  </svg>`;
  }
  // Arc du haut (gauche → droite) et arc du bas (gauche → droite, par en dessous)
  const top = `M 16 50 A 34 34 0 0 1 84 50`;
  const bottom = `M 19 50 A 31 31 0 0 0 81 50`;
  const long = stamp.top.length > 11;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><path id="${id}-t" d="${top}" /><path id="${id}-b" d="${bottom}" /></defs>
    <circle cx="50" cy="50" r="47" fill="none" stroke="${c}" stroke-width="3.5" />
    <circle cx="50" cy="50" r="27" fill="none" stroke="${c}" stroke-width="1.6" stroke-dasharray="3 2.4" />
    <text font-size="${long ? 9.5 : 11}" font-weight="700" letter-spacing="${long ? 0.3 : 1}" fill="${c}" text-anchor="middle">
      <textPath href="#${id}-t" startOffset="50%">${escape(stamp.top)}</textPath>
    </text>
    <text font-size="7.5" font-weight="700" letter-spacing="1" fill="${c}" text-anchor="middle" dominant-baseline="hanging">
      <textPath href="#${id}-b" startOffset="50%">${escape(stamp.bottom)}</textPath>
    </text>
    <text x="13" y="53" font-size="8" fill="${c}" text-anchor="middle">★</text>
    <text x="87" y="53" font-size="8" fill="${c}" text-anchor="middle">★</text>
    ${centerSymbol(stamp, 36)}
  </svg>`;
}
