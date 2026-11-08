import { api, spriteUrl, API_BASE_URL } from "./api.js";
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

export const TECHS = {
  id: "techs",
  title: "Celestedle Techs",
  noun: "tech",
  modes: { normal: "tech", hard: "tech-hard" },
  categories: ["category", "difficulty", "utility", "dash_required", "hardcoded"],
  labels: {
    category: "Category",
    difficulty: "Difficulty",
    utility: "Utility",
    dash_required: "Dash",
    hardcoded: "Origin"
  },
  multiValued: [],
  // Image ou GIF envoyé depuis l'admin (une image par défaut sinon)
  imageUrl: (name) => `${API_BASE_URL}/tech-media/${encodeURIComponent(name)}`,
  hintNames: { info: "Tech Info" },
  siteUrl: "https://celestedle.vercel.app/techs.html",
  api: {
    game: api.techsGame,
    guess: api.techsGuess,
    hint: api.techsHint,
    forfeit: api.techsForfeit
  }
};

// Mode du jeu ↔ « normal » / « hard »
export function modeKind(catalog, mode) {
  return mode === catalog.modes.hard ? "hard" : "normal";
}
