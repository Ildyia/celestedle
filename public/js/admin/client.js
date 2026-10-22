import { API_BASE_URL } from "../api.js";

const TOKEN_KEY = "celestedle_admin_token";

let onSessionExpired = () => {};

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

export const session = {
  get token() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // session non conservée : il faudra se reconnecter au rechargement
    }
  }
};

async function request(method, path, body) {
  const res = await fetch(`${API_BASE_URL}/api/admin${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== "/login") {
    session.token = null;
    onSessionExpired();
  }
  if (!res.ok) throw new Error(data?.error || `Erreur HTTP ${res.status}`);
  return data;
}

export const admin = {
  login: (password) => request("POST", "/login", { password }),
  session: () => request("GET", "/session"),
  overview: () => request("GET", "/overview"),
  history: () => request("GET", "/history"),
  words: () => request("GET", "/words"),
  setSecret: (mode, action, elementName) => request("POST", "/secret", { mode, action, elementName }),
  elements: () => request("GET", "/elements"),
  createElement: (element) => request("POST", "/elements", element),
  updateElement: (id, changes) => request("PATCH", `/elements/${id}`, changes),
  exportDbJson: () => request("GET", "/export/db.json"),
  reports: () => request("GET", "/reports"),
  setReportStatus: (id, status) => request("PATCH", `/reports/${encodeURIComponent(id)}`, { status }),
  settings: () => request("GET", "/settings"),
  saveSettings: (settings) => request("PUT", "/settings", settings)
};
