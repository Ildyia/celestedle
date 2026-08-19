const hostname = window.location.hostname;

export const API_BASE_URL =
  hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ?
    "http://localhost:5500" :
    hostname.includes("beta") ||
      hostname.includes("-projects.vercel.app")
      ? "https://celestedle-api.onrender.com"
      : "https://celestedle-api.mizkyosia.fr";

export const ApiService = {
  fetchSecretVersion() {
    return fetch(`${API_BASE_URL}/secret-version`).then((res) => res.json());
  },

  adminLogin(password) {
    return fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    })
      .then((res) => {
        if (!res.ok) throw new Error("Incorrect credentials");
        return res.json();
      })
      .then((data) => {
        if (data.token) {
          sessionStorage.setItem("admin_token", data.token);
        }
        return data;
      });
  },

  checkAdminSession() {
    const token = sessionStorage.getItem("admin_token");
    if (!token) return Promise.resolve(false);

    return fetch(`${API_BASE_URL}/admin/session`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => res.ok);
  },

  getSecretWordAdmin() {
    const token = sessionStorage.getItem("admin_token");
    return fetch(`${API_BASE_URL}/admin/get-secret`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => res.json());
  },

  triggerRandomSecret(newHash) {
    const token = sessionStorage.getItem("admin_token");
    return fetch(`${API_BASE_URL}/admin/random-hash`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ newHash })
    }).then((res) => res.json());
  },

  triggerAdminReset() {
    const token = sessionStorage.getItem("admin_token");
    return fetch(`${API_BASE_URL}/admin/trigger-reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => {
      if (!res.ok) throw new Error("Access denied or server error");
      return res.json();
    });
  },

  fetchElements() {
    return fetch(`${API_BASE_URL}/elements`).then((res) => res.json());
  },

  fetchElementsFull() {
    return fetch(`${API_BASE_URL}/elements/full`).then((res) => res.json());
  },

  fetchElementData(elementId) {
    return fetch(`${API_BASE_URL}/element/${elementId}`).then((res) => res.json());
  },

  fetchDailySuccessCount() {
    return fetch(`${API_BASE_URL}/daily-stats`).then((res) => {
      if (!res.ok) throw new Error("Failed to fetch daily stats");
      return res.json();
    });
  },

  fetchHint(payload) {
    return fetch(`${API_BASE_URL}/hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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

  sendBugReport(reportData) {
    return fetch(`${API_BASE_URL}/report-bug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportData)
    }).then((res) => {
      if (!res.ok) throw new Error("Erreur réseau");
      return res.json();
    });
  },

  setSecretWordAdmin(elementName) {
    const token = sessionStorage.getItem("admin_token");
    return fetch(`${API_BASE_URL}/admin/set-secret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ elementName })
    }).then((res) => {
      if (!res.ok) throw new Error("Élément introuvable ou erreur");
      return res.json();
    });
  },

  fetchAdminElementsList() {
    const token = sessionStorage.getItem("admin_token");
    return fetch(`${API_BASE_URL}/admin/elements-list`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((res) => res.json());
  }
};
