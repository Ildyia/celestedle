import { api } from "../api.js";
import { byId } from "../dom.js";
import { admin, session, setSessionExpiredHandler } from "./client.js";
import { renderOverview } from "./overview.js";
import { renderHistory } from "./history.js";
import { WordsTab } from "./words.js";
import { ElementsTab } from "./elements.js";
import { ReportsTab } from "./reports.js";
import { bindSettings } from "./settings.js";

const message = byId("admin-message");

// Message d'état en haut du tableau de bord
export function notify(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (message.textContent = ""), 5000);
}

const words = new WordsTab();
const elements = new ElementsTab({ notify });
const reports = new ReportsTab({ notify });

const loadSettings = bindSettings({ notify });

const TABS = {
  overview: () => renderOverview({ notify }),
  history: () => renderHistory(),
  words: () => words.load(),
  elements: () => elements.load(),
  reports: () => reports.load(),
  settings: () => loadSettings()
};

let currentTab = "overview";

async function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.setAttribute("aria-selected", String(btn.dataset.tab === tab))
  );
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tab}`;
  });
  try {
    await TABS[tab]();
  } catch (err) {
    notify(err.message, true);
  }
}

function showDashboard(loggedIn) {
  byId("admin-login-block").hidden = loggedIn;
  byId("admin-dashboard").hidden = !loggedIn;
  if (loggedIn) showTab(currentTab);
}

async function init() {
  setSessionExpiredHandler(() => {
    showDashboard(false);
    byId("admin-login-error").textContent = "Session expirée, reconnecte-toi.";
  });

  byId("admin-login-block").addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = byId("admin-login-error");
    try {
      const { token } = await admin.login(byId("admin-password-input").value);
      session.token = token;
      byId("admin-password-input").value = "";
      error.textContent = "";
      showDashboard(true);
    } catch (err) {
      error.textContent = err.message;
    }
  });

  byId("admin-logout-btn").addEventListener("click", () => {
    session.token = null;
    showDashboard(false);
  });

  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab))
  );

  api.version().then(({ version }) => (byId("admin-version").textContent = `v${version}`)).catch(() => {});

  // Vérifie que la session enregistrée est encore valable (B28)
  if (session.token) {
    try {
      await admin.session();
      showDashboard(true);
      return;
    } catch {
      session.token = null;
    }
  }
  showDashboard(false);
}

init();
