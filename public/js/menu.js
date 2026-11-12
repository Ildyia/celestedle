// Page d'accueil façon menus de Celeste : titre → fichier (profil) → modes → jeu.
// Ce fichier AFFICHE et ne réinvente rien : les appels au serveur passent par
// api.js, le profil par player.js, les préférences par storage.js.

import { api } from "./api.js";
import { player } from "./player.js";
import { avatarUrl } from "./profile.js";
import { storage, KEYS } from "./storage.js";
import { byId, el, clear } from "./dom.js";
import { formatDuration } from "./format.js";
import { rulesSentence } from "./rules-text.js";
import { CELESTEDLE, TECHS } from "./catalogs.js";
import { showToast } from "./toast.js";
import { initNextWordTimer } from "./timer.js";
import { openPanel, panelOpen } from "./menu-panels.js";
import { createJournal } from "./journal.js";
import { applySky, startSky } from "./sky.js";
import { STAMPS, earnedStamps, stampIcon } from "./stamps.js";

const LAST_GAME_KEY = "celestedle_menu_game";

// ===== Écrans =====
// L'écran affiché est donné par body[data-screen] ; le CSS fait le reste,
// y compris les mouvements de la montagne et de la lune.
let screen = "title";
let optionsReturn = "modes";

function go(next) {
  if (next !== screen) watchTransition();
  screen = next;
  document.body.dataset.screen = next;
  render();
}

function render() {
  if (screen === "files") renderFiles();
  if (screen === "modes") renderModes();
  if (screen === "options") renderOptions();
  renderHints();
}

// ===== Fichier (profil) =====
// Comme l'écran de fichiers du jeu : on parcourt les tickets (↑↓), Entrée
// ouvre le ticket choisi, qui monte seul à l'écran avec ses actions dessous.
// Avec un profil : [profil, restaurer]. Sans : [nouveau, restaurer].
// On ne propose pas « New file » à côté d'un profil : le nouveau jeton
// remplacerait l'ancien dans ce navigateur.
let slotIndex = 0;
let actionIndex = 0;
// Ticket ouvert (ses actions sont affichées)
let fileOpen = false;
// Saisie en cours dans un ticket : "rename", "code" ou "restore"
let editing = null;
let profileStats = null;
// Partie du jour pour chaque jeu, affichée en bas du ticket comme les
// chapitres terminés du jeu : { celestedle: "won" | "lost" | null, … }
let todayMarks = {};

function slotList() {
  return player.profile ? ["profile", "restore"] : ["new", "restore"];
}

function slotActions() {
  return [
    { label: "Begin", run: () => go("modes") },
    { label: "Rename", run: () => startEditing("rename") },
    // Avatar, couleur, Discord, visibilité : la fenêtre de profil complète
    { label: "Edit profile", run: () => openPanel("profile").catch((err) => showToast(err.message)) },
    { label: editing === "code" ? "Hide recovery code" : "Recovery code", run: () => startEditing(editing === "code" ? null : "code") }
  ];
}

function openSlot() {
  const kind = slotList()[slotIndex];
  if (kind === "new") return createFile();
  fileOpen = true;
  actionIndex = 0;
  if (kind === "restore") return startEditing("restore");
  renderFiles();
}

function closeSlot() {
  fileOpen = false;
  editing = null;
  renderFiles();
}

function startEditing(mode) {
  editing = mode;
  renderFiles();
  // Champ de saisie : focus direct pour taper tout de suite
  const input = byId("slot-input");
  input?.focus();
  input?.select();
}

async function createFile() {
  try {
    await player.ensure();
    slotIndex = 0;
    showToast("New file created.");
    go("modes");
  } catch (err) {
    showToast(err.message);
  }
}

async function loadProfileStats() {
  if (!player.profile) {
    profileStats = null;
    return;
  }
  try {
    const [normal, hard] = await Promise.all([api.myStats("normal"), api.myStats("hard")]);
    const times = [normal.bestSeconds, hard.bestSeconds].filter((t) => t !== null && t !== undefined);
    profileStats = {
      wins: normal.wins + hard.wins,
      falls: normal.losses + normal.forfeits + hard.losses + hard.forfeits,
      bestTime: times.length ? Math.min(...times) : null,
      streak: Math.max(normal.streak.current, hard.streak.current)
    };
  } catch {
    profileStats = null;
  }
  if (screen === "files") renderFiles();
}

