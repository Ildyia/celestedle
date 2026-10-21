// Accès au localStorage, qui peut être indisponible (navigation privée…).
// La partie elle-même est gardée par le serveur : on ne stocke ici que le
// jeton du joueur et ses préférences.
export const KEYS = {
  playerToken: "celestedle_player_token",
  mode: "celestedle_mode",
  synonyms: "celestedle_synonyms",
  disclaimerSeen: "celestedle_disclaimer_seen_v3",
  colorblind: "celestedle_colorblind",
  customCursor: "celestedle_custom_cursor",
  celesteTheme: "celestedle_celeste_theme",
  showTimer: "celestedle_show_timer"
};

// Clés de la v1, supprimées au premier chargement de la 2.0
const LEGACY_KEYS = [
  "celestedle_date",
  "celestedle_tries",
  "celestedle_gameover",
  "celestedle_status",
  "celestedle_history",
  "celestedle_version",
  "celestedle_solution",
  "celestedle_solution_attributes",
  "celestedle_saved_hints",
  "celestedle_used_hint_types",
  "celestedle_elapsed_time",
  "celestedle_disclaimer_seen_v2",
  "celestedle_admin_token",
  "userId"
];

export const storage = {
  get(key, fallback = null) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Préférence non conservée : sans conséquence pour la partie
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignoré
    }
  },

  getJson(key, fallback) {
    try {
      return JSON.parse(this.get(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },

  setJson(key, value) {
    this.set(key, JSON.stringify(value));
  },

  getBool(key, fallback) {
    const value = this.get(key);
    return value === null ? fallback : value === "true";
  },

  clearLegacy() {
    LEGACY_KEYS.forEach((key) => this.remove(key));
  }
};
