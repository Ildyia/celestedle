const API_BASE_URL = [
  "localhost",
  "127.0.0.1",
  "https://celestedle-beta.vercel.app",
  "::1"
].includes(window.location.hostname)
  ? "https://celestedle-api.onrender.com"
  : "https://celestedle-api.mizkyosia.fr";

export const ApiService = {
  fetchSecretVersion() {
    return fetch(`${API_BASE_URL}/secret-version`).then((res) => res.json());
  },
  adminLogin(password) {
    return fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    }).then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    });
  },

  checkAdminSession() {
    return fetch(`${API_BASE_URL}/admin/session`, {
      credentials: "include"
    }).then((res) => res.ok);
  },

  getSecretWordAdmin() {
    return fetch(`${API_BASE_URL}/getSecretWord`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    }).then((res) => res.json());
  },

  triggerRandomSecret(newHash) {
    return fetch(`${API_BASE_URL}/admin/random-hash`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newHash })
    }).then((res) => res.json());
  },

  triggerAdminReset() {
    return fetch(`${API_BASE_URL}/admin/trigger-reset`, {
      method: "POST",
      credentials: "include"
    }).then((res) => {
      if (!res.ok) throw new Error("Access denied or server error");
      return res.json();
    });
  },

  fetchElements() {
    return fetch(`${API_BASE_URL}/elements`).then((res) => res.json());
  },

  fetchDailySuccessCount() {
    return fetch(`${API_BASE_URL}/daily-stats`).then((res) => {
      if (!res.ok) throw new Error("Failed to fetch daily stats");
      return res.json();
    });
  },

  fetchHint(type) {
    return fetch(`${API_BASE_URL}/hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    }).then((res) => {
      if (!res.ok) throw new Error("Failed to fetch hint");
      return res.json();
    });
  },

  validateGuess(choice, tryCount, hintUses) {
    return fetch(`${API_BASE_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choix: choice, tryCount, hintUses })
    }).then((res) => {
      if (!res.ok) throw new Error("Invalid entities or server error");
      return res.json();
    });
  },

  forfeitGame() {
    return fetch(`${API_BASE_URL}/getSecretWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }).then((res) => {
      if (!res.ok) throw new Error("Server error during forfeit");
      return res.json();
    });
  },

  verifyAdminKey(password) {
    return fetch(`${API_BASE_URL}/admin/verify-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: password })
    }).then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    });
  },

  getSecretWordAdmin() {
    return fetch(`${API_BASE_URL}/getSecretWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }).then((res) => res.json());
  },

  triggerRandomSecret(password, newHash) {
    return fetch(`${API_BASE_URL}/admin/random-hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: password, newHash: newHash })
    }).then((res) => res.json());
  },

  triggerAdminReset(password) {
    return fetch(`${API_BASE_URL}/admin/trigger-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: password })
    }).then((res) => {
      if (!res.ok) throw new Error("Access denied or server error");
      return res.json();
    });
  },

  sendBugReport(reportData) {
    return fetch(`${API_BASE_URL}/report-bug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportData)
    }).then((res) => {
      if (!res.ok) throw new Error("Erreur réseau");
      return res.json();
    });
  }
};