// Partie du jour de chaque jeu et de chaque côté : { celestedle: { a, b } }
async function loadTodayMarks() {
  if (!player.profile) {
    todayMarks = {};
    return;
  }
  const entries = await Promise.all(
    games.map(async (game) => {
      const [a, b] = await Promise.all(["a", "b"].map((k) => game.state(game.modes[k]).catch(() => null)));
      return [game.id, { a: a?.status ?? null, b: b?.status ?? null }];
    })
  );
  todayMarks = Object.fromEntries(entries);
  if (screen === "files") renderFiles();
}

const ICON = "assets/illustration";
const img = (src, className = "") => el("img", { className, attrs: { src, alt: "", draggable: "false" } });
// « × 176 » en chiffres blancs à contour, comme les compteurs du jeu
const counter = (icon, value, title) =>
  el("span", { className: "counter", attrs: { title } }, [img(icon), el("span", { className: "times", text: "×" }), String(value)]);

// Talon qui sort de derrière le ticket : un cœur par partie gagnée
// aujourd'hui (bleu = A-Side, rouge = B-Side), un point sinon.
function profileStub() {
  if (editing === "code") {
    return [
      el("div", { className: "stub-note", text: "Recovery code: keep it private, it opens your file on another device." }),
      el("span", { className: "code", text: player.token })
    ];
  }
  const s = profileStats;
  const gems = el(
    "div",
    { className: "gems" },
    games.flatMap((g) =>
      ["a", "b"].map((k, row) => {
        const won = todayMarks[g.id]?.[k] === "won";
        const side = k === "a" ? "A-Side" : "B-Side";
        return el("span", {
          className: "gem",
          attrs: { title: `${g.title} ${side}: ${won ? "won today" : "not won today"}`, style: `grid-row: ${row + 1}` }
        }, [el("span", { className: won ? `heart ${k}` : "dot" })]);
      })
    )
  );
  return [
    gems,
    el("div", { className: "streak", attrs: { title: "Current streak" } }, [img("assets/illustration/goldflag.png"), s ? String(s.streak) : "…"]),
    el("div", { className: "stub-bottom" }, [
      counter(`${ICON}/skull.png`, s ? s.falls : "…", "Losses and forfeits"),
      el("span", { className: "best", attrs: { title: "Best time" }, text: s && s.bestTime !== null ? formatDuration(s.bestTime) : "--:--" })
    ])
  ];
}

function profileSlot() {
  const profile = player.profile;
  const s = profileStats;
  const lastGame = GAMES.find((g) => g.id === storage.get(LAST_GAME_KEY)) ?? GAMES[0];
  const body = [el("div", { className: "name", text: profile.name })];
  if (editing === "rename") {
    body.push(el("input", { attrs: { id: "slot-input", value: profile.name, maxlength: "24", "aria-label": "New name" } }));
  } else {
    body.push(el("div", { className: "sub", text: lastGame.title }), counter(`${ICON}/strawberry.png`, s ? s.wins : "…", "Wins"));
  }
  const earned = new Set(earnedStamps(profile));
  return {
    color: profile.color,
    portrait: avatarUrl(profile.avatar),
    stamps: STAMPS.filter((st) => earned.has(st.id)),
    body,
    stub: profileStub()
  };
}

function emptySlot(kind) {
  if (kind === "new") {
    return {
      portrait: "assets/illustration/start.png",
      body: [el("div", { className: "name", text: "New file" }), el("div", { className: "sub small", text: "Your profile is created on this device." })]
    };
  }
  const body = [el("div", { className: "name", text: "Restore" })];
  if (editing === "restore") {
    body.push(el("input", { attrs: { id: "slot-input", placeholder: "Paste your recovery code", "aria-label": "Recovery code", autocomplete: "off" } }));
  } else {
    body.push(el("div", { className: "sub small", text: "Climbing on another device? Use your recovery code." }));
  }
  return { portrait: "assets/illustration/backpack.png", body };
}

