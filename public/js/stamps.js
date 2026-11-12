// Tampons du ticket de fichier, dans le style de ceux du jeu : un dessin à
// l'encre d'une couleur, un peu de travers, posé sur le papier.
// Chaque tampon = une icône (teintée par un masque CSS), une couleur, une
// position et une taille en % du ticket, un angle, et un cercle ou non.
//
// Aucun tampon n'est gagné pour l'instant : le futur système d'achievements
// n'aura qu'à remplir earnedStamps(). Pour voir le rendu : menu.html?stamps=all
const ICONS = "assets";

// x, y : coin haut-gauche en % du ticket ; size : largeur en % du ticket
// (le ticket fait 800 × 300, donc la hauteur du tampon vaut size × 2,67 %).
export const STAMPS = [
  { id: "summit", icon: "illustration/goldflag.png", color: "#5e8f78", x: 39, y: 4, size: 15, rotate: -12, label: "Summit stamp" },
  { id: "heart", icon: "illustration/love.png", color: "#c26fb4", x: 79, y: 4, size: 17, rotate: 10, ring: true, label: "Heart stamp" },
  { id: "feather", icon: "illustration/feather.png", color: "#4a74c4", x: 37, y: 58, size: 14, rotate: -20, label: "Feather stamp" },
  { id: "strawberry", icon: "illustration/strawberry.png", color: "#c45a50", x: 58, y: 46, size: 18, rotate: 8, ring: true, label: "Strawberry stamp" },
  { id: "winged", icon: "berrywinged.png", color: "#8a6a4f", x: 80, y: 56, size: 15, rotate: -24, label: "Winged strawberry stamp" },
  { id: "skull", icon: "illustration/skull.png", color: "#e39a2e", x: 68, y: 26, size: 11, rotate: 14, label: "Skull stamp" }
];

const PREVIEW_ALL = new URLSearchParams(location.search).get("stamps") === "all";

/** Tampons gagnés par ce profil (identifiants de STAMPS). */
export function earnedStamps(/* profile */) {
  if (PREVIEW_ALL) return STAMPS.map((s) => s.id);
  // À brancher sur les achievements
  return [];
}

export function stampIcon(stamp) {
  return `${ICONS}/${stamp.icon}`;
}
