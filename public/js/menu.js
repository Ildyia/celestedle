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

const LAST_GAME_KEY = "celestedle_menu_game";

// ===== Écrans =====
// L'écran affiché est donné par body[data-screen] ; le CSS fait le reste,
// y compris les mouvements de la montagne et de la lune.
let screen = "title";
let optionsReturn = "modes";

function go(next) {
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
// Avec un profil : [profil, restaurer]. Sans : [nouveau, restaurer].
// On ne propose pas « New file » à côté d'un profil : le nouveau jeton
// remplacerait l'ancien dans ce navigateur.
let slotIndex = 0;
let actionIndex = 0;
// Saisie en cours dans un ticket : "rename", "code" ou "restore"
let editing = null;
let profileStats = null;

function slotList() {
  return player.profile ? ["profile", "restore"] : ["new", "restore"];
}

function slotActions(kind) {
  if (kind === "profile") return [
    { label: "Begin", run: () => go("modes") },
    { label: "Rename", run: () => startEditing("rename") },
    { label: editing === "code" ? "Hide code" : "Recovery code", run: () => startEditing(editing === "code" ? null : "code") }
  ];
  if (kind === "new") return [{ label: "Begin", run: createFile }];
  return [{ label: "Enter code", run: () => startEditing("restore") }];
}

function startEditing(mode) {
  editing = mode;
  actionIndex = 0;
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
      normal,
      hard,
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

function statItem(icon, text, title) {
  return el("span", { attrs: { title } }, [el("img", { attrs: { src: `assets/illustration/${icon}.png`, alt: "" } }), text]);
}

function profileSlot() {
  const profile = player.profile;
  const s = profileStats;
  const body = [el("div", { className: "name" }, [profile.name, el("small", { text: `#${profile.id.slice(0, 4)}` })])];
  if (editing === "rename") {
    body.push(el("input", { attrs: { id: "slot-input", value: profile.name, maxlength: "24", "aria-label": "New name" } }));
  } else if (editing === "code") {
    body.push(el("div", { className: "sub", text: "Keep this code private: it opens your profile on another device." }));
    body.push(el("span", { className: "code", text: player.token }));
  } else {
    body.push(
      el("div", { className: "stats" }, [
        statItem("strawberry", s ? String(s.wins) : "…", "Wins"),
        statItem("skull", s ? String(s.falls) : "…", "Losses and forfeits"),
        statItem("time", s && s.bestTime !== null ? formatDuration(s.bestTime) : "--:--", "Best time"),
        statItem("goldflag", s ? String(s.streak) : "…", "Current streak")
      ])
    );
  }
  return {
    portrait: el("div", { className: "portrait", attrs: { style: `--player-color: ${profile.color}` } }, [
      el("img", { attrs: { src: avatarUrl(profile.avatar), alt: "" } })
    ]),
    body
  };
}

function emptySlot(kind) {
  if (kind === "new") {
    return {
      portrait: el("div", { className: "portrait" }, [el("img", { attrs: { src: "assets/illustration/start.png", alt: "" } })]),
      body: [el("div", { className: "name", text: "New file" }), el("div", { className: "sub", text: "Start climbing: your profile is created on this device." })]
    };
  }
  const body = [el("div", { className: "name", text: "Restore a file" })];
  if (editing === "restore") {
    body.push(el("input", { attrs: { id: "slot-input", placeholder: "Paste your recovery code", "aria-label": "Recovery code", autocomplete: "off" } }));
  } else {
    body.push(el("div", { className: "sub", text: "Already climbing on another device? Use your recovery code." }));
  }
  return {
    portrait: el("div", { className: "portrait" }, [el("img", { attrs: { src: "assets/illustration/backpack.png", alt: "" } })]),
    body
  };
}

function renderFiles() {
  const list = slotList();
  slotIndex = Math.min(slotIndex, list.length - 1);
  const slots = byId("slots");
  clear(slots);
  list.forEach((kind, i) => {
    const selected = i === slotIndex;
    const { portrait, body } = kind === "profile" ? profileSlot() : emptySlot(kind);
    const actions = selected && !isTyping()
      ? slotActions(kind).map((action, a) =>
          el("button", {
            className: a === actionIndex ? "active" : "",
            text: action.label,
            attrs: { type: "button" },
            on: { click: (e) => { e.stopPropagation(); actionIndex = a; action.run(); } }
          })
        )
      : [];
    const slot = el(
      "div",
      { className: `slot paper${selected ? " selected" : ""}${kind === "profile" ? "" : " empty"}` },
      [portrait, el("div", { className: "body" }, body), el("div", { className: "actions" }, actions)]
    );
    slot.addEventListener("click", () => {
      if (i === slotIndex) return;
      slotIndex = i;
      actionIndex = 0;
      editing = null;
      renderFiles();
    });
    slots.append(slot);
  });
  const input = byId("slot-input");
  input?.addEventListener("keydown", onSlotInputKey);
}

function isTyping() {
  return editing === "rename" || editing === "restore";
}

async function onSlotInputKey(event) {
  event.stopPropagation();
  if (event.key === "Escape") {
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
    stats: (mode) => api.myStats(mode)
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
  const [state, rules, record] = await Promise.all([
    game.state(mode).catch(() => null),
    loadRules(game, mode),
    loadRecord(game, mode)
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
  if (record) box.append(el("div", { className: "record-title", text: record.title }), ...record.tiles);
}

async function loadRules(game, mode) {
  if (!game.rules) return null;
  const key = game.id;
  if (!rulesCache.has(key)) rulesCache.set(key, game.rules().catch(() => null));
  const all = await rulesCache.get(key);
  return all?.[mode] ?? null;
}

const tile = (value, label) => el("div", {}, [el("strong", { text: String(value) }), label]);

async function loadRecord(game, mode) {
  try {
    // Statistiques personnelles quand le jeu les fournit, sinon celles du jour
    if (game.stats && player.profile) {
      const s = await game.stats(mode);
      return { title: "YOUR RECORD", tiles: [tile(s.wins, "Wins"), tile(s.streak.current, "Streak"), tile(formatDuration(s.bestSeconds), "Best time")] };
    }
    if (game.community) {
      const s = await game.community(mode);
      return {
        title: "TODAY ON THE MOUNTAIN",
        tiles: [tile(s.wins, "Climbers"), tile(s.winRate === null ? "–" : `${s.winRate}%`, "Success"), tile(formatDuration(s.avgSeconds), "Avg. time")]
      };
    }
  } catch {
    // Pas de record : l'encart reste vide
  }
  return null;
}

function climb() {
  // Les trois pages de jeu lisent le même réglage KEYS.mode ("normal" ou
  // "hard") au chargement : il suffit de l'écrire avant d'y aller.
  storage.set(KEYS.mode, side === "a" ? "normal" : "hard");
  location.href = games[gameIndex].page;
}

// ===== Journal : statistiques du joueur =====
async function openJournal() {
  const wrap = byId("journal");
  wrap.hidden = false;
  byId("journal-title").textContent = player.profile ? `${player.profile.name}'s journal` : "Journal";
  const body = byId("journal-body");
  clear(body);
  if (!player.profile) {
    body.append(el("tr", {}, [el("td", { attrs: { colspan: "6" }, text: "No file yet: play a game to start your journal." })]));
    return;
  }
  const rows = [
    { label: "Celestedle", mode: "normal", color: "var(--side-a)" },
    { label: "Celestedle", mode: "hard", color: "var(--side-b)" }
  ];
  for (const row of rows) {
    let s;
    try {
      s = await api.myStats(row.mode);
    } catch {
      continue;
    }
    body.append(
      el("tr", {}, [
        el("td", {}, [el("span", { className: "side", attrs: { style: `background: ${row.color}` } }), `${row.label} ${row.mode === "hard" ? "B" : "A"}`]),
        el("td", { text: String(s.played) }),
        el("td", { text: String(s.wins) }),
        el("td", { text: String(s.streak.current) }),
        el("td", { text: String(s.streak.best) }),
        el("td", { text: formatDuration(s.bestSeconds) })
      ])
    );
  }
  byId("journal-close").focus();
}

function closeJournal() {
  byId("journal").hidden = true;
}

function journalOpen() {
  return !byId("journal").hidden;
}

// ===== Options =====
// Chaque préférence : un libellé et une valeur qu'on fait défiler avec ◂ ▸.
// Mêmes clés que options.js : le choix fait ici vaut aussi dans les jeux.
const OPTION_ROWS = [
  { label: "Celeste theme", key: KEYS.celesteTheme, fallback: true },
  { label: "Show timer", key: KEYS.showTimer, fallback: true },
  { label: "Bird cursor", key: KEYS.customCursor, fallback: true },
  { label: "Colorblind mode", key: KEYS.colorblind, fallback: false },
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
  if (row.link) {
    location.href = row.link;
    return;
  }
  storage.set(row.key, String(!storage.getBool(row.key, row.fallback)));
  renderOptions();
}

function openOptions() {
  optionsReturn = screen;
  optionIndex = 0;
  go("options");
}

// ===== Aide clavier en bas à droite =====
const HINTS = {
  title: [["Enter", "Start"]],
  files: [["↑↓", "File"], ["←→", "Action"], ["Enter", "Confirm"], ["Esc", "Back"]],
  modes: [["←→", "Game"], ["↑↓", "Side"], ["Enter", "Climb"], ["J", "Journal"], ["O", "Options"], ["Esc", "Back"]],
  options: [["↑↓", "Move"], ["Enter", "Change"], ["Esc", "Back"]]
};

function renderHints() {
  const box = byId("hints");
  clear(box);
  for (const [key, label] of HINTS[screen]) box.append(el("span", {}, [el("b", { text: key }), label]));
}

// ===== Clavier =====
const KEY_HANDLERS = {
  title: { Enter: () => go("files"), " ": () => go("files") },
  files: {
    ArrowUp: () => moveSlot(-1),
    ArrowDown: () => moveSlot(1),
    ArrowLeft: () => moveAction(-1),
    ArrowRight: () => moveAction(1),
    Enter: () => slotActions(slotList()[slotIndex])[actionIndex]?.run(),
    Escape: () => (editing ? startEditing(null) : go("title"))
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
  actionIndex = 0;
  editing = null;
  renderFiles();
}

function moveAction(step) {
  const count = slotActions(slotList()[slotIndex]).length;
  actionIndex = (actionIndex + step + count) % count;
  renderFiles();
}

document.addEventListener("keydown", (event) => {
  if (event.target.matches("input")) return;
  if (journalOpen()) {
    if (event.key === "Escape" || event.key === "j") closeJournal();
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
byId("to-journal").addEventListener("click", openJournal);
byId("journal-close").addEventListener("click", closeJournal);
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

// ===== Démarrage =====
async function start() {
  letItSnow();
  renderHints();
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