function stampElement(stamp) {
  const style = [
    `--stamp-color: ${stamp.color}`,
    `--stamp-icon: url("${stampIcon(stamp)}")`,
    `left: ${stamp.x}%`,
    `top: ${stamp.y}%`,
    `width: ${stamp.size}%`,
    `rotate: ${stamp.rotate}deg`
  ].join("; ");
  return el("span", { className: `stamp${stamp.ring ? " ring" : ""}`, attrs: { style, title: stamp.label } });
}

function slotElement(kind, selected) {
  const t = kind === "profile" ? profileSlot() : emptySlot(kind);
  const card = el("div", { className: "card" }, [
    el("div", { className: "shape" }),
    el("div", { className: "stamps" }, (t.stamps ?? []).map(stampElement)),
    el("div", { className: "portrait", attrs: { style: `--player-color: ${t.color ?? "#cfd8ef"}` } }, [img(t.portrait)]),
    el("span", { className: "tape tl" }),
    el("span", { className: "tape br" }),
    el("div", { className: "body" }, t.body)
  ]);
  const children = t.stub ? [el("div", { className: "stub" }, [el("div", { className: "shape" }), ...t.stub]), card] : [card];
  return el("div", { className: `slot${selected ? " selected" : ""}${t.stub ? " has-stub" : ""}${kind === "profile" ? "" : " empty"}` }, children);
}

function renderFiles() {
  const list = slotList();
  slotIndex = Math.min(slotIndex, list.length - 1);
  byId("files").classList.toggle("open", fileOpen);
  const slots = byId("slots");
  clear(slots);
  list.forEach((kind, i) => {
    // Ticket ouvert : il reste seul à l'écran
    if (fileOpen && i !== slotIndex) return;
    const slot = slotElement(kind, i === slotIndex);
    slot.addEventListener("click", () => {
      if (fileOpen) return;
      if (i === slotIndex) return openSlot();
      slotIndex = i;
      renderFiles();
    });
    slots.append(slot);
  });

  // Actions du ticket ouvert, en texte blanc comme dans le jeu
  const actions = byId("file-actions");
  clear(actions);
  if (fileOpen && list[slotIndex] === "profile" && !isTyping()) {
    slotActions().forEach((action, a) => {
      const li = el("li", { className: a === actionIndex ? "selected hl" : "", text: action.label });
      li.addEventListener("click", () => {
        actionIndex = a;
        action.run();
      });
      actions.append(li);
    });
  }
  const input = byId("slot-input");
  input?.addEventListener("keydown", onSlotInputKey);
}

function isTyping() {
  return editing === "rename" || editing === "restore";
}

async function onSlotInputKey(event) {
  event.stopPropagation();
  if (event.key === "Escape") {
    if (editing === "restore") fileOpen = false;
    editing = null;
    renderFiles();
    return;
  }
  if (event.key !== "Enter") return;
  const value = event.target.value.trim();
  if (!value) return;
  try {
    if (editing === "rename") {
      await player.update({ name: value });
      showToast("Name saved.");
    } else {
      await player.restore(value);
      slotIndex = 0;
      actionIndex = 0;
      showToast(`Welcome back, ${player.profile.name}!`);
      loadProfileStats();
    }
    editing = null;
    renderFiles();
  } catch (err) {
    showToast(err.message);
  }
}

