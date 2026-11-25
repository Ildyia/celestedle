import { API_BASE_URL } from "../api.js";
import { storage, KEYS } from "../storage.js";

// L'admin utilise le même profil que le jeu : le jeton du joueur, dont le
// rôle (propriétaire ou administrateur) donne les droits
let onAccessLost = () => {};

export function setAccessLostHandler(handler) {
  onAccessLost = handler;
}

async function request(method, path, body, token = storage.get(KEYS.playerToken)) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Player-Token": token } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  if ((res.status === 401 || res.status === 403) && path !== "/admin/me" && path !== "/admin/claim-owner") {
    onAccessLost();
  }
  if (!res.ok) {
    // debug : message de l'erreur serveur, envoyé à l'équipe admin seulement
    const error = new Error(data?.debug ? `${data.error} (${data.debug})` : data?.error || `HTTP error ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Image brute (pas de JSON) : le type du fichier sert de Content-Type
async function upload(path, file) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream", "X-Player-Token": storage.get(KEYS.playerToken) ?? "" },
    body: file
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP error ${res.status}`);
  return data;
}

export const admin = {
  me: (token) => request("GET", "/admin/me", undefined, token),
  claimOwner: (password) => request("POST", "/admin/claim-owner", { password }),
  overview: () => request("GET", "/admin/overview"),
  history: () => request("GET", "/admin/history"),
  words: () => request("GET", "/admin/words"),
  mail: () => request("GET", "/admin/mail"),
  sendMail: (letter) => request("POST", "/admin/mail", letter),
  editMail: (id, letter) => request("PUT", `/admin/mail/${id}`, letter),
  deleteMail: (id) => request("DELETE", `/admin/mail/${id}`),
  closePoll: (id) => request("POST", `/admin/mail/${id}/close`),
  progression: (days) => request("GET", `/admin/progression${days ? `?days=${days}` : ""}`),
  insights: (days) => request("GET", `/admin/insights${days ? `?days=${days}` : ""}`),
  setSecret: (mode, action, elementName) => request("POST", "/admin/secret", { mode, action, elementName }),
  elements: () => request("GET", "/admin/elements"),
  elementInsights: (id, days) => request("GET", `/admin/elements/${id}/insights${days ? `?days=${days}` : ""}`),
  createElement: (element) => request("POST", "/admin/elements", element),
  updateElement: (id, changes) => request("PATCH", `/admin/elements/${id}`, changes),
  uploadSprite: (id, file) => upload(`/admin/elements/${id}/sprite`, file),
  exportDbJson: () => request("GET", "/admin/export/db.json"),
  connectionTags: () => request("GET", "/admin/connections/tags"),
  connectionTagDiagnostics: () => request("GET", "/admin/connections/tags/diagnostics"),
  createConnectionTag: (tag) => request("POST", "/admin/connections/tags", tag),
  updateConnectionTag: (id, tag) => request("PUT", `/admin/connections/tags/${id}`, tag),
  deleteConnectionTag: (id) => request("DELETE", `/admin/connections/tags/${id}`),
  connectionsAccess: () => request("GET", "/connections-access"),
  setConnectionsAccess: (access) => request("PUT", "/admin/connections/access", { access }),
  setCsideAccess: (access) => request("PUT", "/admin/connections/cside-access", { access }),
  connectionSuggestions: () => request("GET", "/admin/connections/suggestions"),
  // added : nom du tag créé à partir de la suggestion (son auteur reçoit une lettre)
  deleteConnectionSuggestion: (id, added) =>
    request("DELETE", `/admin/connections/suggestions/${id}${added ? `?added=${encodeURIComponent(added)}` : ""}`),
  replyToSuggestion: (id, letter) => request("POST", `/admin/connections/suggestions/${id}/reply`, letter),
  connectionPuzzles: () => request("GET", "/admin/connections/puzzles"),
  regenerateConnectionPuzzle: (date, mode) => request("POST", `/admin/connections/puzzles/${date}/regenerate`, { mode }),
  reports: () => request("GET", "/admin/reports"),
  replyToReport: (id, letter) => request("POST", `/admin/reports/${encodeURIComponent(id)}/reply`, letter),
  setReportStatus: (id, status) => request("PATCH", `/admin/reports/${encodeURIComponent(id)}`, { status }),
  deleteReport: (id) => request("DELETE", `/admin/reports/${encodeURIComponent(id)}`),
  purgeClosedReports: () => request("POST", "/admin/reports/purge-closed"),
  settings: () => request("GET", "/admin/settings"),
  saveSettings: (settings) => request("PUT", "/admin/settings", settings),
  team: () => request("GET", "/admin/team"),
  grantAdmin: (playerId) => request("POST", "/admin/team", { playerId }),
  revokeAdmin: (playerId) => request("DELETE", `/admin/team/${encodeURIComponent(playerId)}`),
  audit: () => request("GET", "/admin/audit"),
  playerCounts: () => request("GET", "/admin/players/counts"),
  searchPlayers: (q, all = false) => request("GET", `/admin/players?q=${encodeURIComponent(q)}${all ? "&all=1" : ""}`),
  deletePlayer: (id) => request("DELETE", `/admin/players/${encodeURIComponent(id)}`),
  setPlaytester: (id, enabled) => request("PUT", `/admin/players/${encodeURIComponent(id)}/playtester`, { enabled })
};
