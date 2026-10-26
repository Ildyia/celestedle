import { api, ApiError, spriteUrl } from "./api.js";
import { el, byId, clear, bindModalClosing, openModal, closeModal } from "./dom.js";
import { capitalize, formatDuration } from "./format.js";
import { player } from "./player.js";
import { initOptions } from "./options.js";
import { storage } from "./storage.js";
import { showToast } from "./toast.js";
import { avatarUrl } from "./profile.js";

// Connections : 16 éléments à ranger en 4 groupes de 4. Le serveur garde la
// grille et ne révèle un groupe qu'une fois trouvé.
const SHARE_EMOJI = ["🟨", "🟩", "🟦", "🟪"];
const KIND_LABELS = { type: "Type", colour: "Colour", shape: "Shape", chapter: "Chapter", tag: "Tag" };
const SITE_URL = "https://celestedle.vercel.app/connections.html";
const SHARE_LEGEND = "One row per guess, one colour per group";
const MODE_KEY = "celestedle_cx_mode";
// Marques de couleur du mode Hard : { [gridId]: { [nom]: 0..3 } }, dans ce navigateur seulement
const MARKS_KEY = "celestedle_cx_marks";
const MARK_COUNT = 4;
const FEEDBACK_MS = 4000;
const MODE_NOTES = {
  normal: "Normal: every group is clear-cut, no decoy groups.",
  hard: "Hard: decoy groups are allowed (4 tiles can look like a group and not be one). Mark tiles with colours to plan ahead."
};