// ===== Modes (sélection de chapitre) =====
// Un jeu = une icône et un endroit sur la montagne ; A-Side = Normal, B-Side = Hard.
const GAMES = [
  {
    id: "celestedle",
    title: "Celestedle",
    icon: "assets/entities/madeline.png",
    page: "index.html",
    modes: { a: "normal", b: "hard" },
    desc: {
      a: "Guess today's Celeste entity. Each guess shows which details match.",
      b: "Same entity hunt, steeper climb: every guess must fit your clues."
    },
    state: (mode) => api.game(mode),
    rules: () => api.modes(),
    hintNames: CELESTEDLE.hintNames,
    stats: (mode) => api.myStats(mode),
    community: (mode) => api.communityStats(mode)
  },
  {
    id: "connections",
    title: "Connections",
    icon: "assets/illustration/strawberry.png",
    page: "connections.html",
    modes: { a: "normal", b: "hard" },
    desc: {
      a: "Sort 16 entities into 4 hidden groups. 4 mistakes allowed, 3 hints.",
      b: "Decoys everywhere and a single hint. 4 mistakes allowed."
    },
    access: () => api.connectionsAccess(),
    state: (mode) => api.connections(mode),
    community: (mode) => api.connectionsStats(mode)
  },
  {
    id: "techs",
    title: "Techs",
    icon: "assets/illustration/feather.png",
    page: "techs.html",
    modes: { a: "tech", b: "tech-hard" },
    desc: {
      a: "Guess today's movement tech from its category, difficulty and utility.",
      b: "Fewer tries against the clock: every guess must fit your clues."
    },
    access: () => api.techsAccess(),
    state: (mode) => api.techsGame(mode),
    rules: () => api.techsModes(),
    hintNames: TECHS.hintNames,
    community: (mode) => api.techsStats(mode)
  }
];

// Jeux visibles : Celestedle, plus ceux auxquels le joueur a accès
let games = [GAMES[0]];
let gameIndex = 0;
let side = storage.get(KEYS.mode) === "hard" ? "b" : "a";
const rulesCache = new Map();
// Évite qu'une réponse lente écrase l'affichage d'un autre jeu
let bookRequest = 0;

async function loadGames() {
  const checks = await Promise.all(
    GAMES.map(async (game) => {
      if (!game.access) return { game, canPlay: true, access: "public" };
      try {
        return { game, ...(await game.access()) };
      } catch {
        return { game, canPlay: false };
      }
    })
  );
  games = checks.filter((c) => c.canPlay).map((c) => ({ ...c.game, playtest: c.access !== "public" }));
  const last = games.findIndex((g) => g.id === storage.get(LAST_GAME_KEY));
  gameIndex = last >= 0 ? last : 0;
  if (screen === "modes") renderModes();
  loadTodayMarks();
}

function selectGame(index) {
  gameIndex = (index + games.length) % games.length;
  storage.set(LAST_GAME_KEY, games[gameIndex].id);
  renderModes();
}

function selectSide(next) {
  side = next;
  renderModes();
}

function renderModes() {
  const game = games[gameIndex];
  document.body.dataset.game = game.id;

  const icons = byId("icons");
  clear(icons);
  games.forEach((g, i) => {
    icons.append(
      el(
        "button",
        {
          className: `icon${i === gameIndex ? " selected" : ""}`,
          attrs: { type: "button", "aria-label": g.title, "aria-pressed": String(i === gameIndex) },
          on: { click: () => selectGame(i) }
        },
        [el("img", { attrs: { src: g.icon, alt: "" } }), g.playtest ? el("span", { className: "badge", text: "🧪" }) : null]
      )
    );
  });

  byId("mode-label").textContent = game.playtest ? `${game.title} · playtest` : game.title;
  byId("book-chapter").textContent = `GAME ${gameIndex + 1} · ${side === "a" ? "A-SIDE" : "B-SIDE"}`;
  byId("book-title").textContent = game.title;
  byId("book-desc").textContent = game.desc[side];
  for (const tab of byId("tabs").children) tab.classList.toggle("active", tab.dataset.side === side);
  byId("climb").className = `climb ${side}`;
  const today = byId("book-today");
  today.textContent = "";
  today.className = "today";
  clear(byId("book-record"));
  fillBook(game, game.modes[side]);
}

