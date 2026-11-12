// Interface « Modern » des pages de jeu (voir REDESIGN.md).
// En Modern, la page ne garde que le jeu : tout le reste (profil,
// classements, options, communauté) vit dans le menu (menu.html). On garde
// sous la main, via un menu pause façon Celeste (Échap ou ❚❚) : les règles,
// les options, le changement de côté et le retour au menu.
//
// Tout le style est rangé sous html.ui-modern (modern.css) : sans la classe,
// la page reste exactement la Classic. La classe est posée dès le <head> par
// un petit script (pas d'éclair au chargement) ; ce module l'ajoute ou la
// retire quand l'option change et construit le décor et le menu pause.
import { el, clear } from "./dom.js";
import { storage, KEYS } from "./storage.js";
import { startSky } from "./sky.js";
import { player } from "./player.js";

const SIDES = { normal: "A-Side · Normal", hard: "B-Side · Hard" };

// Actions de la page, selon ce qu'elle propose (Celestedle et Techs ont des
// fenêtres Rankings et Options ; Connections a son classement dans la page)
function findAction(name) {
  const byIds = (...ids) => ids.map((id) => document.getElementById(id)).find(Boolean);
  if (name === "rules") {
    const btn = byIds("rules-btn", "cx-rules-btn");
    return btn && (() => btn.click());
  }
  if (name === "rankings") {
    const btn = byIds("leaderboard-btn");
    if (btn) return () => btn.click();
    const panel = byIds("cx-board-panel");
    return panel && (() => panel.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  if (name === "options") {
    const btn = byIds("options-btn");
    return btn && (() => btn.click());
  }
  return null;
}

// Nom du jeu de la page : l'onglet courant (« Celestedle », « Connections »…)
function gameName() {
  return document.querySelector(".game-tab[aria-current='page'] span")?.textContent.trim() ?? "Celestedle";
}

const isAdmin = (profile) => ["owner", "administrator"].includes(profile?.role);
let pause = null;

function currentMode() {
  return document.querySelector("#mode-switch [aria-pressed='true']")?.dataset.mode ?? "normal";
}

// Montagne du menu avec son drapeau au sommet (mêmes coordonnées que
// menu.html : viewBox du dessin 1600 × 700)
function mountain() {
  const wrap = el("div", { className: "m-mountain" }, [
    el("img", { attrs: { src: "assets/menu/mountain.png", alt: "", decoding: "async" } })
  ]);
  wrap.insertAdjacentHTML(
    "beforeend",
    `<svg class="m-flag" viewBox="896 164 58 92"><line x1="900" y1="252" x2="900" y2="168" stroke="#16142f" stroke-width="4" stroke-linecap="round" /><rect class="m-cloth" x="902" y="170" width="46" height="28" /></svg>`
  );
  return wrap;
}

// Règles : en Modern, chaque rubrique (un h4 et ce qui le suit) devient une
// fiche avec son icône. Les nœuds sont déplacés, pas recréés : le texte
// rempli par rules-text.js (data-rules-*) reste à jour.
const RULE_ICONS = {
  type: "backpack",
  chapter: "normalflag",
  colour: "paint",
  shape: "variant",
  "colour indicators": "eye",
  hints: "assist",
  "hard mode": "skull",
  rankings: "goldflag",
  columns: "backpack",
  "normal and hard": "skull",
  "normal or hard": "skull",
  "what makes a group": "pico8",
  "when it's not a group": "wtf"
};

function structureRules() {
  const box = document.querySelector("#rules-modal .rules-content-static, #cx-rules-modal .rules-content-static");
  if (!box || box.dataset.structured) return;
  box.dataset.structured = "true";
  const grid = el("div", { className: "m-rules-grid" });
  let section = null;
  for (const node of [...box.children]) {
    if (node.tagName === "H4") {
      const icon = RULE_ICONS[node.textContent.trim().toLowerCase()];
      section = el("section", { className: "m-rule" });
      if (icon) node.prepend(el("img", { attrs: { src: `assets/illustration/${icon}.png`, alt: "" } }));
      grid.append(section);
    }
    if (section) section.append(node);
  }
  box.append(grid);
}

function buildDecor() {
  const scene = el("div", { attrs: { id: "modern-scene", "aria-hidden": "true" } }, [
    el("div", { className: "m-stars" }),
    el("div", { className: "m-moon" }, [el("span", { className: "m-moon-glow" }), el("span", { className: "m-moon-body" })]),
    mountain()
  ]);
  // Règles et classement restent à un clic : ils ouvrent les fenêtres de la
  // page (boutons Classic masqués, mais toujours là)
  const shortcut = (action, icon, label) => {
    const run = findAction(action);
    if (!run) return null;
    return el("button", { attrs: { type: "button", "aria-label": label }, on: { click: run } }, [
      el("img", { attrs: { src: `assets/illustration/${icon}.png`, alt: "" } }),
      el("span", { className: "m-label", text: label })
    ]);
  };
  // Lien Admin, visible de l'équipe seulement
  const admin = el("a", { attrs: { href: "admin.html", hidden: "" } }, [el("span", { text: "🛠" }), el("span", { className: "m-label", text: "Admin" })]);
  const showAdmin = (profile) => (admin.hidden = !isAdmin(profile));
  showAdmin(player.profile);
  player.onChange(showAdmin);
  const nav = el("nav", { attrs: { id: "modern-nav", "aria-label": "Menu" } }, [
    el("a", { attrs: { href: "menu.html" } }, [el("span", { text: "◂" }), el("span", { className: "m-label", text: "Menu" })]),
    el("button", { attrs: { type: "button", "aria-label": "Pause" }, on: { click: openPause } }, [
      el("span", { className: "m-pause-icon", text: "❚❚" }),
      el("span", { className: "m-label", text: "Pause" })
    ]),
    el("span", { className: "m-gap" }),
    admin,
    shortcut("rules", "journal", "Rules"),
    shortcut("rankings", "goldflag", "Rankings")
  ].filter(Boolean));
  const hint = el("div", { attrs: { id: "modern-hint", "aria-hidden": "true" } }, [el("b", { text: "Esc" }), "Pause"]);
  document.body.prepend(scene, nav);
  document.body.append(hint);

  // Côté joué (A-Side / B-Side) sous le titre, tenu à jour
  const title = document.querySelector("#main-content-column h1");
  if (title) {
    // Le titre devient le nom du jeu (le Classic affiche « Celestedle » partout)
    title.dataset.classicTitle = title.textContent;
    title.textContent = gameName();
    const side = el("p", { attrs: { id: "modern-side" } });
    title.after(side);
    const update = () => {
      const mode = currentMode();
      side.textContent = SIDES[mode] ?? mode;
      side.dataset.mode = mode;
    };
    update();
    const switcher = document.getElementById("mode-switch");
    if (switcher) new MutationObserver(update).observe(switcher, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
  }
  document.addEventListener("keydown", onKey, true);
}

// ===== Menu pause =====
function pauseItems() {
  const other = currentMode() === "hard" ? "normal" : "hard";
  const item = (label, action) => {
    const run = findAction(action);
    return run && { label, run: () => (closePause(), run()) };
  };
  return [
    { label: "Resume", run: closePause },
    item("Rules", "rules"),
    item("Rankings", "rankings"),
    item("Options", "options"),
    {
      label: `Switch to ${other === "hard" ? "B-Side" : "A-Side"}`,
      run: () => {
        closePause();
        document.querySelector(`#mode-switch [data-mode='${other}']`)?.click();
      }
    },
    { label: "Return to menu", run: () => (location.href = "menu.html") }
  ].filter(Boolean);
}

function renderPause() {
  const list = pause.querySelector("ul");
  clear(list);
  pauseItems().forEach((item, i) => {
    const li = el("li", { className: i === pause.index ? "selected" : "", text: item.label });
    li.addEventListener("click", () => item.run());
    li.addEventListener("mouseenter", () => {
      pause.index = i;
      renderPause();
    });
    list.append(li);
  });
}

function openPause() {
  if (!pause) {
    pause = el("div", { attrs: { id: "modern-pause", role: "dialog", "aria-modal": "true", "aria-label": "Pause" } }, [
      el("h2", { text: "Paused" }),
      el("ul")
    ]);
    pause.addEventListener("click", (e) => {
      if (e.target === pause) closePause();
    });
    document.body.append(pause);
  }
  document.activeElement?.blur?.();
  pause.index = 0;
  pause.hidden = false;
  renderPause();
}

function closePause() {
  if (pause) pause.hidden = true;
}

const isOpen = () => pause && !pause.hidden;

function onKey(event) {
  if (!document.documentElement.classList.contains("ui-modern")) return;
  if (isOpen()) {
    const items = pauseItems();
    const moves = { ArrowUp: -1, ArrowDown: 1 };
    if (event.key in moves) pause.index = (pause.index + moves[event.key] + items.length) % items.length;
    else if (event.key === "Enter") items[pause.index].run();
    else if (event.key === "Escape") closePause();
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (isOpen()) renderPause();
    return;
  }
  if (event.key !== "Escape") return;
  // Échap ferme d'abord une fenêtre ouverte ou la liste de suggestions
  if (document.querySelector(".rules-modal:not(.hidden)")) return;
  if ([...document.querySelectorAll(".suggestions-box")].some((box) => box.style.display === "block")) return;
  event.preventDefault();
  openPause();
}

export function applyInterface(on) {
  document.documentElement.classList.toggle("ui-modern", on);
  document.documentElement.classList.toggle("no-key-hints", !storage.getBool(KEYS.keyHints, true));
  if (on && !document.getElementById("modern-scene")) buildDecor();
  if (on) structureRules();
  if (on) startSky();
  if (!on) closePause();
  const title = document.querySelector("#main-content-column h1");
  if (title?.dataset.classicTitle) title.textContent = on ? gameName() : title.dataset.classicTitle;
}
