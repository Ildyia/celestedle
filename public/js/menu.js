// Page d'accueil façon menus de Celeste : titre → fichier (profil) → modes → jeu.
// Ce fichier AFFICHE et ne réinvente rien : les appels au serveur passent par
// api.js, le profil par player.js, les préférences par storage.js.

import { api, setUnavailableHandler } from "./api.js";
import { player } from "./player.js";
import { avatarFit, avatarUrl } from "./profile.js";
import { storage, KEYS } from "./storage.js";
import { byId, el, clear } from "./dom.js";
import { formatDuration } from "./format.js";
import { rulesSentence } from "./rules-text.js";
import { CELESTEDLE, TECHS } from "./catalogs.js";
import { showToast } from "./toast.js";
import { keySound, playSound } from "./sound.js";
import { chapterProgress, previewChapter, trailSvg } from "./chapters.js";
import { initNextWordTimer } from "./timer.js";
import { openPanel, panelOpen } from "./menu-panels.js";
import { createJournal } from "./journal.js";
import { SKY_CHOICES, applySky, skySetting, startSky } from "./sky.js";
import { STAMPS, TICKET_SLOTS, earnedStamps, stampSvg, setAchievements } from "./stamps.js";

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
  updateTitle();
}

// Titre de l'onglet : dit où on est dans le menu
function updateTitle() {
  const where = { title: null, files: "Files", modes: games[gameIndex]?.title, options: "Options" }[screen];
  const name = journalOpen() ? "Journal" : where;
  document.title = name && name !== "Celestedle" ? `${name} · Celestedle` : "Celestedle";
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
  // Suppression : on confirme, comme dans le jeu (« Keep » choisi d'office)
  if (editing === "delete") {
    return [
      { label: "Keep my file", run: () => startEditing(null) },
      { label: "Delete forever", danger: true, run: deleteFile }
    ];
  }
  return [
    { label: "Begin", run: () => go("modes") },
    { label: "Rename", run: () => startEditing("rename") },
    // Avatar, couleur, Discord, visibilité : la fenêtre de profil complète
    { label: "Edit profile", run: () => openPanel("profile").catch((err) => showToast(err.message)) },
    { label: editing === "code" ? "Hide recovery code" : "Recovery code", run: () => startEditing(editing === "code" ? null : "code") },
    {
      label: "Delete",
      run: () => {
        actionIndex = 0;
        startEditing("delete");
      }
    }
  ];
}

