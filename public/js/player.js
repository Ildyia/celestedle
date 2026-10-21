import { api, ApiError } from "./api.js";
import { storage, KEYS } from "./storage.js";

// Profil du joueur courant. Le jeton est créé au premier besoin (premier
// essai, indice, vote…) et gardé dans le navigateur.
let current = null;
let pending = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener(current));
}

export const player = {
  get profile() {
    return current;
  },

  get token() {
    return storage.get(KEYS.playerToken);
  },

  onChange(listener) {
    listeners.add(listener);
  },

  // Charge le profil si un jeton existe déjà, sans en créer
  async load() {
    if (!this.token) return null;
    try {
      current = (await api.me()).player;
    } catch (err) {
      // Jeton inconnu du serveur (base de la bêta remise à zéro…) : on l'oublie
      if (err instanceof ApiError && err.status === 401) storage.remove(KEYS.playerToken);
      current = null;
    }
    emit();
    return current;
  },

  async ensure() {
    if (current) return current;
    if (this.token && (await this.load())) return current;
    pending ??= api
      .createPlayer()
      .then(({ player: created, token }) => {
        storage.set(KEYS.playerToken, token);
        current = created;
        emit();
        return current;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  },

  async update(changes) {
    current = (await api.updateMe(changes)).player;
    emit();
    return current;
  },

  // Code de récupération collé depuis un autre appareil
  async restore(token) {
    const trimmed = String(token || "").trim();
    const restored = (await api.me(trimmed)).player;
    storage.set(KEYS.playerToken, trimmed);
    current = restored;
    emit();
    return current;
  }
};
