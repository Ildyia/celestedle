import { api, ApiError } from "./api.js";
import { el, byId, clear, openModal, closeModal } from "./dom.js";
import { capitalize, formatDuration } from "./format.js";
import { storage, KEYS } from "./storage.js";
import { player } from "./player.js";
import { renderBoard } from "./board.js";
import { renderHints, updateHintButtons } from "./hints.js";
import { GameTimer } from "./game-timer.js";
import { copyShareText } from "./share.js";
import { showToast } from "./toast.js";

const SYNONYMS_USED_KEY = "celestedle_synonyms_used";

// Partie du jour : l'état vient du serveur, la page ne fait que l'afficher
export class Game {
  constructor({ synonyms, suggestions, onFinished }) {
    this.synonyms = synonyms;
    this.suggestions = suggestions;
    this.onFinished = onFinished;
    this.mode = storage.get(KEYS.mode) === "hard" ? "hard" : "normal";
    this.state = null;
    this.busy = false;

    this.nodes = {
      form: byId("guess-form"),
      input: byId("element-input"),
      board: byId("guesses-body"),
      tries: byId("try-count"),
      hints: byId("active-hints-container"),
      message: byId("message-container"),
      hintBtn: byId("hint-btn"),
      giveupBtn: byId("giveup-btn"),
      shareBtn: byId("share-btn"),
      hardRules: byId("hard-rules")
    };
    this.timer = new GameTimer(byId("game-timer-display"));
    this.timer.onExpire = () => this.load();

    this.bindEvents();
  }

  bindEvents() {
    const { form, hintBtn, giveupBtn, shareBtn } = this.nodes;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitGuess(this.nodes.input.value);
    });
    hintBtn.addEventListener("click", () => openModal("hint-modal"));
    document.querySelectorAll("[data-hint-type]").forEach((btn) =>
      btn.addEventListener("click", () => this.useHint(btn.dataset.hintType))
    );
    giveupBtn.addEventListener("click", () => openModal("forfeit-modal"));
    byId("confirm-forfeit-btn")?.addEventListener("click", () => this.forfeit());
    shareBtn.addEventListener("click", () => this.share());
    document.querySelectorAll("[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => this.setMode(btn.dataset.mode))
    );
  }

  async setMode(mode) {
    if (mode === this.mode || this.busy) return;
    this.mode = mode;
    storage.set(KEYS.mode, mode);
    await this.load();
  }

  async load() {
    try {
      const state = await api.game(this.mode);
      this.render(state);
      if (state.reset) {
        showToast("The secret word has been changed by an admin! Your game has been reset.", 4000);
      }
    } catch (err) {
      showToast(err.message);
    }
  }

  // Synonymes tapés par le joueur, pour l'étiquette « Used synonym »
  synonymsUsed() {
    const all = storage.getJson(SYNONYMS_USED_KEY, {});
    return all[`${this.state?.date}:${this.mode}`] || {};
  }

  rememberSynonym(name, typed) {
    const key = `${this.state.date}:${this.mode}`;
    const all = storage.getJson(SYNONYMS_USED_KEY, {});
    const kept = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(this.state.date)));
    kept[key] = { ...(kept[key] || {}), [name]: typed };
    storage.setJson(SYNONYMS_USED_KEY, kept);
  }

  render(state) {
    this.state = state;
    const { nodes } = this;
    const playing = state.status === "playing";
    const hard = state.mode === "hard";

    document.body.classList.toggle("hard-mode", hard);
    document.querySelectorAll("[data-mode]").forEach((btn) =>
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === state.mode))
    );
    nodes.hardRules.hidden = !hard;

    nodes.tries.textContent = state.rules.maxTries ? `${state.tries}/${state.rules.maxTries}` : state.tries;
    renderBoard(nodes.board, state, this.synonymsUsed());
    renderHints(nodes.hints, state.hints);
    updateHintButtons(state);
    this.timer.update(state);
    this.suggestions.setEnabled(state.rules.suggestions && playing);

    nodes.form.hidden = !playing;
    nodes.hintBtn.hidden = !playing;
    nodes.giveupBtn.hidden = !playing;
    nodes.shareBtn.hidden = playing;
    this.renderEndMessage(state);
  }

  renderEndMessage(state) {
    clear(this.nodes.message);
    if (state.status === "playing") return;

    const time = formatDuration(state.elapsedSeconds);
    const hints = `${state.hints.length} hint${state.hints.length === 1 ? "" : "s"}`;
    const answer = el("strong", { text: capitalize(state.solution?.nom) });
    const content = {
      won: {
        className: "win-message",
        title: "GG! Victory! 🎉",
        body: [
          "You found the secret element in ",
          el("strong", { text: String(state.tries) }),
          ` ${state.tries === 1 ? "try" : "tries"} and `,
          el("strong", { text: time }),
          `, with ${hints}.`
        ]
      },
      forfeit: {
        className: "lose-message",
        title: "Nice try... Aba(n)ddon! ❌",
        body: ["You didn't find today's Celestedle! The answer was ", answer, ` (time: ${time}, ${hints}).`]
      },
      lost: {
        className: "lose-message",
        title: state.tries >= (state.rules.maxTries ?? Infinity) ? "Out of tries! ❌" : "Time's up! ⏳",
        body: ["The answer was ", answer, `. Come back tomorrow for a new Hard word.`]
      }
    }[state.status];

    this.nodes.message.append(
      el("div", { className: content.className }, [
        el("h2", { text: content.title }),
        el("div", {}, content.body)
      ])
    );
  }

  shake() {
    this.nodes.input.classList.add("shake");
    setTimeout(() => this.nodes.input.classList.remove("shake"), 400);
  }

  async submitGuess(rawInput) {
    if (this.busy || !rawInput.trim()) return;
    this.busy = true;
    const { guess, synonymOf } = this.synonyms.resolve(rawInput);
    try {
      await player.ensure();
      const { state, guess: result } = await api.guess(this.mode, guess);
      if (synonymOf) this.rememberSynonym(result.nom, synonymOf);
      this.nodes.input.value = "";
      this.suggestions.hide();
      this.render(state);
      if (state.status !== "playing") this.finished(state);
    } catch (err) {
      this.shake();
      if (err instanceof ApiError && err.status === 409 && /over/.test(err.message)) await this.load();
      showToast(err.message, err.status === 422 ? 4000 : 2400);
    } finally {
      this.busy = false;
    }
  }

  async useHint(type) {
    closeModal("hint-modal");
    try {
      await player.ensure();
      this.render(await api.hint(this.mode, type));
    } catch (err) {
      showToast(err.message);
    }
  }

  async forfeit() {
    closeModal("forfeit-modal");
    try {
      await player.ensure();
      const state = await api.forfeit(this.mode);
      this.render(state);
      this.finished(state);
    } catch (err) {
      showToast(err.message);
    }
  }

  finished(state) {
    if (state.status === "won" && window.confetti) {
      window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
    this.onFinished?.(state);
  }

  async share() {
    try {
      await copyShareText(this.state);
      this.nodes.shareBtn.textContent = "Copied!";
    } catch {
      this.nodes.shareBtn.textContent = "Copy failed";
    }
    setTimeout(() => (this.nodes.shareBtn.textContent = "Share"), 2000);
  }
}
