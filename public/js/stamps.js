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
// Placés sur les bords du ticket, loin du nom et du compteur de fraises.
export const STAMPS = [
  { id: "strawberry", icon: "illustration/strawberry.png", color: "#c45a50", x: 79, y: 5, size: 15, rotate: 8, ring: true, label: "First Strawberry" },
  { id: "skull", icon: "illustration/skull.png", color: "#e39a2e", x: 66, y: 4, size: 10, rotate: 14, label: "B-Side Survivor" },
  { id: "summit", icon: "illustration/goldflag.png", color: "#5e8f78", x: 36, y: 3, size: 11, rotate: -12, label: "Summit Streak" },
  { id: "winged", icon: "berrywinged.png", color: "#8a6a4f", x: 35, y: 66, size: 13, rotate: -18, label: "Winged Strawberry" },
  { id: "heart", icon: "illustration/love.png", color: "#c26fb4", x: 80, y: 56, size: 14, rotate: 10, ring: true, label: "Crystal Heart" },
  { id: "feather", icon: "illustration/feather.png", color: "#4a74c4", x: 86, y: 34, size: 9, rotate: -24, label: "Seasoned Climber" }
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
