const API_BASE_URL = "https://celestedle-api.mizkyosia.fr";

export const ApiService = {
  fetchSecretVersion() {
    return fetch(`${API_BASE_URL}/secret-version`).then((res) => res.json());
  },

  fetchElements() {
    return fetch(`${API_BASE_URL}/elements`).then((res) => res.json());
  },

  validateGuess(choice) {
    return fetch(`${API_BASE_URL}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choix: choice }),
    }).then((res) => {
      if (!res.ok) throw new Error("Invalid entities or server error");
      return res.json();
    });
  },

  forfeitGame() {
    return fetch(`${API_BASE_URL}/getSecretWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then((res) => {
      if (!res.ok) throw new Error("Server error during forfeit");
      return res.json();
    });
  },

  verifyAdminKey(password) {
    return fetch(`${API_BASE_URL}/admin/verify-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: password }),
    }).then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    });
  },

  getSecretWordAdmin() {
    return fetch(`${API_BASE_URL}/getSecretWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then((res) => res.json());
  },

  triggerRandomSecret(password, newHash) {
    return fetch(`${API_BASE_URL}/admin/random-hash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: password, newHash: newHash }),
    }).then((res) => res.json());
  },
};
