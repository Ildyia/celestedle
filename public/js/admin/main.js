import { api } from "../api.js";
import { el, byId } from "../dom.js";
import { storage, KEYS } from "../storage.js";
import { admin, setAccessLostHandler } from "./client.js";
import { renderOverview } from "./overview.js";
import { renderHistory } from "./history.js";
import { WordsTab } from "./words.js";
import { ElementsTab } from "./elements.js";
import { ReportsTab } from "./reports.js";
import { ConnectionsTab } from "./connections.js";
import { TechsTab } from "./techs.js";
import { TeamTab } from "./team.js";
import { PlayersTab } from "./players.js";
import { bindSettings } from "./settings.js";

const message = byId("admin-message");

// Message d'état en haut du tableau de bord ; après une modification réussie,
// le compteur de modifications du jour est mis à jour
export function notify(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (message.textContent = ""), 5000);
  if (!isError) refreshIdentity();
}

const words = new WordsTab();
const elements = new ElementsTab({ notify });
const reports = new ReportsTab({ notify });
const connectionsTab = new ConnectionsTab({ notify });
const techsTab = new TechsTab({ notify });
const team = new TeamTab({ notify });
const playersTab = new PlayersTab({ notify, getRole: () => currentRole });
const loadSettings = bindSettings({ notify });

const TABS = {
  overview: () => renderOverview({ notify }),
  history: () => renderHistory(),
  words: () => words.load(),
  elements: () => elements.load(),
  reports: () => reports.load(),
  connections: () => connectionsTab.load(),
  techs: () => techsTab.load(),
  settings: () => loadSettings(),
  team: () => team.load(),
  players: () => playersTab.load()
};

const ROLE_LABELS = { owner: "Owner", administrator: "Administrator" };

let currentTab = "overview";
let currentRole = null;

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

function renderIdentity({ player, role, quota }) {
  currentRole = role;
  const remaining =
    quota.limit === null
      ? "unlimited changes"
      : `${quota.remaining} / ${quota.limit} change(s) left today`;
  byId("admin-identity").replaceChildren(
    el("strong", { text: player.name }),
    el("span", { className: `badge ${role}`, text: ROLE_LABELS[role] }),
    el("span", { className: "small-subtext", text: remaining })
  );
  document.querySelectorAll("[data-owner-only]").forEach((node) => {
    node.hidden = role !== "owner";
  });
}

async function refreshIdentity() {
  try {
    const me = await admin.me();
    if (me.quota) renderIdentity(me);
  } catch {
    // affichage seulement
  }
}

// Écran d'accès : pas de profil, profil sans droits, ou propriétaire à désigner
function showAccess(status, { canClaim = false, error = "" } = {}) {
  byId("admin-dashboard").hidden = true;
  byId("admin-access").hidden = false;
  byId("admin-access-status").textContent = status;
  byId("admin-claim-form").hidden = !canClaim;
  byId("admin-access-error").textContent = error;
}

async function checkAccess() {
  if (!storage.get(KEYS.playerToken)) {
    showAccess("Sign in with your player profile: paste your recovery code below.");
    return;
  }
  let me;
  try {
    me = await admin.me();
  } catch {
    showAccess("This recovery code doesn't match any profile. Paste another code.");
    return;
  }
  if (!me.quota) {
    showAccess(
      `The profile "${me.player.name}" (ID ${me.player.id}) has no admin rights. ` +
        "Ask the owner to make you an administrator, or use another profile.",
      { canClaim: me.ownerClaimable }
    );
    return;
  }
  renderIdentity(me);
  byId("admin-access").hidden = true;
  byId("admin-dashboard").hidden = false;
  if (currentTab === "team" && me.role !== "owner") currentTab = "overview";
  showTab(currentTab);
}

function init() {
  setAccessLostHandler(() => checkAccess());

  byId("admin-profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = byId("admin-code-input").value.trim();
    try {
      await admin.me(code);
      storage.set(KEYS.playerToken, code);
      byId("admin-code-input").value = "";
      await checkAccess();
    } catch {
      byId("admin-access-error").textContent = "This code doesn't match any profile.";
    }
  });

  byId("admin-claim-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await admin.claimOwner(byId("admin-claim-input").value);
      byId("admin-claim-input").value = "";
      await checkAccess();
    } catch (err) {
      byId("admin-access-error").textContent = err.message;
    }
  });

  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab))
  );

  api.version().then(({ version }) => (byId("admin-version").textContent = `v${version}`)).catch(() => {});
  checkAccess();
}

init();
