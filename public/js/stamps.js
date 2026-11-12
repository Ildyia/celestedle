// Tampons du ticket de fichier, dans le style de ceux du jeu : un dessin à
// l'encre d'une couleur, un peu de travers, posé sur le papier.
// Chaque tampon = une icône (teintée par un masque CSS), une couleur, une
// position et une taille en % du ticket, un angle, et un cercle ou non.
//
// Chaque tampon illustre l'achievement de même identifiant, calculé par le
// serveur (src/services/achievements.js, GET /players/me/achievements).
// Pour voir le rendu de tous les tampons : menu.html?stamps=all
const ICONS = "assets";

// x, y : coin haut-gauche en % du ticket ; size : largeur en % du ticket
// (le ticket fait 800 × 300, donc la hauteur du tampon vaut size × 2,67 %).
// Placés sur les bords du ticket, autour du nom et du compteur de fraises ;
// ils peuvent se chevaucher, comme de vrais tampons.
export const STAMPS = [
  { id: "strawberry", icon: "illustration/strawberry.png", color: "#c45a50", x: 79, y: 4, size: 14, rotate: 8, ring: true, label: "First Strawberry" },
  { id: "lucky", icon: "berrywinged.png", color: "#8a6a4f", x: 35, y: 66, size: 12, rotate: -18, label: "Lucky Guess" },
  { id: "golden", icon: "entities/golden-strawberry.png", color: "#c9952c", x: 47, y: 72, size: 9, rotate: 6, label: "Golden Strawberry" },
  { id: "assist", icon: "illustration/assist.png", color: "#4a74c4", x: 88, y: 33, size: 9, rotate: -24, label: "Assist Mode" },
  { id: "speedrun", icon: "illustration/time.png", color: "#3f8f8a", x: 49, y: 3, size: 9, rotate: 12, ring: true, label: "Speedrunner" },
  { id: "perfect", icon: "entities/crystal-heart.png", color: "#c26fb4", x: 80, y: 57, size: 13, rotate: 10, ring: true, label: "Perfectionist" },
  { id: "badday", icon: "illustration/skull.png", color: "#e39a2e", x: 66, y: 3, size: 9, rotate: 14, label: "Bad Day" },
  { id: "summit", icon: "illustration/goldflag.png", color: "#5e8f78", x: 36, y: 3, size: 10, rotate: -12, label: "Summit Streak" },
  { id: "hundred", icon: "entities/moon-berry.png", color: "#5a7fc4", x: 72, y: 74, size: 8, rotate: -8, label: "100%" },
  { id: "max", icon: "entities/golden-winged-strawberry.png", color: "#b07a1e", x: 91, y: 4, size: 8, rotate: 20, label: "Max%" }
];

const PREVIEW_ALL = new URLSearchParams(location.search).get("stamps") === "all";

let earned = [];

/** Retient les achievements gagnés (liste renvoyée par le serveur). */
export function setAchievements(list) {
  earned = list.filter((a) => a.earned).map((a) => a.id);
}

/** Tampons gagnés par ce profil (identifiants de STAMPS). */
export function earnedStamps() {
  if (PREVIEW_ALL) return STAMPS.map((s) => s.id);
  return earned;
}

export function stampIcon(stamp) {
  return `${ICONS}/${stamp.icon}`;
}
