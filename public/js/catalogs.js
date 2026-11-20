import { api, spriteUrl } from "./api.js";
import { CATEGORY_LABELS } from "./format.js";

// Ce qui change d'un jeu « à la Celestedle » à l'autre : colonnes, images,
// routes de l'API, textes. Le reste (tableau, indices, partage) est commun.

export const CELESTEDLE = {
  id: "celestedle",
  title: "Celestedle",
  noun: "element",
  // Modes du jeu, rangés sous « normal » / « hard » (le choix est partagé
  // entre les jeux)
  modes: { normal: "normal", hard: "hard" },
  categories: ["type", "lieu", "couleur", "shape"],
  labels: CATEGORY_LABELS,
  // Catégories à plusieurs valeurs (« includes » au lieu de « is »)
  multiValued: ["lieu", "couleur"],
  imageUrl: (name) => spriteUrl(name),
  hintNames: { info: "Element Info" },
  siteUrl: "https://celestedle.vercel.app/",
  api: {
    game: api.game,
    guess: api.guess,
    hint: api.hint,
    forfeit: api.forfeit
  }
};

// Mode du jeu ↔ « normal » / « hard »
export function modeKind(catalog, mode) {
  return mode === catalog.modes.hard ? "hard" : "normal";
}