class ConnectionsGame {
  constructor() {
    this.state = null;
    this.order = []; // ordre d'affichage des cases restantes (mélange local)
    this.selected = new Set();
    this.busy = false;
    this.practice = false;
    this.mode = storage.get(MODE_KEY) === "hard" ? "hard" : "normal";
    this.paint = null; // couleur de marque active (mode Hard), null = sélection
    this.marks = {};

    document.querySelectorAll("[data-cx-mode]").forEach((btn) =>
      btn.addEventListener("click", () => this.setMode(btn.dataset.cxMode))
    );
    document.querySelectorAll("[data-cx-mark]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const mark = Number(btn.dataset.cxMark);
        this.paint = this.paint === mark ? null : mark;
        this.renderGrid();
      })
    );
    byId("cx-unmark-btn").addEventListener("click", () => {
      this.marks = {};
      this.saveMarks();
      this.renderGrid();
    });
    document.querySelectorAll("[data-cx-grid]").forEach((btn) =>
      btn.addEventListener("click", () => this.setPractice(btn.dataset.cxGrid === "practice"))
    );
    byId("cx-new-btn").addEventListener("click", () => this.newPractice());
    byId("cx-shuffle-btn").addEventListener("click", () => this.shuffle());
    byId("cx-clear-btn").addEventListener("click", () => {
      this.selected.clear();
      this.renderGrid();
    });
    byId("cx-submit-btn").addEventListener("click", () => this.submit());
    byId("cx-share-btn").addEventListener("click", () => this.share());
  }

  async setMode(mode) {
    if (mode === this.mode || this.busy) return;
    this.mode = mode;
    storage.set(MODE_KEY, mode);
    this.resetLocal();
    await this.load();
  }

  async setPractice(practice) {
    if (practice === this.practice || this.busy) return;
    this.practice = practice;
    this.resetLocal();
    await this.load();
  }

  // Ordre, sélection et pinceau propres à la grille affichée
  resetLocal() {
    this.order = [];
    this.selected.clear();
    this.paint = null;
  }

  loadMarks() {
    this.marks = storage.getJson(MARKS_KEY, {})[this.state.gridId] ?? {};
  }

  // Une seule grille par mode et par type gardée : les anciennes marques partent
  saveMarks() {
    const all = storage.getJson(MARKS_KEY, {});
    const prefix = this.state.gridId.split("#")[0];
    const kept = Object.fromEntries(Object.entries(all).filter(([id]) => id.split("#")[0] !== prefix));
    if (Object.keys(this.marks).length) kept[this.state.gridId] = this.marks;
    storage.setJson(MARKS_KEY, kept);
  }

  // Grille d'entraînement : nouvelle grille, la partie repart de zéro
  async newPractice() {
    if (this.busy) return;
    this.busy = true;
    try {
      const state = await api.connectionsNewPractice(this.mode);
      this.resetLocal();
      this.busy = false;
      this.render(state);
    } catch (err) {
      this.busy = false;
      showToast(err.message);
    }
  }

  async load() {
    try {
      this.render(await api.connections(this.mode, this.practice));
      byId("cx-game").hidden = false;
      byId("cx-suggest-btn").hidden = false;
      this.loadBoard();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        byId("cx-locked").hidden = false;
        return;
      }
      showToast(err.message);
    }
  }

  render(state) {
    this.state = state;
    this.loadMarks();
    document.querySelectorAll("[data-cx-mode]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.cxMode === this.mode))
    );
    byId("cx-mode-note").textContent = MODE_NOTES[this.mode];
    document.querySelectorAll("[data-cx-grid]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String((btn.dataset.cxGrid === "practice") === this.practice))
    );
    byId("cx-new-btn").hidden = !this.practice;
    byId("cx-practice-note").hidden = !this.practice;
    byId("cx-board-panel").hidden = this.practice;
    const names = state.tiles.map((t) => t.nom);
    // On garde l'ordre choisi par le joueur pour les cases encore en jeu
    this.order = [...this.order.filter((n) => names.includes(n)), ...names.filter((n) => !this.order.includes(n))];
    for (const name of this.selected) if (!names.includes(name)) this.selected.delete(name);

    this.renderGroups(byId("cx-found"), state.found);
    this.renderGrid();
    this.renderMistakes();
    this.renderEnd();
  }

  renderGroups(container, groups) {
    clear(container);
    container.append(
      ...groups.map((group) =>
        el("div", { className: `cx-group level-${group.level}` }, [
          el("p", { className: "cx-group-label" }, [
            el("strong", { text: group.label }),
            el("span", { className: "cx-group-kind", text: KIND_LABELS[group.kind] ?? "" })
          ]),
          el("p", { className: "cx-group-members", text: group.members.map((m) => capitalize(m.nom)).join(", ") })
        ])
      )
    );
  }

  renderGrid() {
    const grid = byId("cx-grid");
    const playing = this.state.status === "playing";
    const canPaint = playing && this.mode === "hard";
    if (!canPaint) this.paint = null;
    clear(grid);
    grid.hidden = !playing;
    grid.classList.toggle("painting", this.paint !== null);
    grid.append(
      ...this.order.map((name) =>
        el(
          "button",
          {
            className: `cx-tile${this.marks[name] !== undefined ? ` mark-${this.marks[name]}` : ""}`,
            attrs: { type: "button", "aria-pressed": String(this.selected.has(name)) },
            on: { click: () => (this.paint === null ? this.toggle(name) : this.mark(name)) }
          },
          [
            el("img", { className: "pixelated", attrs: { src: spriteUrl(name), alt: "" } }),
            el("span", { text: capitalize(name) })
          ]
        )
      )
    );
    byId("cx-controls").hidden = !playing;
    byId("cx-submit-btn").disabled = this.selected.size !== 4 || this.busy;

    byId("cx-paint").hidden = !canPaint;
    byId("cx-paint-help").hidden = !canPaint;
    const counts = Array.from({ length: MARK_COUNT }, (_, i) => this.order.filter((n) => this.marks[n] === i).length);
    document.querySelectorAll("[data-cx-mark]").forEach((btn) => {
      const mark = Number(btn.dataset.cxMark);
      btn.setAttribute("aria-pressed", String(this.paint === mark));
      btn.textContent = counts[mark] ? String(counts[mark]) : "";
    });
  }

  // Mode Hard : la marque ne part pas au serveur, elle aide seulement à prévoir
  mark(name) {
    if (this.marks[name] === this.paint) delete this.marks[name];
    else this.marks[name] = this.paint;
    this.saveMarks();
    this.renderGrid();
  }

  renderMistakes() {
    const { mistakes, maxMistakes, status } = this.state;
    const left = Math.max(0, maxMistakes - mistakes);
    byId("cx-mistake-dots").replaceChildren(
      ...Array.from({ length: maxMistakes }, (_, i) => el("span", { className: `cx-dot${i < left ? "" : " used"}` })),
      el("span", { className: "visually-hidden", text: `${left} of ${maxMistakes}` })
    );
    byId("cx-mistake-dots").parentElement.hidden = status !== "playing";
  }

  renderEnd() {
    const { status, solution, mistakes, elapsedSeconds } = this.state;
    byId("cx-end").hidden = status === "playing";
    if (status === "playing") return;
    byId("cx-end-title").textContent = status === "won" ? "Well done! 🍓" : "Out of mistakes! ❌";
    byId("cx-end-text").textContent =
      status === "won"
        ? `All 4 groups found with ${mistakes} mistake${mistakes === 1 ? "" : "s"}, in ${formatDuration(elapsedSeconds)}.`
        : this.practice
          ? "Here were the groups. Draw a new grid to try again."
          : "Here were today's groups. A new grid comes at midnight (Paris time).";
    this.renderGroups(byId("cx-solution"), status === "won" ? [] : solution);
  }

  toggle(name) {
    if (this.selected.has(name)) this.selected.delete(name);
    else if (this.selected.size < 4) this.selected.add(name);
    this.renderGrid();
  }

  shuffle() {
    const order = [...this.order];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.order = order;
    this.renderGrid();
  }

  async submit() {
    if (this.selected.size !== 4 || this.busy) return;
    this.busy = true;
    try {
      await player.ensure();
      const { result, state } = await api.connectionsGuess([...this.selected], this.mode, this.practice, this.state.gridId);
      if (result === "correct") this.selected.clear();
      // Plus long que les messages par défaut (2,4 s) : on a le temps de le lire
      if (result === "one_away") showToast("One away…", FEEDBACK_MS);
      if (result === "wrong") showToast("Not a group.", FEEDBACK_MS);
      if (result !== "correct") byId("cx-grid").classList.add("shake");
      setTimeout(() => byId("cx-grid").classList.remove("shake"), 400);
      this.busy = false;
      this.render(state);
      if (state.status !== "playing" && !this.practice) this.loadBoard();
    } catch (err) {
      this.busy = false;
      showToast(err.message, FEEDBACK_MS);
      // Nouvelle grille (minuit passé, grille régénérée) : on l'affiche
      if (err instanceof ApiError && err.details?.gridChanged) {
        this.resetLocal();
        await this.load();
        return;
      }
      this.renderGrid();
    }
  }

  async loadBoard() {
    try {
      const { top } = await api.connectionsBoard(this.mode);
      const body = byId("cx-board");
      clear(body);
      if (top.length === 0) {
        body.append(el("tr", {}, [el("td", { text: "Nobody has solved today's grid yet.", attrs: { colspan: 4 } })]));
        return;
      }
      body.append(
        ...top.map((entry) =>
          el("tr", { className: entry.isMe ? "is-me" : "" }, [
            el("td", { className: "board-rank", text: `#${entry.rank}` }),
            el("td", {}, [
              el("span", { className: "board-player", attrs: { style: `--player-color: ${entry.player.color}` } }, [
                el("img", { attrs: { src: avatarUrl(entry.player.avatar), alt: "" } }),
                el("span", { text: entry.player.name })
              ])
            ]),
            el("td", { className: "board-num", text: String(entry.mistakes) }),
            el("td", { className: "board-num", text: formatDuration(entry.seconds) })
          ])
        )
      );
    } catch {
      // classement secondaire
    }
  }

  async share() {
    const { status, attempts, mistakes, date } = this.state;
    const outcome = status === "won" ? `solved with ${mistakes} mistake${mistakes === 1 ? "" : "s"}` : "not solved";
    const grid = attempts.map((levels) => levels.map((level) => SHARE_EMOJI[level]).join("")).join("\n");
    const name = `Celestedle Connections${this.mode === "hard" ? " Hard" : ""}`;
    const title = this.state.practice ? `${name} (practice)` : `${name} ${date}`;
    const text = `${title}: ${outcome}\n\n${grid}\n${SHARE_LEGEND}\n\n${SITE_URL}`;
    try {
      await navigator.clipboard.writeText(text);
      byId("cx-share-btn").textContent = "Copied!";
    } catch {
      byId("cx-share-btn").textContent = "Copy failed";
    }
    setTimeout(() => (byId("cx-share-btn").textContent = "Share"), 2000);
  }
}

// Idée de tag envoyée à l'équipe admin
async function sendSuggestion(e) {
  e.preventDefault();
  const button = byId("cx-suggest-submit");
  button.disabled = true;
  try {
    await api.connectionsSuggestTag({
      label: byId("cx-suggest-label").value.trim(),
      elements: byId("cx-suggest-elements").value.trim(),
      note: byId("cx-suggest-note").value.trim()
    });
    byId("cx-suggest-form").reset();
    closeModal("cx-suggest-modal");
    showToast("Thanks! The team will look at your idea.", FEEDBACK_MS);
  } catch (err) {
    showToast(err.message, FEEDBACK_MS);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  bindModalClosing();
  byId("cx-rules-btn").addEventListener("click", () => openModal("cx-rules-modal"));
  byId("cx-suggest-btn").addEventListener("click", () => {
    openModal("cx-suggest-modal");
    byId("cx-suggest-label").focus();
  });
  byId("cx-suggest-form").addEventListener("submit", sendSuggestion);
  initOptions();
  await player.load();
  await new ConnectionsGame().load();
}

document.addEventListener("DOMContentLoaded", init);
