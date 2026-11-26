import { api } from "../api.js";
import { el, byId } from "../dom.js";
import { storage, KEYS } from "../storage.js";
import { admin, setAccessLostHandler } from "./client.js";
import { renderOverview } from "./overview.js";
import { renderHistory } from "./history.js";
import { WordsTab } from "./words.js";
import { InsightsTab } from "./insights.js";
import { ProgressionTab } from "./progression.js";
import { MessagesTab } from "./messages.js";
import { enableTableSort } from "./table-sort.js";
import { ElementsTab } from "./elements.js";
import { ReportsTab } from "./reports.js";
import { ConnectionsTab } from "./connections.js";
import { TeamTab } from "./team.js";
import { PlayersTab } from "./players.js";
import { MailboxTab } from "./mailbox.js";
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
const insights = new InsightsTab();
const progressionTab = new ProgressionTab();
const elements = new ElementsTab({ notify });
const reports = new ReportsTab({ notify });
const connectionsTab = new ConnectionsTab({ notify });
const team = new TeamTab({ notify });
const playersTab = new PlayersTab({ notify, getRole: () => currentRole });
const loadSettings = bindSettings({ notify });
const mailbox = new MailboxTab({ notify });
const messagesTab = new MessagesTab({ notify });

enableTableSort();

const TABS = {
  overview: () => renderOverview({ notify }),
  history: () => renderHistory(),
  words: () => words.load(),
  insights: () => insights.load(),
  progression: () => progressionTab.load(),
  elements: () => elements.load(),
  reports: () => reports.load(),
  connections: () => connectionsTab.load(),
  settings: () => loadSettings(),
  team: () => team.load(),
  players: () => playersTab.load(),
  mailbox: () => mailbox.load(),
  messages: () => messagesTab.load()
};

const ROLE_LABELS = { owner: "Owner", administrator: "Administrator" };

// Navigation : des groupes, chacun avec ses pages (sous-onglets). Une page
// affiche un panneau (#tab-<panel>) ; les pages de Connections en montrent une
// partie (data-cx). L'adresse garde la page ouverte : admin.html#stats/words
const NAV = [
  { id: "today", label: "Today", pages: [{ id: "overview", label: "Today" }] },
  {
    id: "stats",
    label: "Stats",
    pages: [
      // Insights en trois pages d'un même panneau (data-part), chargé une fois
      { id: "activity", label: "Activity", panel: "insights", part: "activity" },
      { id: "celestedle", label: "Celestedle", panel: "insights", part: "celestedle" },
      { id: "connections", label: "Connections", panel: "insights", part: "connections" },
      { id: "progression", label: "Progression" },
      { id: "history", label: "History" },
      { id: "words", label: "Words" }
    ]
  },
  {
    id: "connections",
    label: "Connections",
    pages: ["grids", "tags", "diagnostics", "access"].map((cx) => ({ id: cx, label: cx[0].toUpperCase() + cx.slice(1), panel: "connections", cx }))
  },
  { id: "elements", label: "Elements", pages: [{ id: "elements", label: "Elements" }] },
  {
    id: "community",
    label: "Community",
    pages: [
      { id: "players", label: "Players" },
      { id: "mailbox", label: "Mailbox" },
      { id: "messages", label: "Messages" },
      { id: "reports", label: "Reports" },
      { id: "team", label: "Team", ownerOnly: true }
    ]
  },
  { id: "settings", label: "Settings", pages: [{ id: "settings", label: "Settings" }] }
];

let current = { group: NAV[0], page: NAV[0].pages[0] };
let loadedPanel = null;
let currentRole = null;

const visiblePages = (group) => group.pages.filter((p) => !p.ownerOnly || currentRole === "owner");

// « stats/words », « stats » (première page du groupe) ; inconnu : Today
function routeFrom(hash) {
  const [groupId, pageId] = hash.replace(/^#/, "").split("/");
  const group = NAV.find((g) => g.id === groupId) ?? NAV[0];
  const pages = visiblePages(group);
  return { group, page: pages.find((p) => p.id === pageId) ?? pages[0] };
}

function tabButton(label, selected, onClick) {
  return el("button", { attrs: { type: "button", role: "tab", "aria-selected": String(selected) }, text: label, on: { click: onClick } });
}

function renderNav() {
  byId("admin-tabs").replaceChildren(
    ...NAV.map((group) => tabButton(group.label, group === current.group, () => go({ group, page: visiblePages(group)[0] })))
  );
  const pages = visiblePages(current.group);
  const sub = byId("admin-subtabs");
  sub.hidden = pages.length < 2;
  sub.replaceChildren(...pages.map((page) => tabButton(page.label, page === current.page, () => go({ group: current.group, page }))));
}

function go(route) {
  const hash = `#${route.group.id}${route.group.pages.length > 1 ? `/${route.page.id}` : ""}`;
  // Nouvelle adresse : hashchange affiche la page (et Retour y revient)
  if (location.hash !== hash) location.hash = hash;
  else show(route);
}

async function show({ group, page }) {
  current = { group, page };
  renderNav();
  const panel = page.panel ?? page.id;
  document.querySelectorAll(".admin-panel[id^='tab-']").forEach((node) => {
    node.hidden = node.id !== `tab-${panel}`;
  });
  document.querySelectorAll("[data-cx]").forEach((node) => {
    node.hidden = node.dataset.cx !== page.cx;
  });
  document.querySelectorAll("[data-part]").forEach((node) => {
    node.hidden = node.dataset.part !== page.part;
  });
  // Changer de page dans le même panneau (Connections) ne recharge rien
  if (loadedPanel === panel) return;
  loadedPanel = panel;
  try {
    await TABS[panel]();
  } catch (err) {
    loadedPanel = null;
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
  loadedPanel = null;
  show(routeFrom(location.hash));
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

  // Retour / avance du navigateur, lien collé avec une autre page
  window.addEventListener("hashchange", () => {
    if (!byId("admin-dashboard").hidden) show(routeFrom(location.hash));
  });

  api.version().then(({ version }) => (byId("admin-version").textContent = `v${version}`)).catch(() => {});
  checkAccess();
}

init();
