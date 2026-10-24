import { api, setUnavailableHandler } from "./api.js";
import { byId, bindModalClosing, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { storage, KEYS } from "./storage.js";
import { player } from "./player.js";
import { initOptions } from "./options.js";
import { initNextWordTimer } from "./timer.js";
import { Synonyms, bindSynonymsModal } from "./synonyms.js";
import { Suggestions } from "./suggestions.js";
import { Game } from "./game.js";
import { ReportsPanel } from "./reports.js";
import { ProfilePanel } from "./profile.js";
import { LeaderboardPanel } from "./leaderboard.js";
import { fillRulesText } from "./rules-text.js";

let elements = [];
const getElements = () => elements;

async function refreshCommunityStats(mode) {
  try {
    const stats = await api.communityStats(mode);
    byId("stats-mode-label").textContent = mode === "hard" ? "(Hard)" : "";
    byId("success-count").textContent = stats.wins ?? 0;
    byId("avg-tries-count").textContent = formatNumber(stats.avgTries);
    byId("avg-hints-count").textContent = stats.wins ? Number(stats.avgHints ?? 0).toFixed(1) : "-";
    // Hard : pas (ou très peu) d'indices, le taux de victoire est plus parlant
    byId("avg-hints-row").hidden = mode === "hard";
    byId("win-rate-row").hidden = mode !== "hard";
    byId("win-rate-count").textContent = stats.winRate === null ? "-" : `${stats.winRate}%`;
    byId("avg-time-count").textContent = stats.wins ? formatDuration(stats.avgSeconds) : "-";
  } catch {
    // Les stats sont secondaires : la partie reste jouable
  }
}

function showDisclaimerOnce() {
  if (storage.get(KEYS.disclaimerSeen)) return;
  openModal("disclaimer-modal");
  const markSeen = () => storage.set(KEYS.disclaimerSeen, "true");
  byId("accept-disclaimer-btn")?.addEventListener("click", markSeen);
  byId("close-disclaimer-btn")?.addEventListener("click", markSeen);
}

async function showVersion() {
  const node = byId("app-version");
  try {
    const { version } = await api.version();
    if (node) node.textContent = `v${version}`;
  } catch {
    // affichage facultatif
  }
}

async function init() {
  storage.clearLegacy();
  bindModalClosing();
  initOptions();

  let apiDownShown = false;
  setUnavailableHandler(() => {
    if (apiDownShown) return;
    apiDownShown = true;
    openModal("api-down-modal");
  });

  const synonyms = new Synonyms();
  const suggestions = new Suggestions({
    input: byId("element-input"),
    box: byId("element-suggestions"),
    showAllButton: byId("show-all-btn")
  });
  synonyms.onChange((all) => suggestions.setData({ synonyms: all }));
  suggestions.setData({ synonyms: synonyms.all() });
  bindSynonymsModal(synonyms, getElements);

  const game = new Game({
    synonyms,
    suggestions,
    onFinished: (state) => refreshCommunityStats(state.mode)
  });
  new ReportsPanel({ getElements });
  new ProfilePanel();
  new LeaderboardPanel({ getMode: () => game.mode });

  byId("rules-btn")?.addEventListener("click", () => openModal("rules-modal"));
  document.querySelectorAll("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => refreshCommunityStats(btn.dataset.mode))
  );

  showDisclaimerOnce();
  showVersion();
  initNextWordTimer(byId("next-word-timer"), () => {
    game.load();
    refreshCommunityStats(game.mode);
  });

  const [loadedElements, aliases] = await Promise.all([
    api.elements().catch(() => []),
    api.aliases().catch(() => ({})),
    player.load()
  ]);
  elements = loadedElements;
  suggestions.setData({ elements });
  synonyms.setOfficial(aliases);

  api
    .modes()
    .then((modes) => Object.entries(modes).forEach(([id, rules]) => fillRulesText(id, rules)))
    .catch(() => {});

  await game.load();
  refreshCommunityStats(game.mode);
}

document.addEventListener("DOMContentLoaded", init);
