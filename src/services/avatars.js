// Portraits de profil. Chaque personnage garde une image ouverte à tous
// (AVATARS) ; atteindre son chapitre (services/chapters.js) débloque toutes
// ses autres images : expressions des dialogues, sprite en jeu, variantes.
// Images tirées du graphics dump de Celeste : public/assets/avatars/<famille>/
// (identifiant « famille/nom ») ; celles sans « / » sont dans assets/entities.

// Ouverts à tous
const AVATARS = [
  "madeline",
  "badeline",
  "theo",
  "granny-portrait",
  "oshiro-portrait",
  "strawberry",
  "golden-strawberry",
  "winged-strawberry",
  "moon-berry",
  "crystal-heart",
  "feather",
  "refill",
  "seeker",
  "pufferfish",
  "kevin",
  "bird"
];

const list = (family, names) => names.map((n) => `${family}/${n}`);

// base : l'image ouverte à tous (null si le personnage n'en a pas)
const FAMILIES = {
  strawberry: {
    name: "Strawberry",
    base: "strawberry",
    avatars: list("strawberry", ["seed", "ghost", "ghost-winged", "ghost-seed", "ghost-golden", "ghost-moon"])
  },
  badeline: {
    name: "Badeline",
    base: "badeline",
    avatars: list("badeline", ["normal", "angry", "angry-alt", "concerned", "sad", "scoff", "sigh", "upset", "worried", "worried-alt", "yell", "sprite"])
  },
  oshiro: {
    name: "Oshiro",
    base: "oshiro-portrait",
    avatars: [...list("oshiro", ["normal", "lostcontrol", "nervous", "serious", "sidehappy", "sidesuspicious", "sideworried", "worried", "sprite"]), "oshiro-boss"]
  },
  feather: { name: "Feather", base: "feather", avatars: list("feather", ["flash", "big"]) },
  theo: {
    name: "Theo",
    base: "theo",
    avatars: [...list("theo", ["normal", "excited", "nailedit", "serious", "thinking", "worried", "wtf", "sprite"]), "theo-crystal"]
  },
  kevin: { name: "Kevin", base: "kevin", avatars: list("kevin", ["idle", "angry", "left", "right", "up", "down", "hurt", "giant"]) },
  "golden-winged": { name: "Golden winged strawberry", base: null, avatars: ["golden-winged-strawberry", "golden-winged/ghost"] },
  granny: {
    name: "Granny",
    base: "granny-portrait",
    avatars: [...list("granny", ["normal", "creep-b", "laugh", "mock", "sprite", "laughing"]), "flingbird"]
  }
};

module.exports = { AVATARS, FAMILIES };
