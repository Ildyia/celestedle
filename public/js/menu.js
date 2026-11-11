// Page d'accueil façon menus de Celeste : titre → fichier (profil) → modes → jeu.
// Squelette : la navigation entre écrans est en place, le contenu est à brancher
// (chaque TODO dit quoi et où). Voir REDESIGN.md pour l'ordre conseillé.
//
// Règle : ce fichier AFFICHE, il ne réinvente rien. Les appels au serveur
// passent par api.js, le profil par player.js, les préférences par storage.js.

import { api } from "./api.js";
import { player } from "./player.js";
import { storage, KEYS } from "./storage.js";
import { byId, el, clear } from "./dom.js";
import { showToast } from "./toast.js";

// ===== Écrans =====
// L'écran affiché est donné par body[data-screen] (le CSS fait le reste,
// y compris le zoom de la montagne).
const SCREENS = ["title", "files", "modes", "options"];
let screen = "title";
// Écran d'où l'on vient, pour « Back » depuis les options
let previous = "title";

function go(next) {
  if (!SCREENS.includes(next)) return;
  previous = screen;
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
// Trois emplacements : le profil de ce navigateur, « New file », « Restore ».
// TODO : let slotIndex = 0; (emplacement sélectionné, pour ↑↓ et le clic)

function renderFiles() {
  const slots = byId("slots");
  clear(slots);
  // TODO : 1er emplacement = player.profile (nom, avatar via avatarUrl() de
  //   profile.js, victoires, série, temps). Sans profil : « New file ».
  // TODO : stats du profil : api.myStats(mode) pour chaque mode utile.
  // TODO : actions sous le ticket sélectionné :
  //   Begin → go("modes")
  //   Rename → player.update({ name })
  //   Recovery code → afficher player.token (comme le panneau profil actuel)
  //   New file → player.ensure() ; Restore → player.restore(code)
  slots.append(el("div", { className: "slot paper selected", text: "TODO: profile slot" }));
}

// ===== Modes (sélection de chapitre) =====
// Un jeu = une icône ; A-Side = Normal, B-Side = Hard.
// TODO : n'afficher Connections et Techs que si api.connectionsAccess() /
//   api.techsAccess() renvoient canPlay (même logique que game-tabs.js).
const GAMES = [
  { id: "celestedle", title: "Celestedle", icon: "assets/entities/madeline.png", page: "index.html" },
  { id: "connections", title: "Connections", icon: "assets/illustration/strawberry.png", page: "connections.html" },
  { id: "techs", title: "Techs", icon: "assets/illustration/feather.png", page: "techs.html" }
];
let gameIndex = 0;
let side = "a";

function renderModes() {
  const icons = byId("icons");
  clear(icons);
  GAMES.forEach((game, i) => {
    const icon = el("div", { className: `icon${i === gameIndex ? " selected" : ""}` }, [el("img", { attrs: { src: game.icon, alt: "" } })]);
    icon.addEventListener("click", () => {
      gameIndex = i;
      renderModes();
    });
    icons.append(icon);
  });

  const game = GAMES[gameIndex];
  byId("mode-label").textContent = game.title;
  byId("book-title").textContent = game.title;
  byId("book-chapter").textContent = side === "a" ? "A-SIDE · NORMAL" : "B-SIDE · HARD";
  // TODO : description courte de chaque jeu et mode (reprendre rules-text.js)
  byId("book-desc").textContent = "";
  // TODO : record du joueur dans ce mode (api.myStats) : victoires, série, meilleur essai
  clear(byId("book-record"));
  // TODO : bandeau « déjà joué aujourd'hui » si la partie du jour est finie (api.game(mode))

  for (const tab of byId("tabs").children) tab.classList.toggle("active", tab.dataset.side === side);
  byId("climb").className = `climb ${side}`;
}

function climb() {
  // Les trois pages de jeu lisent le même réglage KEYS.mode ("normal" ou
  // "hard") au chargement : il suffit de l'écrire avant d'y aller.
  storage.set(KEYS.mode, side === "a" ? "normal" : "hard");
  location.href = GAMES[gameIndex].page;
}

// ===== Options =====
// Chaque ligne : un libellé et une valeur qu'on fait défiler avec ◂ ▸.
// TODO : brancher sur les vraies préférences. options.js les applique via des
//   cases à cocher de index.html : soit en exporter OPTIONS pour le réutiliser
//   ici, soit lire/écrire storage directement avec les mêmes KEYS.
const OPTION_ROWS = [
  { label: "Celeste theme", key: KEYS.celesteTheme, fallback: true },
  { label: "Show timer", key: KEYS.showTimer, fallback: true },
  { label: "Bird cursor", key: KEYS.customCursor, fallback: true },
  { label: "Colorblind", key: KEYS.colorblind, fallback: false }
];
let optionIndex = 0;

function renderOptions() {
  const menu = byId("menu");
  clear(menu);
  OPTION_ROWS.forEach((row, i) => {
    const on = storage.getBool(row.key, row.fallback);
    const li = el("li", { className: i === optionIndex ? "selected hl" : "" }, [
      el("span", { text: row.label }),
      el("span", { className: "value", text: on ? "On" : "Off" })
    ]);
    li.addEventListener("click", () => {
      optionIndex = i;
      toggleOption();
    });
    menu.append(li);
  });
  // TODO : lignes « Back » et éventuellement « Credits », « Legal notice »
}

function toggleOption() {
  const row = OPTION_ROWS[optionIndex];
  storage.set(row.key, String(!storage.getBool(row.key, row.fallback)));
  renderOptions();
}

// ===== Aide clavier en bas à droite =====
function renderHints() {
  // TODO : touches selon l'écran (ex. « Enter Confirm · Esc Back · ←→ Change »)
  byId("hints").textContent = "";
}

// ===== Clavier =====
// TODO : flèches ↑↓ (fichiers, options), ←→ (jeux, valeurs d'option),
//   Tab ou A/B (côté), Enter (valider), Esc (retour). Reprendre cycle(),
//   moveOption(), confirm() et back() de la maquette.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (screen === "options") go(previous);
    else if (screen === "modes") go("files");
    else if (screen === "files") go("title");
  }
  if (event.key === "Enter") {
    if (screen === "title") go("files");
    else if (screen === "files") go("modes");
    else if (screen === "modes") climb();
  }
});

// ===== Souris =====
byId("title").addEventListener("click", () => go("files"));
byId("climb").addEventListener("click", climb);
byId("to-options").addEventListener("click", () => go("options"));
byId("to-journal").addEventListener("click", () => showToast("TODO: journal (leaderboard)"));
for (const tab of byId("tabs").children) {
  tab.addEventListener("click", () => {
    side = tab.dataset.side;
    renderModes();
  });
}

// ===== Démarrage =====
async function start() {
  // TODO : neige (créer des .snow dans #scene, comme la maquette)
  try {
    const { version } = await api.version();
    byId("version").textContent = `v${version}`;
  } catch {
    // Serveur injoignable : on garde le menu, sans numéro de version
  }
  await player.load();
  // TODO : si le joueur a déjà un profil, sauter le titre ? (à décider)
  go("title");
}

start();
