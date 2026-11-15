import { api, setUnavailableHandler } from "./api.js";
import { byId, bindModalClosing, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { storage, KEYS } from "./storage.js";
import { player } from "./player.js";
import { initOptions } from "./options.js";
import { initNextWordTimer } from "./timer.js";
import { showToast } from "./toast.js";
import { Synonyms, bindSynonymsModal } from "./synonyms.js";
import { Suggestions } from "./suggestions.js";
import { Game } from "./game.js";
import { ReportsPanel } from "./reports.js";
import { ProfilePanel } from "./profile.js";
import { LeaderboardPanel } from "./leaderboard.js";
import { initGameTabs } from "./game-tabs.js";
import { fillRulesText } from "./rules-text.js";
import { duelCatalog, duelId, startDuel } from "./duel.js";

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
  // En Modern, l'accueil se fait sur le menu (carte postale)
  if (document.documentElement.classList.contains("ui-modern")) return;
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
  // Choix d'un élément pour un indice : toujours avec suggestions, même en Hard
  const hintPicker = new Suggestions({
    input: byId("hint-pick-input"),
    box: byId("hint-pick-suggestions")
  });
  hintPicker.setRules({ enabled: true, minChars: 1, showAll: false });
  synonyms.onChange((all) => {
    suggestions.setData({ synonyms: all });
    hintPicker.setData({ synonyms: all });
  });
  suggestions.setData({ synonyms: synonyms.all() });
  hintPicker.setData({ synonyms: synonyms.all() });
  bindSynonymsModal(synonyms, getElements);

  // celestedle.html?duel=<id> : la page joue un duel (js/duel.js)
  const duel = duelId();
  const game = new Game({
    synonyms,
    suggestions,
    hintPicker,
    catalog: duel ? duelCatalog(duel) : undefined,
    onFinished: (state) => !duel && refreshCommunityStats(state.mode)
  });
  const reports = new ReportsPanel({ getElements });
  const profile = new ProfilePanel();
  const leaderboard = new LeaderboardPanel({ getMode: () => game.mode });

  byId("rules-btn")?.addEventListener("click", () => openModal("rules-modal"));
  document.querySelectorAll("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => refreshCommunityStats(btn.dataset.mode))
  );

  showDisclaimerOnce();
  showVersion();
  initNextWordTimer(byId("next-word-timer"), () => {
    if (duel) return;
    showToast("A new day on the mountain: today's climb is ready!");
    game.load();
    refreshCommunityStats(game.mode);
  });

  const [loadedElements, aliases] = await Promise.all([
    api.elements().catch(() => []),
    api.aliases().catch(() => ({})),
    player.load()
  ]);
  elements = loadedElements;
  // Liens du menu vers ces fenêtres : celestedle.html#leaderboard, #bug, #profile
  const fromMenu = { "#leaderboard": leaderboard, "#bug": reports, "#profile": profile }[location.hash];
  if (fromMenu) {
    history.replaceState(null, "", location.pathname + location.search);
    fromMenu.open();
  }
  // Onglet Connections : visible de qui peut y jouer (réglage d'accès de l'admin)
  initGameTabs("celestedle");
  player.onChange(() => initGameTabs("celestedle"));
  // Accès direct à l'admin pour l'équipe
  const showAdmin = (profile) => {
    byId("admin-link").hidden = !["owner", "administrator"].includes(profile?.role);
  };
  showAdmin(player.profile);
  player.onChange(showAdmin);
  suggestions.setData({ elements });
  hintPicker.setData({ elements });
  synonyms.setOfficial(aliases);

  api
    .modes()
    .then((modes) => Object.entries(modes).forEach(([id, rules]) => fillRulesText(id, rules)))
    .catch(() => {});

  if (duel) {
    // La partie ne se charge qu'une fois le duel commencé (le plateau peut
    // vouloir se recharger avant, au retour sur l'onglet)
    const load = game.load.bind(game);
    let started = false;
    game.load = () => (started ? load() : Promise.resolve());
    startDuel({
      id: duel,
      onReady: (room) => {
        started = true;
        document.documentElement.classList.add("duel-started");
        game.mode = room.mode;
        game.load();
      },
      // L'autre joueur a pu finir pendant notre partie : rien à recharger,
      // mais le temps du mode Hard peut avoir expiré
      onUpdate: (room) => {
        if (room.me && game.state && room.me.status !== game.state.status) game.render(room.me);
      }
    });
    return;
  }
  await game.load();
  refreshCommunityStats(game.mode);
}

document.addEventListener("DOMContentLoaded", init);