async function deleteFile() {
  try {
    await player.remove();
    fileOpen = false;
    editing = null;
    slotIndex = 0;
    actionIndex = 0;
    showToast("Your file has been deleted.");
    renderFiles();
  } catch (err) {
    showToast(err.message);
  }
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

// Achievements : posent les tampons sur le ticket ; un tampon gagné depuis
// la dernière visite est annoncé (liste vue gardée dans ce navigateur)
// Tampons gagnés depuis la dernière visite : animés une fois sur le ticket
const freshStamps = new Set();

async function loadAchievements() {
  if (!player.profile) {
    setAchievements([]);
    return;
  }
  try {
    const { achievements } = await api.myAchievements();
    setAchievements(achievements);
    const key = `${KEYS.seenStamps}_${player.profile.id}`;
    const seen = storage.getJson(key, null);
    const now = achievements.filter((a) => a.earned).map((a) => a.id);
    // Première fois sur ce navigateur : on ne fête pas les anciens tampons
    if (seen) {
      const fresh = achievements.filter((a) => a.earned && !seen.includes(a.id));
      // Ils seront posés d'un coup de tampon à la prochaine vue du ticket
      for (const a of fresh) freshStamps.add(a.id);
      if (fresh.length) showToast(`New stamp${fresh.length > 1 ? "s" : ""}: ${fresh.map((a) => a.name).join(", ")}!`, 4000);
    }
    storage.setJson(key, now);
  } catch {
    // Pas de tampons : le ticket reste vierge
  }
  if (screen === "files") renderFiles();
}

async function loadProfileStats() {
  loadAchievements();
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
  if (editing === "delete") {
    return [
      el("div", { className: "stub-note warn" }, [
        el("strong", { text: "Delete this file?" }),
        el("br"),
        "Your games, stats, rankings and recovery code will be erased for good."
      ])
    ];
  }
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
  return {
    color: profile.color,
    portrait: avatarUrl(profile.avatar),
    portraitStyle: avatarFit(profile.avatar),
    // Les plus rares d'abord, autant que d'emplacements sur le ticket
    stamps: earnedStamps().slice(0, TICKET_SLOTS.length),
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

function stampElement(stamp, i) {
  const slot = TICKET_SLOTS[i];
  const style = `left: ${slot.x}%; top: ${slot.y}%; width: ${slot.size}%; rotate: ${slot.rotate}deg`;
  // Version compacte sur le ticket ; la complète (avec le nom) au survol
  const fresh = this?.fresh?.has(stamp.id);
  const order = fresh ? [...this.fresh].indexOf(stamp.id) : 0;
  const node = el("span", { className: `stamp${fresh ? " fresh" : ""}`, attrs: { style: `${style}${fresh ? `; --stamp-delay: ${0.25 + order * 0.35}s` : ""}`, title: stamp.label } });
  node.innerHTML = `<span class="stamp-small">${stampSvg(stamp, { full: false })}</span><span class="stamp-full">${stampSvg(stamp)}</span>`;
  return node;
}

// Un ticket, à partir de sa description : { portrait, color, stamps, body, stub }
function slotElement(kind, selected) {
  const t = kind === "profile" ? profileSlot() : emptySlot(kind);
  const golden = kind === "profile" && earnedStamps().length === STAMPS.length;
  return ticketElement(t, { selected, empty: kind !== "profile", golden, fresh: kind === "profile" ? freshStamps : null });
}

function ticketElement(t, { selected = false, empty = false, golden = false, fresh = null } = {}) {
  const card = el("div", { className: "card" }, [
    el("div", { className: "shape" }),
    el("div", { className: "stamps" }, (t.stamps ?? []).map(stampElement, { fresh })),
    el("div", { className: "portrait", attrs: { style: `--player-color: ${t.color ?? "#cfd8ef"}` } }, [el("img", { attrs: { src: t.portrait, alt: "", style: t.portraitStyle ?? "" } })]),
    el("span", { className: "tape tl" }),
    el("span", { className: "tape br" }),
    el("div", { className: "body" }, t.body)
  ]);
  const children = t.stub ? [el("div", { className: "stub" }, [el("div", { className: "shape" }), ...t.stub]), card] : [card];
  // Tous les tampons : le ticket devient doré, comme une sauvegarde à 100 % dans le jeu
  return el("div", { className: `slot${selected ? " selected" : ""}${t.stub ? " has-stub" : ""}${empty ? " empty" : ""}${golden ? " golden" : ""}` }, children);
}

// ===== Fiche d'un autre joueur (clic dans un classement du journal) =====
// Son ticket, comme le nôtre : fraises, tampons, série, chutes, meilleur temps.
let playerCard = null;
const playerCardOpen = () => Boolean(playerCard && !playerCard.hidden);

function closePlayerCard() {
  if (playerCard) playerCard.hidden = true;
}

async function openPlayerCard(id) {
  let card;
  try {
    card = await api.playerCard(id);
  } catch {
    showToast("This climber's file is private.");
    return;
  }
  if (!playerCard) {
    playerCard = el("div", { attrs: { id: "player-card", role: "dialog", "aria-modal": "true", "aria-label": "Climber's file" } });
    playerCard.addEventListener("click", closePlayerCard);
    document.body.append(playerCard);
  }
  const stamps = STAMPS.filter((s) => card.stamps.includes(s.id));
  const ticket = ticketElement(
    {
      color: card.player.color,
      portrait: avatarUrl(card.player.avatar),
      portraitStyle: avatarFit(card.player.avatar),
      stamps: stamps.slice(0, TICKET_SLOTS.length),
      body: [
        el("div", { className: "name", text: card.player.name }),
        el("div", { className: "sub", text: `${stamps.length} / ${STAMPS.length} stamps` }),
        counter(`${ICON}/strawberry.png`, card.wins, "Wins")
      ],
      stub: [
        el("div", {}),
        el("div", { className: "streak", attrs: { title: "Current streak" } }, [img("assets/illustration/goldflag.png"), String(card.streak)]),
        el("div", { className: "stub-bottom" }, [
          counter(`${ICON}/skull.png`, card.falls, "Losses and forfeits"),
          el("span", { className: "best", attrs: { title: "Best time" }, text: card.bestTime !== null ? formatDuration(card.bestTime) : "--:--" })
        ])
      ]
    },
    { selected: true, golden: stamps.length === STAMPS.length }
  );
  clear(playerCard);
  playerCard.append(el("div", { className: "slots" }, [ticket]), el("p", { className: "player-card-hint", text: "Click anywhere to close" }));
  playerCard.hidden = false;
}

let freshTimer = null;
function renderFiles() {
  // Tampons neufs : un coup de tampon chacun, puis on n'y revient plus
  if (screen === "files" && freshStamps.size && !freshTimer) {
    [...freshStamps].forEach((_, i) => setTimeout(() => playSound("stamp"), 250 + i * 350 + 180));
    freshTimer = setTimeout(() => {
      freshStamps.clear();
      freshTimer = null;
    }, 600 + freshStamps.size * 350);
  }
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
      const li = el("li", { className: `${a === actionIndex ? "selected hl" : ""}${action.danger ? " danger" : ""}`, text: action.label });
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
    icon: "assets/entities/winged-strawberry.png",
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
    icon: "assets/entities/summit-gems.png",
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
    icon: "assets/entities/refill.png",
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
  // Drapeaux sur la montagne : seulement pour les jeux accessibles
  document.body.dataset.games = games.map((g) => g.id).join(" ");
  const last = games.findIndex((g) => g.id === storage.get(LAST_GAME_KEY));
  gameIndex = last >= 0 ? last : 0;
  if (screen === "modes") renderModes();
  loadTodayMarks();
}

function selectGame(index) {
  gameIndex = (index + games.length) % games.length;
  storage.set(LAST_GAME_KEY, games[gameIndex].id);
  renderModes();
  updateTitle();
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
  byId("climb").textContent = "Climb";
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
  // Partie du jour finie : le bouton mène au résultat
  byId("climb").textContent = ["won", "lost", "forfeit"].includes(status) ? "View result" : state?.startedAt ? "Continue" : "Climb";
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

// Au survol (ou au focus) de Climb, le navigateur va déjà chercher la page
// du jeu : le passage est plus rapide.
const prefetched = new Set();
function prefetchGame() {
  const page = games[gameIndex]?.page;
  if (!page || prefetched.has(page)) return;
  prefetched.add(page);
  document.head.append(el("link", { attrs: { rel: "prefetch", href: page } }));
}

// ===== Carte postale d'accueil =====
// Comme les cartes postales qui ouvrent les chapitres du jeu : montrée une
// fois, en quittant l'écran titre, puis on arrive sur les fichiers.
function leaveTitle() {
  if (storage.get(KEYS.welcomeSeen)) return go("files");
  byId("postcard").hidden = false;
  byId("postcard-close").focus();
}

function closePostcard() {
  storage.set(KEYS.welcomeSeen, "true");
  byId("postcard").hidden = true;
  go("files");
}

const postcardOpen = () => !byId("postcard").hidden;

// API injoignable : même carte postale, avec un bouton pour réessayer
setUnavailableHandler(() => {
  byId("api-down").hidden = false;
  byId("api-down-retry").focus();
});

// ===== Signalement de bug (fenêtre de la page de jeu, ouverte ici) =====
function openReport() {
  openPanel("reports").catch((err) => showToast(err.message));
}

// ===== Journal (js/journal.js) =====
const journal = createJournal({ getContext: () => ({ games, gameIndex, side }), onPlayer: openPlayerCard });
const journalOpen = () => journal.isOpen();
function openJournal() {
  journal.open();
  updateTitle();
}
function closeJournal() {
  journal.close();
  updateTitle();
  // Le focus revient au bouton qui a ouvert le carnet
  byId("to-journal").focus({ preventScroll: true });
}

// ===== Options =====
// Chaque préférence : un libellé et une valeur qu'on fait défiler avec ◂ ▸.
// Mêmes clés que options.js : le choix fait ici vaut aussi dans les jeux.
const OPTION_ROWS = [
  { label: "Modern game pages", key: KEYS.modernUi, fallback: true },
  { label: "Celeste theme", key: KEYS.celesteTheme, fallback: true },
  { label: "Show timer", key: KEYS.showTimer, fallback: true },
  { label: "Bird cursor", key: KEYS.customCursor, fallback: true, apply: applyCursor },
  { label: "Colorblind mode", key: KEYS.colorblind, fallback: false },
  // Coupe les animations de décor et raccourcit les mouvements (celeste-ui.css)
  // Ciel : suit l'heure (Auto) ou reste fixe
  { label: "Sky", key: KEYS.timeSky, choices: SKY_CHOICES, current: skySetting, apply: applySky },
  { label: "Keyboard hints", key: KEYS.keyHints, fallback: true, apply: renderHints },
  // Petits sons de menu (js/sound.js), coupés par défaut
  { label: "Sounds", key: KEYS.sounds, fallback: false, apply: (on) => on && playSound("confirm") },
  { label: "Performance mode", key: KEYS.performance, fallback: false, apply: applyPerformance },
  { sep: true },
  { label: "Report a bug", run: () => openReport() },
  { label: "Discord", link: "https://discord.gg/3yqgMbuMbX", external: true },
  { label: "GitHub", link: "https://github.com/Ildyia/celestedle", external: true },
  { label: "Support on Ko-fi", link: "https://ko-fi.com/ildyia", external: true },
  { sep: true },
  // Accès à l'administration : visible de l'équipe seulement
  { label: "Admin", link: "admin.html", visible: () => ["owner", "administrator"].includes(player.profile?.role) },
  { label: "Credits", link: "credits.html" },
  { label: "Legal notice", link: "legal-notice.html" },
  { label: "Back", back: true }
];
let optionIndex = 0;
// Lignes affichées (certaines dépendent du profil) ; optionIndex s'y réfère
const optionRows = () => OPTION_ROWS.filter((row) => !row.visible || row.visible());

function renderOptions() {
  const menu = byId("menu");
  clear(menu);
  optionRows().forEach((row, i) => {
    if (row.sep) {
      menu.append(el("li", { className: "sep" }));
      return;
    }
    const children = [el("span", { text: row.label })];
    if (row.choices) children.push(el("span", { className: "value", text: row.choices.find(([id]) => id === row.current())[1] }));
    else if (row.key) children.push(el("span", { className: "value", text: storage.getBool(row.key, row.fallback) ? "On" : "Off" }));
    const li = el("li", { className: i === optionIndex ? "selected hl" : "" }, children);
    li.addEventListener("click", () => {
      optionIndex = i;
      activateOption();
    });
    menu.append(li);
  });
  // Petit écran : la ligne choisie reste visible quand la liste défile
  menu.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function moveOption(step) {
  do {
    optionIndex = (optionIndex + step + optionRows().length) % optionRows().length;
  } while (optionRows()[optionIndex].sep);
  renderOptions();
}

function activateOption(step = 1) {
  const row = optionRows()[optionIndex];
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
  if (row.choices) {
    // Liste de valeurs : on passe à la suivante (ou la précédente avec ←)
    const at = row.choices.findIndex(([id]) => id === row.current());
    storage.set(row.key, row.choices[(at + step + row.choices.length) % row.choices.length][0]);
    row.apply?.();
  } else {
    const on = !storage.getBool(row.key, row.fallback);
    storage.set(row.key, String(on));
    row.apply?.(on);
  }
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
  title: { Enter: leaveTitle, " ": leaveTitle },
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
    ArrowLeft: () => optionRows()[optionIndex].key && activateOption(-1),
    ArrowRight: () => optionRows()[optionIndex].key && activateOption(),
    Enter: () => activateOption(),
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
  if (!byId("api-down").hidden) return;
  if (postcardOpen()) {
    if (["Enter", " ", "Escape"].includes(event.key)) {
      event.preventDefault();
      closePostcard();
    }
    return;
  }
  if (playerCardOpen()) {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      playSound("back");
      closePlayerCard();
    }
    return;
  }
  if (journalOpen()) {
    keySound(event.key);
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
  keySound(event.key);
  handler();
});

// ===== Souris et toucher =====
byId("title").addEventListener("click", leaveTitle);
byId("postcard-close").addEventListener("click", closePostcard);
byId("api-down-retry").addEventListener("click", () => location.reload());
byId("climb").addEventListener("click", climb);
for (const type of ["pointerenter", "focus", "touchstart"]) byId("climb").addEventListener(type, prefetchGame, { passive: true });

// Glisser du doigt : ← → change de jeu, ou tourne les pages du carnet
function onSwipe(node, handler) {
  let from = null;
  node.addEventListener("touchstart", (e) => (from = e.touches.length === 1 ? e.touches[0] : null), { passive: true });
  node.addEventListener("touchend", (e) => {
    if (!from) return;
    const dx = e.changedTouches[0].clientX - from.clientX;
    const dy = e.changedTouches[0].clientY - from.clientY;
    from = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) handler(dx < 0 ? 1 : -1);
  });
}
onSwipe(byId("modes"), (step) => games.length > 1 && selectGame(gameIndex + step));
onSwipe(byId("journal"), (step) => journal.flip(step));
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

// ===== Maquette des chapitres (js/chapters.js) =====
// menu.html?chapter=3&berries=14 : sentier sur la montagne et avancée dans le livre
function showChapterPreview() {
  const preview = previewChapter();
  if (!preview) return;
  document.querySelector(".mountain-art").insertAdjacentHTML("beforeend", trailSvg(preview.chapter));
  const progress = chapterProgress(preview);
  byId("book-climb").hidden = false;
  byId("book-climb-title").textContent = progress.title;
  byId("book-climb-text").textContent = progress.text;
  byId("book-climb-bar").style.width = `${progress.ratio * 100}%`;
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
    showToast("A new day on the mountain: today's climbs are ready!");
    loadTodayMarks();
    if (screen === "modes") renderModes();
  });
  api.version().then(({ version }) => (byId("version").textContent = `v${version}`)).catch(() => {});
  player.onChange(() => {
    loadProfileStats();
    loadGames();
  });
  showChapterPreview();
  await player.load();
  // Sans jeton, player.load ne prévient pas : on charge quand même les jeux
  if (!player.profile) loadGames();
  // Retour d'une page de jeu (menu.html#modes) : droit au choix du jeu, sans
  // repasser par l'écran titre
  // Lien « menu.html?player=… » des classements des pages de jeu
  const wanted = new URLSearchParams(location.search).get("player");
  if (wanted) openPlayerCard(wanted);
  if (location.hash === "#modes" && player.profile && screen === "title") {
    history.replaceState(null, "", location.pathname + location.search);
    go("modes");
  }
}

start();
