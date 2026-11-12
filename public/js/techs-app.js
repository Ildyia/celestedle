import { api, setUnavailableHandler } from "./api.js";
import { byId, bindModalClosing, openModal } from "./dom.js";
import { formatDuration, formatNumber } from "./format.js";
import { storage } from "./storage.js";
import { player } from "./player.js";
import { initOptions } from "./options.js";
import { initNextWordTimer } from "./timer.js";
import { showToast } from "./toast.js";
import { Suggestions } from "./suggestions.js";
import { Game } from "./game.js";
import { ProfilePanel } from "./profile.js";
import { LeaderboardPanel } from "./leaderboard.js";
import { initGameTabs } from "./game-tabs.js";
import { fillRulesText } from "./rules-text.js";
import { TECHS, modeKind } from "./catalogs.js";

// Celestedle Techs : même jeu que Celestedle, avec des techs à deviner

// Synonymes officiels des techs (« super » pour « Superdash (Super) »)
class TechSynonyms {
  constructor() {
    this.official = {};
  }

  set(map) {
    this.official = Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k.toLowerCase(), v]));
  }

  all() {
    return this.official;
  }

  resolve(input) {
    const target = this.official[input.trim().toLowerCase()];
    return target ? { guess: target, synonymOf: input.trim() } : { guess: input.trim(), synonymOf: null };
  }
}

async function refreshCommunityStats(mode) {
  try {
    const stats = await api.techsStats(mode);
    const hard = modeKind(TECHS, mode) === "hard";
    byId("stats-mode-label").textContent = hard ? "(Hard)" : "";
    byId("success-count").textContent = stats.wins ?? 0;
    byId("avg-tries-count").textContent = formatNumber(stats.avgTries);
    byId("avg-hints-count").textContent = stats.wins ? Number(stats.avgHints ?? 0).toFixed(1) : "-";
    byId("avg-hints-row").hidden = hard;
    byId("win-rate-row").hidden = !hard;
    byId("win-rate-count").textContent = stats.winRate === null ? "-" : `${stats.winRate}%`;
    byId("avg-time-count").textContent = stats.wins ? formatDuration(stats.avgSeconds) : "-";
  } catch {
    // Les stats sont secondaires
  }
}

async function showVersion() {
  try {
    const { version } = await api.version();
    byId("app-version").textContent = `v${version}`;
  } catch {
    // affichage facultatif
  }
}

// Jeu fermé (réglage d'accès de l'admin) : message à la place du jeu
function showLocked() {
  byId("techs-locked").hidden = false;
  for (const id of ["game-container", "game-status", "mode-switch", "left-sidebar-column", "hard-rules"]) {
    const node = byId(id);
    if (node) node.hidden = true;
  }
}

async function init() {
  bindModalClosing();
  initOptions();
  setUnavailableHandler(() => {});

  const synonyms = new TechSynonyms();
  // Techs sans image : pas de vignette dans les suggestions (rempli plus bas)
  const withMedia = new Set();
  const imageUrl = (name) => (withMedia.has(name) ? TECHS.imageUrl(name) : null);
  const suggestions = new Suggestions({
    input: byId("element-input"),
    box: byId("element-suggestions"),
    showAllButton: byId("show-all-btn"),
    imageUrl,
    detail: () => []
  });
  const hintPicker = new Suggestions({
    input: byId("hint-pick-input"),
    box: byId("hint-pick-suggestions"),
    imageUrl,
    detail: () => []
  });
  hintPicker.setRules({ enabled: true, minChars: 1, showAll: false });

  const game = new Game({
    catalog: TECHS,
    synonyms,
    suggestions,
    hintPicker,
    onFinished: (state) => refreshCommunityStats(state.mode)
  });
  new ProfilePanel();
  new LeaderboardPanel({ getMode: () => game.mode });

  byId("rules-btn")?.addEventListener("click", () => openModal("rules-modal"));
  document.querySelectorAll("[data-mode]").forEach((btn) =>
    btn.addEventListener("click", () => refreshCommunityStats(TECHS.modes[btn.dataset.mode]))
  );
  showVersion();

  await player.load();
  initGameTabs("techs");
  player.onChange(() => initGameTabs("techs"));
  const showAdmin = (profile) => {
    byId("admin-link").hidden = !["owner", "administrator"].includes(profile?.role);
  };
  showAdmin(player.profile);
  player.onChange(showAdmin);

  const { canPlay } = await api.techsAccess().catch(() => ({ canPlay: false }));
  if (!canPlay) return showLocked();

  const list = await api.techsList().catch(() => ({ techs: [], aliases: {} }));
  for (const tech of list.techs) if (tech.hasMedia) withMedia.add(tech.nom);
  suggestions.setData({ elements: list.techs, synonyms: list.aliases });
  hintPicker.setData({ elements: list.techs, synonyms: list.aliases });
  synonyms.set(list.aliases);

  api
    .techsModes()
    .then((modes) => Object.entries(modes).forEach(([id, rules]) => fillRulesText(id, rules, TECHS.hintNames)))
    .catch(() => {});

  initNextWordTimer(byId("next-word-timer"), () => {
    showToast("A new day on the mountain: today's climb is ready!");
    game.load();
    refreshCommunityStats(game.mode);
  });
  // Souvenir de la dernière visite (badge « New » de l'onglet)
  storage.set("celestedle_techs_seen", "1");
  await game.load();
  refreshCommunityStats(game.mode);
}

document.addEventListener("DOMContentLoaded", init);