// Partie du jour, règles et record : chargés à part, l'écran s'affiche avant
async function fillBook(game, mode) {
  const request = ++bookRequest;
  const [state, rules, records] = await Promise.all([
    game.state(mode).catch(() => null),
    loadRules(game, mode),
    loadRecords(game, mode)
  ]);
  if (request !== bookRequest) return;

  if (rules) byId("book-desc").textContent = `${game.desc[side]} ${rulesSentence(rules, game.hintNames)}`;

  const today = byId("book-today");
  const status = state?.status;
  if (status === "won") {
    today.textContent = "✓ Summit reached today";
    today.classList.add("won");
  } else if (status === "lost" || status === "forfeit") {
    today.textContent = "✗ Fell today. Try again tomorrow!";
    today.classList.add("lost");
  } else if (state?.lockedBy) {
    today.textContent = "🔒 Finish your B-Side climb first (or give up)";
    today.classList.add("lost");
  } else if (state?.startedAt) {
    today.textContent = "⛺ Climb in progress";
  } else if (state) {
    today.textContent = "Today's climb is waiting";
  }

  const box = byId("book-record");
  clear(box);
  for (const record of records) box.append(el("div", { className: "record-title", text: record.title }), ...record.tiles);
}

async function loadRules(game, mode) {
  if (!game.rules) return null;
  const key = game.id;
  if (!rulesCache.has(key)) rulesCache.set(key, game.rules().catch(() => null));
  const all = await rulesCache.get(key);
  return all?.[mode] ?? null;
}

const tile = (value, label) => el("div", {}, [el("strong", { text: String(value) }), label]);

// Record perso (si le jeu le fournit) puis les chiffres du jour de tous
async function loadRecords(game, mode) {
  const [mine, community] = await Promise.all([
    game.stats && player.profile ? game.stats(mode).catch(() => null) : null,
    game.community ? game.community(mode).catch(() => null) : null
  ]);
  const records = [];
  if (mine) {
    records.push({ title: "YOUR RECORD", tiles: [tile(mine.wins, "Wins"), tile(mine.streak.current, "Streak"), tile(formatDuration(mine.bestSeconds), "Best time")] });
  }
  if (community) {
    records.push({
      title: "TODAY ON THE MOUNTAIN",
      tiles: [
        tile(community.wins ?? 0, "Climbers"),
        tile(community.winRate === null || community.winRate === undefined ? "–" : `${community.winRate}%`, "Success"),
        tile(community.wins ? formatDuration(community.avgSeconds) : "–", "Avg. time")
      ]
    });
  }
  return records;
}

function climb() {
  // Les trois pages de jeu lisent le même réglage KEYS.mode ("normal" ou
  // "hard") au chargement : il suffit de l'écrire avant d'y aller.
  storage.set(KEYS.mode, side === "a" ? "normal" : "hard");
  location.href = games[gameIndex].page;
}

// ===== Signalement de bug (fenêtre de la page de jeu, ouverte ici) =====
function openReport() {
  openPanel("reports").catch((err) => showToast(err.message));
}

// ===== Journal (js/journal.js) =====
const journal = createJournal({ getContext: () => ({ games, gameIndex, side }) });
const openJournal = () => journal.open();
const closeJournal = () => journal.close();
const journalOpen = () => journal.isOpen();

// ===== Options =====
// Chaque préférence : un libellé et une valeur qu'on fait défiler avec ◂ ▸.
// Mêmes clés que options.js : le choix fait ici vaut aussi dans les jeux.
const OPTION_ROWS = [
  { label: "Modern game pages", key: KEYS.modernUi, fallback: false },
  { label: "Celeste theme", key: KEYS.celesteTheme, fallback: true },
  { label: "Show timer", key: KEYS.showTimer, fallback: true },
  { label: "Bird cursor", key: KEYS.customCursor, fallback: true, apply: applyCursor },
  { label: "Colorblind mode", key: KEYS.colorblind, fallback: false },
  // Coupe les animations de décor et raccourcit les mouvements (celeste-ui.css)
  { label: "Time of day sky", key: KEYS.timeSky, fallback: true, apply: applySky },
  { label: "Keyboard hints", key: KEYS.keyHints, fallback: true, apply: renderHints },
  { label: "Performance mode", key: KEYS.performance, fallback: false, apply: applyPerformance },
  { sep: true },
  { label: "Report a bug", run: () => openReport() },
  { label: "Discord", link: "https://discord.gg/3yqgMbuMbX", external: true },
  { label: "GitHub", link: "https://github.com/Ildyia/celestedle", external: true },
  { label: "Support on Ko-fi", link: "https://ko-fi.com/ildyia", external: true },
  { sep: true },
  { label: "Credits", link: "credits.html" },
  { label: "Legal notice", link: "legal-notice.html" },
  { label: "Back", back: true }
];
let optionIndex = 0;

