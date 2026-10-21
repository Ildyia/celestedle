import { storage, KEYS } from "./storage.js";

const hostname = window.location.hostname;

// En local, le site est servi par l'API elle-même. Sur Vercel, le front
// appelle l'API de prod, ou celle de la bêta (Render) pour les déploiements bêta.
export const API_BASE_URL =
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    ? window.location.origin
    : hostname.includes("beta") || hostname.includes("-projects.vercel.app")
      ? "https://celestedle-api.onrender.com"
      : "https://celestedle-api.mizkyosia.fr";

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Appelé quand l'API ne répond pas du tout (réseau, serveur arrêté)
let onUnavailable = () => {};
export function setUnavailableHandler(handler) {
  onUnavailable = handler;
}

export function spriteUrl(name) {
  return `${API_BASE_URL}/sprite/${encodeURIComponent(name)}`;
}

async function request(method, path, { body, auth = true, headers = {} } = {}) {
  const token = storage.get(KEYS.playerToken);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && token ? { "X-Player-Token": token } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    onUnavailable();
    throw new ApiError(0, "The server can't be reached right now.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status >= 502) onUnavailable();
    throw new ApiError(res.status, data?.error || `Server error (${res.status})`, data?.details);
  }
  return data;
}

export const api = {
  version: () => request("GET", "/version", { auth: false }),

  game: (mode) => request("GET", `/game?mode=${mode}`),
  guess: (mode, guess) => request("POST", "/game/guess", { body: { mode, guess } }),
  hint: (mode, type) => request("POST", "/game/hint", { body: { mode, type } }),
  forfeit: (mode) => request("POST", "/game/forfeit", { body: { mode } }),
  communityStats: (mode) => request("GET", `/stats/today?mode=${mode}`, { auth: false }),

  elements: () => request("GET", "/elements", { auth: false }),
  aliases: () => request("GET", "/aliases", { auth: false }),

  createPlayer: () => request("POST", "/players", { auth: false }),
  me: (token) =>
    request("GET", "/players/me", token ? { auth: false, headers: { "X-Player-Token": token } } : {}),
  updateMe: (changes) => request("PATCH", "/players/me", { body: changes }),
  myStats: (mode) => request("GET", `/players/me/stats?mode=${mode}`),
  profileOptions: () => request("GET", "/players/options", { auth: false }),

  leaderboard: (period, mode) => request("GET", `/leaderboard?period=${period}&mode=${mode}`),

  reports: () => request("GET", "/reports"),
  similarReports: (elementName, description) =>
    request("POST", "/reports/similar", { body: { elementName, description } }),
  sendReport: (report) => request("POST", "/reports", { body: report }),
  voteReport: (id, isUp) => request("POST", `/reports/${encodeURIComponent(id)}/vote`, { body: { isUp } })
};
