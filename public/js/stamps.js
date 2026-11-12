// Tampons du ticket de fichier, façon tampon postal : un double cercle à
// l'encre d'une couleur, le nom écrit en arc en haut, un mot en arc en bas,
// et au centre un symbole (sprite du jeu teinté à l'encre, ou un texte court).
// Chaque tampon illustre l'achievement de même identifiant, calculé par le
// serveur (src/services/achievements.js, GET /players/me/achievements).
// Pour voir le rendu de tous les tampons : menu.html?stamps=all

// Du plus rare au plus courant (les plus rares prennent les grandes places
// du ticket, voir TICKET_SLOTS). `glyph` : pictogramme au centre (GLYPHS) ;
// `center` : texte au centre à la place. `top` / `bottom` : textes des arcs.
export const STAMPS = [
  { id: "max", top: "MAX%", bottom: "202 BERRIES", center: "MAX", color: "#b07a1e", label: "Max%" },
  { id: "hundred", top: "100%", bottom: "175 BERRIES", center: "100%", color: "#5a7fc4", label: "100%" },
  { id: "golden", top: "GOLDEN", bottom: "B-SIDE", glyph: "golden", color: "#c9952c", label: "Golden Strawberry" },
  { id: "lucky", top: "LUCKY GUESS", bottom: "1ST TRY", glyph: "clover", color: "#8a6a4f", label: "Lucky Guess" },
  { id: "perfect", top: "PERFECTIONIST", bottom: "ALL WON", glyph: "heart", color: "#c26fb4", label: "Perfectionist" },
  { id: "summit", top: "SUMMIT STREAK", bottom: "7 DAYS", glyph: "summit", color: "#5e8f78", label: "Summit Streak" },
  { id: "speedrun", top: "SPEEDRUNNER", bottom: "SUB 5 MIN", glyph: "stopwatch", color: "#3f8f8a", label: "Speedrunner" },
  { id: "assist", top: "ASSIST MODE", bottom: "ALL HINTS", glyph: "bulb", color: "#4a74c4", label: "Assist Mode" },
  { id: "badday", top: "BAD DAY", bottom: "ALL LOST", glyph: "rain", color: "#e0703a", label: "Bad Day" },
  { id: "strawberry", top: "FIRST BERRY", bottom: "1ST WIN", glyph: "strawberry", color: "#c45a50", label: "First Strawberry" }
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

// Pictogrammes dessinés pour les tampons, sur une grille de 24 × 24.
// Fond plein à l'encre ; les détails en blanc (`H`) deviennent des « trous »
// dans l'encre, grâce au mode de fusion multiply du tampon.
const H = "#ffffff";
const berry = `<path d="M12 22C7 19 4 14 4.5 10 5 7.5 8 7 12 7.5 16 7 19 7.5 19.5 10 20 14 17 19 12 22Z"/>
  <path d="M12 7.6 8.6 4.3 11.4 5.1 12 2.4 12.6 5.1 15.4 4.3Z"/>
  <g fill="${H}"><circle cx="9" cy="11" r=".8"/><circle cx="13" cy="10.6" r=".8"/><circle cx="16" cy="12.2" r=".8"/><circle cx="10.6" cy="14.6" r=".8"/><circle cx="14.2" cy="15.2" r=".8"/><circle cx="12" cy="18.2" r=".8"/></g>`;
const sparkle = (x, y, r) =>
  `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28} ${x + r} ${y} ${x + r * 0.28} ${y + r * 0.28} ${x} ${y + r} ${x - r * 0.28} ${y + r * 0.28} ${x - r} ${y} ${x - r * 0.28} ${y - r * 0.28}Z"/>`;
const GLYPHS = {
  strawberry: berry,
  golden: `<g transform="translate(2.4 2.6) scale(.82)">${berry}</g>${sparkle(20, 4.5, 3)}${sparkle(4, 6, 2.2)}${sparkle(20.5, 17.5, 1.8)}`,
  clover: `<circle cx="12" cy="7.4" r="3.7"/><circle cx="16.6" cy="12" r="3.7"/><circle cx="12" cy="16.6" r="3.7"/><circle cx="7.4" cy="12" r="3.7"/>
    <path d="M12 12Q14.5 18 18.5 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 7.5V16.5M7.5 12H16.5" stroke="${H}" stroke-width=".9"/>`,
  bulb: `<path d="M12 2.5C8 2.5 5.3 5.6 5.3 9.2 5.3 11.9 6.9 13.6 8.4 15.1V17.3H15.6V15.1C17.1 13.6 18.7 11.9 18.7 9.2 18.7 5.6 16 2.5 12 2.5Z"/>
    <rect x="8.4" y="18.4" width="7.2" height="1.7" rx=".85"/><rect x="9.6" y="20.8" width="4.8" height="1.6" rx=".8"/>
    <path d="M9.6 12.6 12 9.6 14.4 12.6M12 9.6V16.6" fill="none" stroke="${H}" stroke-width="1.2" stroke-linejoin="round"/>`,
  stopwatch: `<circle cx="12" cy="13.6" r="8.2"/><rect x="10" y="2" width="4" height="2.6" rx=".6"/><rect x="11.2" y="4" width="1.6" height="2"/>
    <rect x="17.6" y="5.4" width="2.6" height="1.8" rx=".5" transform="rotate(40 18.9 6.3)"/>
    <path d="M12 13.6V8.4M12 13.6 15.4 15.6" fill="none" stroke="${H}" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="13.6" r="1.1" fill="${H}"/>`,
  heart: `<path d="M12 21.2C6 16.6 2.4 13 2.4 8.8 2.4 5.8 4.8 3.4 7.7 3.4 9.6 3.4 11.1 4.5 12 6.1 12.9 4.5 14.4 3.4 16.3 3.4 19.2 3.4 21.6 5.8 21.6 8.8 21.6 13 18 16.6 12 21.2Z"/>
    <path d="M7.7 3.4 10 9 12 6.1 14 9 16.3 3.4M2.6 8.9H21.4M10 9 12 21M14 9 12 21" fill="none" stroke="${H}" stroke-width=".9" stroke-linejoin="round"/>`,
  rain: `<path d="M7 14.2C4.3 14.2 2.8 12.4 2.8 10.4 2.8 8.4 4.5 6.8 6.6 6.9 7.3 4.6 9.4 3 11.9 3 15 3 17.3 5.2 17.5 8.1 19.5 8.2 21.2 9.7 21.2 11.6 21.2 13.1 20 14.2 18.2 14.2Z"/>
    <path d="M8.2 17.2 7 20.6M12.4 17.2 11.2 21.8M16.6 17.2 15.4 20.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  summit: `<path d="M1.8 21.5 9.4 9.2 12.8 14.2 15.6 10.8 22.2 21.5Z"/>
    <path d="M9.4 9.4V2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M9.4 2.2 15.6 4.1 9.4 6Z"/>
    <path d="M7.3 12.6 9.4 9.2 11 11.6" fill="none" stroke="${H}" stroke-width="1" stroke-linejoin="round"/>`
};

// Symbole du centre : pictogramme ou texte court. `box` : carré occupé dans
// le dessin 100 × 100.
function centerSymbol(stamp, box) {
  const c = stamp.color;
  if (stamp.center) {
    const size = (box * (stamp.center.length > 3 ? 0.4 : 0.5)).toFixed(1);
    return `<text x="50" y="50" dy=".35em" text-anchor="middle" font-size="${size}" font-weight="700" fill="${c}">${escape(stamp.center)}</text>`;
  }
  const at = (100 - box) / 2;
  return `<g transform="translate(${at} ${at}) scale(${box / 24})" fill="${c}" color="${c}">${GLYPHS[stamp.glyph] ?? ""}</g>`;
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
    ${centerSymbol(stamp, 58)}
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
    ${centerSymbol(stamp, 32)}
  </svg>`;
}
