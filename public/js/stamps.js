// Tampons du ticket de fichier, comme dans le jeu. Chaque tampon est un
// calque de la taille du ticket (800 × 300), déjà placé dans l'image :
// il suffit de les empiler par-dessus le ticket.
// Images : assets/game/fileselect/stamps/ (atlas FileSelect de Celeste).
//
// Aucun tampon n'est gagné pour l'instant : le futur système d'achievements
// n'aura qu'à remplir earnedStamps(). Pour voir le rendu : menu.html?stamps=all
export const STAMPS = [
  { id: "strawberry", image: "strawberry.png", label: "Strawberry stamp" },
  { id: "heart", image: "heart.png", label: "Crystal heart stamp" },
  { id: "goldheart", image: "goldheart.png", label: "Golden heart stamp" },
  { id: "flag", image: "flag.png", label: "Summit flag stamp" },
  { id: "farewell", image: "farewell.png", label: "Farewell stamp" },
  { id: "cassettes", image: "cassettes.png", label: "Cassette stamp" },
  { id: "goldberry", image: "goldberry.png", label: "Golden strawberry stamp" }
];

const PREVIEW_ALL = new URLSearchParams(location.search).get("stamps") === "all";

/** Tampons gagnés par ce profil (identifiants de STAMPS). */
export function earnedStamps(/* profile */) {
  if (PREVIEW_ALL) return STAMPS.map((s) => s.id);
  // À brancher sur les achievements
  return [];
}

export function stampUrl(stamp) {
  return `assets/game/fileselect/stamps/${stamp.image}`;
}