function renderOptions() {
  const menu = byId("menu");
  clear(menu);
  OPTION_ROWS.forEach((row, i) => {
    if (row.sep) {
      menu.append(el("li", { className: "sep" }));
      return;
    }
    const children = [el("span", { text: row.label })];
    if (row.key) children.push(el("span", { className: "value", text: storage.getBool(row.key, row.fallback) ? "On" : "Off" }));
    const li = el("li", { className: i === optionIndex ? "selected hl" : "" }, children);
    li.addEventListener("click", () => {
      optionIndex = i;
      activateOption();
    });
    menu.append(li);
  });
}

function moveOption(step) {
  do {
    optionIndex = (optionIndex + step + OPTION_ROWS.length) % OPTION_ROWS.length;
  } while (OPTION_ROWS[optionIndex].sep);
  renderOptions();
}

function activateOption() {
  const row = OPTION_ROWS[optionIndex];
  if (row.back) return go(optionsReturn);
  if (row.run) return row.run();
  if (row.external) {
    window.open(row.link, "_blank", "noopener");
    return;
  }
  if (row.link) {
    location.href = row.link;
    return;
  }
  const on = !storage.getBool(row.key, row.fallback);
  storage.set(row.key, String(on));
  row.apply?.(on);
  renderOptions();
}

function openOptions() {
  optionsReturn = screen;
  optionIndex = 0;
  go("options");
}

// ===== Aide clavier en bas à droite =====
const HINTS = {
  // Écran titre : le rond « C » remplace la touche, et clignote
  title: [[null, "Start"]],
  files: [["↑↓", "Move"], ["Enter", "Confirm"], ["Esc", "Back"]],
  modes: [["←→", "Game"], ["↑↓", "Side"], ["Enter", "Climb"], ["J", "Journal"], ["O", "Options"], ["B", "Bug"], ["Esc", "Back"]],
  options: [["↑↓", "Move"], ["Enter", "Change"], ["Esc", "Back"]]
};

function renderHints() {
  const box = byId("hints");
  clear(box);
  // Option « Keyboard hints » : l'écran titre garde son « Start », seule
  // invitation à entrer dans le menu
  if (screen !== "title" && !storage.getBool(KEYS.keyHints, true)) return;
  for (const [key, label] of HINTS[screen]) {
    box.append(key ? el("span", {}, [el("b", { text: key }), label]) : el("span", { className: "blink" }, [el("span", { className: "press-disc" }), label]));
  }
}

// ===== Clavier =====
const KEY_HANDLERS = {
  title: { Enter: () => go("files"), " ": () => go("files") },
  files: {
    ArrowUp: () => (fileOpen ? moveAction(-1) : moveSlot(-1)),
    ArrowDown: () => (fileOpen ? moveAction(1) : moveSlot(1)),
    Enter: () => (fileOpen ? slotActions()[actionIndex]?.run() : openSlot()),
    Escape: () => {
      if (editing) return startEditing(null);
      if (fileOpen) return closeSlot();
      go("title");
    }
  },
  modes: {
    ArrowLeft: () => selectGame(gameIndex - 1),
    ArrowRight: () => selectGame(gameIndex + 1),
    ArrowUp: () => selectSide("a"),
    ArrowDown: () => selectSide("b"),
    Tab: () => selectSide(side === "a" ? "b" : "a"),
    Enter: climb,
    j: openJournal,
    o: openOptions,
    b: openReport,
    Escape: () => go("files")
  },
  options: {
    ArrowUp: () => moveOption(-1),
    ArrowDown: () => moveOption(1),
    ArrowLeft: () => OPTION_ROWS[optionIndex].key && activateOption(),
    ArrowRight: () => OPTION_ROWS[optionIndex].key && activateOption(),
    Enter: activateOption,
    Escape: () => go(optionsReturn)
  }
};

function moveSlot(step) {
  const count = slotList().length;
  slotIndex = (slotIndex + step + count) % count;
  renderFiles();
}

