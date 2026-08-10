import { ApiService } from "./js/api.js";
import { initTimer } from "./js/timer.js";
import { ModalService } from "./js/modal.js";
import { CursorManager } from "./js/cursor.js";
import { OptionsManager } from "./js/options.js";
import { SuggestionsManager } from "./js/suggestions.js";
import { initAdminTools } from "./js/admin-tools.js";
import { GameStateManager } from "./js/game-state.js";
import { HintsManager } from "./js/hints.js";
import { TableManager } from "./js/table.js";

document.addEventListener("DOMContentLoaded", () => {
  App.init();
  initAdminTools();
});

const App = {
  synonyms: {
    "blue booster": "green booster",
    "red bubble": "red booster",
    "green bubble": "green booster",
    "blue bubble": "green booster",
    piaf: "bird",
    "crystal spinners": "spinners",
    "electricity box": "power box",
    electricity: "lightning",
    button: "dash switch",
    "mess switch": "clutter switch",
    "mess tiles": "clutter tiles",
    "dash refill": "refill",
    "dash crystal": "refill",
    "key gate": "lock",
    lazer: "badeline laser",
    shotgun: "badeline projectile",
    gun: "badeline projectile",
    blaster: "badeline projectile",

    books: "clutter tiles",
    towels: "clutter tiles",
    crates: "clutter tiles",
    "fire barrier": "lava barrier",
    "trigger spike": "trigger dust",
    "hot core block": "magma block",
    "cold core block": "ice crumble block",
    "bounce block": "magma block",
    "core block": "magma block",
    "space block": "moon block",
    "floaty space block": "moon block",
    "bubble red": "red booster"
  },
  officialElementsList: [],
  historyLog: [],
  tryCount: 0,
  selectedIndex: -1,
  hintUses: 0,
  hintLimit: 3,
  usedHintTypes: [],
  nodes: {},
  entityImageMap: null,

  // LOGIQUE DU CHRONOMÈTRE DE JEU
  gameTimerInterval: null,
  gameSecondsElapsed: 0,
  isGameTimerRunning: false,

  init() {
    this.cacheDOM();
    GameStateManager.checkDailyReset();
    GameStateManager.checkApplicationVersion();
    GameStateManager.load(this);
    this.fetchOfficialElements();
    this.fetchDailySuccessCount();

    SuggestionsManager.init(this);
    OptionsManager.init(this);
    CursorManager.init();

    this.bindEvents();
    this.fetchPersonalizedSynonyms();
    initTimer(this.nodes.timerContainer);
    this.checkDisclaimerNotice();
    HintsManager.renderActive();

    // Restauration du chrono si une partie est déjà en cours
    this.restoreGameTimer();
  },

  cacheDOM() {
    this.nodes = {
      form: document.getElementById("guess-form"),
      input: document.getElementById("element-input"),
      suggestionsBox: document.getElementById("element-suggestions"),
      hintBtn: document.getElementById("hint-btn"),
      tryCountSpan: document.getElementById("try-count"),
      successCountSpan: document.getElementById("success-count"),
      shareBtn: document.getElementById("share-btn"),
      giveupBtn: document.getElementById("giveup-btn"),
      rulesBtn: document.getElementById("rules-btn"),
      personalizedBtn: document.getElementById("personalized-btn"),
      tableBody: document.getElementById("guesses-body"),
      forfeitModal: document.getElementById("forfeit-modal"),
      confirmForfeitBtn: document.getElementById("confirm-forfeit-btn"),
      cancelForfeitBtn: document.getElementById("cancel-forfeit-btn"),
      timerContainer: document.getElementById("next-word-timer"),
      avgTriesSpan: document.getElementById("avg-tries-count"),
      avgHintsSpan: document.getElementById("avg-hints-count"),
      avgTimeSpan: document.getElementById("avg-time-count"),
      showAllBtn: document.getElementById("show-all-btn"),
      disclaimerModal: document.getElementById("disclaimer-modal"),
      closeDisclaimerBtn: document.getElementById("close-disclaimer-btn"),
      acceptDisclaimerBtn: document.getElementById("accept-disclaimer-btn"),
      optionsBtn: document.getElementById("options-btn"),
      optionsModal: document.getElementById("options-modal"),
      closeOptionsBtn: document.getElementById("close-options-btn"),
      toggleColorblindCheckbox: document.getElementById(
        "toggle-colorblind-checkbox"
      ),
      toggleCursorCheckbox: document.getElementById("toggle-cursor-checkbox"),
      customCursor: document.getElementById("custom-cursor"),
      gameTimerDisplay: document.getElementById("game-timer-display")
    };
  },

  bindEvents() {
    if (this.nodes.input && this.nodes.suggestionsBox) {
      this.nodes.input.addEventListener("input", (e) =>
        SuggestionsManager.handleFilter(e)
      );
      this.nodes.input.addEventListener("keydown", (e) =>
        SuggestionsManager.handleKeyboard(e)
      );
    }
    this.nodes.closeDisclaimerBtn?.addEventListener("click", () =>
      this.closeDisclaimerNotice()
    );
    this.nodes.acceptDisclaimerBtn?.addEventListener("click", () =>
      this.closeDisclaimerNotice()
    );

    document
      .getElementById("report-bug-btn")
      ?.addEventListener("click", () => this.openBugModal());
    document
      .getElementById("close-bug-btn")
      ?.addEventListener("click", () => this.closeBugModal());
    document
      .getElementById("cancel-bug-btn")
      ?.addEventListener("click", () => this.closeBugModal());

    document.getElementById("bug-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      ApiService.sendBugReport({
        elementName:
          document.getElementById("bug-element-select")?.value || "N/A",
        bugType: document.getElementById("bug-type-select")?.value,
        description: document.getElementById("bug-description-input")?.value,
        isSpoiler:
          document.getElementById("bug-spoiler-checkbox")?.checked || false
      })
        .then(() => {
          this.showToastNotification("Bug report sent!");
          this.closeBugModal();
        })
        .catch(() => this.showToastNotification("Failed to send report."));
    });

    if (this.nodes.hintBtn) {
      this.nodes.hintBtn.addEventListener("click", () => {
        if (this.hintUses >= this.hintLimit)
          return this.showToastNotification("No hints left.");
        HintsManager.updateButtonsState(this);
        const modal = document.getElementById("hint-modal");
        if (modal) modal.style.display = "flex";
      });
    }

    document
      .getElementById("close-hint-modal")
      ?.addEventListener("click", () => {
        const modal = document.getElementById("hint-modal");
        if (modal) modal.style.display = "none";
      });

    document
      .getElementById("hint-opt-false-friend")
      ?.addEventListener("click", () => HintsManager.request("opposite", this));
    document
      .getElementById("hint-opt-secret")
      ?.addEventListener("click", () =>
        HintsManager.request("secret_info", this)
      );
    document
      .getElementById("hint-opt-truth-lies")
      ?.addEventListener("click", () =>
        HintsManager.request("truth_and_lies", this)
      );

    this.nodes.personalizedBtn?.addEventListener("click", () =>
      ModalService.openPersonalizedModal(this)
    );
    this.nodes.form?.addEventListener("submit", (e) =>
      this.handleFormSubmit(e)
    );
    this.nodes.rulesBtn?.addEventListener("click", () =>
      this.renderRulesModal()
    );
    this.nodes.giveupBtn?.addEventListener("click", () => {
      if (this.nodes.forfeitModal)
        this.nodes.forfeitModal.style.display = "flex";
    });
    this.nodes.cancelForfeitBtn?.addEventListener("click", () => {
      if (this.nodes.forfeitModal)
        this.nodes.forfeitModal.style.display = "none";
    });
    this.nodes.confirmForfeitBtn?.addEventListener("click", () =>
      this.handleForfeit()
    );
    this.nodes.shareBtn?.addEventListener("click", () =>
      this.handleShareScore()
    );

    this.nodes.showAllBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.nodes.input.value = "";
      SuggestionsManager.showAll();
      this.nodes.input.focus();
    });
    document.addEventListener("click", (e) => this.handleOutsideClick(e));
  },

  // METHODES DU CHRONOMETRE
  startGameTimer() {
    if (
      this.isGameTimerRunning ||
      localStorage.getItem("celestedle_gameover") === "true"
    )
      return;
    this.isGameTimerRunning = true;

    this.gameTimerInterval = setInterval(() => {
      this.gameSecondsElapsed++;
      localStorage.setItem("celestedle_elapsed_time", this.gameSecondsElapsed);
      this.updateGameTimerDisplay();
    }, 1000);
  },

  stopGameTimer() {
    if (this.gameTimerInterval) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }
    this.isGameTimerRunning = false;
  },

  restoreGameTimer() {
    const savedTime = localStorage.getItem("celestedle_elapsed_time");
    if (savedTime) {
      this.gameSecondsElapsed = parseInt(savedTime, 10) || 0;
      this.updateGameTimerDisplay();
    }
    const isGameOver = localStorage.getItem("celestedle_gameover") === "true";
    if (this.tryCount > 0 && !isGameOver) {
      this.startGameTimer();
    }
  },

  updateGameTimerDisplay() {
    if (!this.nodes.gameTimerDisplay) return;
    const mins = Math.floor(this.gameSecondsElapsed / 60);
    const secs = this.gameSecondsElapsed % 60;
    this.nodes.gameTimerDisplay.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  },

  getFormattedTime() {
    const mins = Math.floor(this.gameSecondsElapsed / 60);
    const secs = this.gameSecondsElapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  },

  checkDisclaimerNotice() {
    if (
      !localStorage.getItem("celestedle_disclaimer_seen") &&
      this.nodes.disclaimerModal
    ) {
      this.nodes.disclaimerModal.style.display = "flex";
    }
  },

  closeDisclaimerNotice() {
    if (this.nodes.disclaimerModal)
      this.nodes.disclaimerModal.style.display = "none";
    localStorage.setItem("celestedle_disclaimer_seen", "true");
  },

  openBugModal() {
    const select = document.getElementById("bug-element-select");
    if (select) {
      select.innerHTML = '<option value="">-- None / General bug --</option>';
      (Array.isArray(this.officialElementsList)
        ? this.officialElementsList
        : []
      ).forEach((el) => {
        const opt = document.createElement("option");
        opt.value = el;
        opt.textContent = el.charAt(0).toUpperCase() + el.slice(1);
        select.appendChild(opt);
      });
    }
    const modal = document.getElementById("bug-modal");
    if (modal) modal.style.display = "flex";
  },

  closeBugModal() {
    const modal = document.getElementById("bug-modal");
    if (modal) modal.style.display = "none";
    document.getElementById("bug-form")?.reset();
  },

  fetchPersonalizedSynonyms() {
    const saved = localStorage.getItem("celestedle_synonyms");
    if (saved) Object.assign(this.synonyms, JSON.parse(saved));
  },

  fetchOfficialElements() {
    ApiService.fetchElements()
      .then((elements) => {
        this.officialElementsList = Array.isArray(elements) ? elements : [];
        HintsManager.updateButtonText(this);
      })
      .catch(() => {
        this.officialElementsList = [];
      });
  },

  fetchDailySuccessCount() {
    ApiService.fetchDailySuccessCount()
      .then((data) => this.updateCommunityStats(data))
      .catch(() => {});
  },

  updateCommunityStats(data) {
    if (!data) return;
    if (this.nodes.successCountSpan)
      this.nodes.successCountSpan.textContent =
        data.count ?? data.dailySuccessCount ?? 0;
    if (this.nodes.avgTriesSpan)
      this.nodes.avgTriesSpan.textContent =
        data.avgTries != null ? Number(data.avgTries).toFixed(1) : "-";
    if (this.nodes.avgHintsSpan)
      this.nodes.avgHintsSpan.textContent =
        data.avgHints != null ? Number(data.avgHints).toFixed(1) : "-";
    if (this.nodes.avgTimeSpan) {
      const totalSeconds = data.avgTime ?? data.avgTimeInSeconds;
      if (totalSeconds != null && totalSeconds > 0) {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        this.nodes.avgTimeSpan.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      } else {
        this.nodes.avgTimeSpan.textContent = "-";
      }
    }
  },

  handleOutsideClick(e) {
    if (
      this.nodes.suggestionsBox &&
      e.target !== this.nodes.input &&
      e.target !== this.nodes.suggestionsBox
    ) {
      this.nodes.suggestionsBox.style.display = "none";
    }
    if (this.nodes.optionsModal && e.target === this.nodes.optionsModal) {
      this.nodes.optionsModal.style.display = "none";
    }
  },

  handleFormSubmit(e) {
    e.preventDefault();
    if (this.isProcessing)
      return this.showToastNotification(
        "Server is loading, please slow down !"
      );
    this.isProcessing = true;

    const rawGuess = this.nodes.input ? this.nodes.input.value.trim() : "";
    const normalizedGuess = rawGuess.toLowerCase();
    let choice = this.synonyms[normalizedGuess] || normalizedGuess;
    const isSynonym = Boolean(this.synonyms[normalizedGuess]);

    if (this.historyLog.some((a) => a.nom && a.nom.toLowerCase() === choice)) {
      this.showToastNotification("You already tried this ! Be original noob");
      this.nodes.input.classList.add("shake");
      setTimeout(() => this.nodes.input.classList.remove("shake"), 400);
      this.isProcessing = false;
      return;
    }
    if (!choice) return (this.isProcessing = false);

    // Lancement du timer dès la première tentative
    this.startGameTimer();

    ApiService.validateGuess(choice, this.tryCount + 1, this.hintUses)
      .then((data) => {
        this.isProcessing = false;
        if (!data || data.error)
          return this.showToastNotification(data?.error || "Invalid guess");

        const savedVersion = localStorage.getItem("celestedle_version");
        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          [
            "tries",
            "gameover",
            "status",
            "history",
            "saved_hints",
            "used_hint_types",
            "elapsed_time"
          ].forEach((k) => localStorage.removeItem(`celestedle_${k}`));
          localStorage.setItem("celestedle_version", data.secretVersion);
          this.showToastNotification(
            "The secret word has been changed by an admin ! Your tries have been reset !"
          );
          return setTimeout(() => location.reload(), 2500);
        }
        if (!savedVersion && data.secretVersion)
          localStorage.setItem("celestedle_version", data.secretVersion);

        this.tryCount++;
        localStorage.setItem("celestedle_tries", this.tryCount);
        if (this.nodes.tryCountSpan)
          this.nodes.tryCountSpan.textContent = this.tryCount;

        const guessData = {
          ...data,
          isSynonym,
          synonymOriginal: isSynonym ? rawGuess : undefined
        };
        this.historyLog.push(guessData);
        localStorage.setItem(
          "celestedle_history",
          JSON.stringify(this.historyLog)
        );

        TableManager.addRow(guessData, this);
        this.updateCommunityStats(data);

        if (this.nodes.input) this.nodes.input.value = "";
        if (this.nodes.suggestionsBox)
          this.nodes.suggestionsBox.style.display = "none";

        if (data.verdict?.isCorrect) {
          this.stopGameTimer();
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "win");
          this.renderEndGameScreen();
        }
      })
      .catch(() => {
        this.isProcessing = false;
        this.nodes.input?.classList.add("shake");
        setTimeout(() => this.nodes.input?.classList.remove("shake"), 400);
      });
  },

  handleForfeit() {
    this.stopGameTimer();
    ApiService.forfeitGame()
      .then((data) => {
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        if (data?.secretElement)
          localStorage.setItem("celestedle_solution", data.secretElement);
        if (data?.secretAttributes)
          localStorage.setItem(
            "celestedle_solution_attributes",
            JSON.stringify(data.secretAttributes)
          );
        if (this.nodes.forfeitModal)
          this.nodes.forfeitModal.style.display = "none";
        this.renderEndGameScreen();
      })
      .catch(() => {
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        if (this.nodes.forfeitModal)
          this.nodes.forfeitModal.style.display = "none";
        this.renderEndGameScreen();
      });
  },

  handleShareScore() {
    const isWin = localStorage.getItem("celestedle_status") !== "lose";
    const hintNamesMap = {
      opposite: "Opposite",
      false_friend: "False Friend",
      secret_info: "Secret Info",
      truth_and_lies: "1 Truth 2 Lies"
    };

    let hintsSummary = "No hints used";
    if (this.usedHintTypes?.length > 0) {
      const formatted = this.usedHintTypes
        .map((t) => hintNamesMap[t] || t)
        .join(", ");
      hintsSummary = `${this.usedHintTypes.length} ${this.usedHintTypes.length > 1 ? "hints" : "hint"} used (${formatted})`;
    }

    const timeSummary = `⏱️ Time: ${this.getFormattedTime()}`;

    let shareOutputText = isWin
      ? `Celestedle of the day in ${this.tryCount} tries (${timeSummary})\n${hintsSummary}\n\n`
      : `Celestedle of the day : Forfeit ❌ (${this.tryCount} tries - ${timeSummary})\n${hintsSummary}\n\n`;

    const scoreToEmojiMap = {
      correct: "🟩",
      partial: "🟨",
      notTotallyWrong: "🟧",
      wrong: "🟥"
    };

    this.historyLog.forEach((tryData) => {
      if (!tryData.verdict) return;
      shareOutputText += `${scoreToEmojiMap[tryData.verdict.type] || "🟥"}${scoreToEmojiMap[tryData.verdict.lieu] || "🟥"}${scoreToEmojiMap[tryData.verdict.couleur] || "🟥"}${scoreToEmojiMap[tryData.verdict.hitbox] || "🟥"}\n`;
    });

    navigator.clipboard
      .writeText(shareOutputText + "\nhttps://celestedle.vercel.app/")
      .then(() => {
        this.nodes.shareBtn.textContent = "Copied !";
        setTimeout(() => {
          this.nodes.shareBtn.textContent = "Share result";
        }, 2000);
      });
  },

  showToastNotification(message) {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  },

  renderEndGameScreen() {
    this.stopGameTimer();
    if (this.nodes.form) this.nodes.form.style.display = "none";
    if (this.nodes.giveupBtn) this.nodes.giveupBtn.style.display = "none";
    if (this.nodes.hintBtn) this.nodes.hintBtn.style.display = "none";
    if (this.nodes.shareBtn)
      this.nodes.shareBtn.style.setProperty(
        "display",
        "inline-flex",
        "important"
      );

    const isWin = localStorage.getItem("celestedle_status") !== "lose";
    const targetContainer =
      document.getElementById("message-container") ||
      this.nodes.form?.parentNode;
    if (!targetContainer) return;

    targetContainer.querySelector(".win-message, .lose-message")?.remove();

    const messageContainer = document.createElement("div");
    messageContainer.className = isWin ? "win-message" : "lose-message";

    const solution = localStorage.getItem("celestedle_solution") || "Unknown";
    const formattedSolution =
      solution.charAt(0).toUpperCase() + solution.slice(1);
    const rawAttributes = localStorage.getItem(
      "celestedle_solution_attributes"
    );

    let attributeSummary = "";
    let parsedSolutionAttrs = {};
    if (rawAttributes) {
      try {
        const attrs =
          typeof rawAttributes === "string"
            ? JSON.parse(rawAttributes)
            : rawAttributes;
        parsedSolutionAttrs = attrs || {};
        attributeSummary = `<br><br><strong>Type:</strong> ${attrs.type || "-"}<br><strong>Locations:</strong> ${Array.isArray(attrs.lieu) ? attrs.lieu.join(", ") : attrs.lieu || "-"}<br><strong>Colours:</strong> ${Array.isArray(attrs.couleur) ? attrs.couleur.join(", ") : attrs.couleur || "-"}<br><strong>Hitbox:</strong> ${attrs.hitbox || "-"}`;
      } catch (e) {}
    }

    const finalTime = this.getFormattedTime();

    const matchSummary = isWin
      ? `You found the secret element in <strong>${this.tryCount}</strong> tries and <strong>${finalTime}</strong>. Used <strong>${this.hintUses}</strong> hints.`
      : `You didn't find today's celestedle ! The answer was : <strong>${formattedSolution}</strong> (Time: <strong>${finalTime}</strong>). Used <strong>${this.hintUses}</strong> hints.${attributeSummary}`;

    messageContainer.innerHTML = `<h2>${isWin ? "GG ! Victory ! 🎉" : "Nice try... Aba(n)ddon ! ❌"}</h2><div>${matchSummary}</div>`;

    if (!isWin && solution) {
      TableManager.insertSolutionRow(
        formattedSolution,
        parsedSolutionAttrs,
        this
      );
      TableManager.resolveEntityImage(solution, this).then((imgPath) => {
        if (!imgPath) return;
        const firstRow = this.nodes.tableBody.querySelector("tr");
        if (!firstRow) return;
        const img = document.createElement("img");
        img.className = "entity-thumb";
        img.src = imgPath;
        img.alt = formattedSolution;
        firstRow
          .querySelector("td")
          ?.insertBefore(img, firstRow.querySelector("td").firstChild);
      });
    }

    targetContainer.appendChild(messageContainer);
  },

  renderRulesModal() {
    const sidebar = document.getElementById("rules-sidebar");
    if (sidebar)
      sidebar.style.display =
        sidebar.style.display === "none" ? "block" : "none";
  },

  addTableRow(data) {
    TableManager.addRow(data, this);
  },

  resolveEntityImage(name) {
    return TableManager.resolveEntityImage(name, this);
  }
};