function moveAction(step) {
  const count = slotActions().length;
  actionIndex = (actionIndex + step + count) % count;
  renderFiles();
}

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea, select")) return;
  // Fenêtre ouverte (profil, classements, bug) : elle gère son clavier
  if (panelOpen()) return;
  if (journalOpen()) {
    if (event.key === "Escape" || event.key === "j") closeJournal();
    if (event.key === "ArrowLeft") journal.flip(-1);
    if (event.key === "ArrowRight") journal.flip(1);
    return;
  }
  const handler = KEY_HANDLERS[screen][event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (!handler) return;
  // Laisse Enter activer normalement un bouton qui a le focus (souris, Tab)
  if (event.key === "Enter" && event.target.matches("button:focus-visible")) return;
  event.preventDefault();
  handler();
});

// ===== Souris et toucher =====
byId("title").addEventListener("click", () => go("files"));
byId("climb").addEventListener("click", climb);
byId("to-options").addEventListener("click", openOptions);
byId("to-report").addEventListener("click", openReport);
byId("to-journal").addEventListener("click", openJournal);
byId("journal-close").addEventListener("click", closeJournal);
byId("journal-prev").addEventListener("click", () => journal.flip(-1));
byId("journal-next").addEventListener("click", () => journal.flip(1));
byId("journal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeJournal();
});
for (const tab of byId("tabs").children) tab.addEventListener("click", () => selectSide(tab.dataset.side));

// ===== Décor : neige =====
function letItSnow(count = 40) {
  const scene = byId("scene");
  for (let i = 0; i < count; i++) {
    const flake = el("div", { className: "snow" });
    const size = 2 + Math.random() * 3;
    Object.assign(flake.style, {
      left: `${Math.random() * 110}%`,
      width: `${size}px`,
      height: `${size}px`,
      opacity: String(0.4 + Math.random() * 0.5),
      animationDuration: `${8 + Math.random() * 10}s`,
      animationDelay: `${-Math.random() * 18}s`
    });
    scene.append(flake);
  }
}

// Curseur oiseau (style.css) : coupé si l'option est désactivée
function applyCursor(on) {
  document.body.classList.toggle("no-custom-cursor", !on);
}

// ===== Mode performance =====
function applyPerformance(on) {
  document.body.classList.toggle("perf", on);
}

// Tant que le joueur n'a pas choisi lui-même dans les options, on mesure la
// fluidité des premiers changements d'écran (le zoom de la montagne). Si le
// navigateur tombe sous ~30 images/s (souvent : accélération graphique
// coupée), on passe en mode performance et on s'en souvient.
const SLOW_FPS = 30;
let transitionChecks = 0;

function watchTransition() {
  if (storage.get(KEYS.performance) !== null || transitionChecks >= 3 || document.hidden) return;
  transitionChecks++;
  const startedAt = performance.now();
  let frames = 0;
  const tick = (now) => {
    frames++;
    if (now - startedAt < 1000) return requestAnimationFrame(tick);
    const fps = (frames * 1000) / (now - startedAt);
    if (fps >= SLOW_FPS || document.hidden || storage.get(KEYS.performance) !== null) return;
    storage.set(KEYS.performance, "true");
    applyPerformance(true);
    if (screen === "options") renderOptions();
    showToast("Slow animations detected: performance mode is on (see Options).");
  };
  requestAnimationFrame(tick);
}

// ===== Démarrage =====
async function start() {
  applyPerformance(storage.getBool(KEYS.performance, false));
  applyCursor(storage.getBool(KEYS.customCursor, true));
  startSky();
  letItSnow();
  renderHints();
  // Prochaine partie : compte à rebours dans le livre ; à minuit, on recharge
  initNextWordTimer(byId("book-next-time"), () => {
    loadTodayMarks();
    if (screen === "modes") renderModes();
  });
  api.version().then(({ version }) => (byId("version").textContent = `v${version}`)).catch(() => {});
  player.onChange(() => {
    loadProfileStats();
    loadGames();
  });
  await player.load();
  // Sans jeton, player.load ne prévient pas : on charge quand même les jeux
  if (!player.profile) loadGames();
}

start();
