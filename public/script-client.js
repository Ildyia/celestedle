import { ApiService } from "./js/api.js";
import { initTimer } from "./js/timer.js";
import { ModalService } from "./js/modal.js";

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});

const App = {
  synonyms: {
    cassette: "cassette tape",
    tape: "cassette tape",
    tile: "tiles",
    crumble: "crumble block",
    crumbleblock: "crumble block",
    jumpthroughs: "jumpthrough",
    "blue booster": "green booster",
    "red bubble": "red booster",
    "green bubble": "green booster",
    "blue bubble": "green booster",
    bubble: "green booster",
    piaf: "bird",
    oiseau: "bird",
    "moving block": "move block",
    zippers: "zip movers",
    "cristal spinner": "crystal spinner",
    "electricity box": "power box",
    electricity: "lightning",
    button: "dash switch",
    "huge mess switch": "clutter switch",
    "mess switch": "clutter switch",
    "huge mess tiles": "clutter tiles",
    "mess tiles": "clutter tiles",
    "dash refill": "refill",
    "dash crystal": "refill",
    "key gate": "lock",
    lazer: "badeline laser",
    "badeline lazer": "badeline laser",
    "badeline shotgun": "badeline projectile",
    "badeline gun": "badeline projectile",
    "badeline blaster": "badeline projectile",
    "badeline shooter": "badeline projectile",
    "badeline shot": "badeline projectile",
    "fire wall": "lava/ice wall",
    "slime door": "clutter door",
    "slime button": "clutter switch",
    "slime switch": "clutter switch",
    books: "clutter tiles",
    towels: "clutter tiles",
    crates: "clutter tiles",
    moonblock: "moon block",
    "fire barrier": "lava barrier",
    "slippery ice wall": "ice wall",
    "trigger spike": "trigger dust",
    "hot core block": "magma block",
    "cold core block": "ice crumble block",
    "bounce block": "magma block",
    "core block": "magma block",
    "space block": "moon block",
    "floaty space block": "moon block",
    "bubble red": "red booster",
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

  init() {
    this.cacheDOM();
    this.checkDailyReset();
    this.checkApplicationVersion();
    this.loadGameState();
    this.fetchOfficialElements();
    this.fetchDailySuccessCount();
    this.bindEvents();
    this.fetchPersonalizedSynonyms();
    initTimer(this.nodes.timerContainer);
  },

  cacheDOM() {
    this.nodes = {
      form: document.getElementById("guess-form"),
      input: document.getElementById("element-input"),
      suggestionsBox: document.getElementById("element-suggestions"),
      hintBtn: document.getElementById("hint-btn"),
      tryCountSpan: document.getElementById("try-count"),
      shareBtn: document.getElementById("share-btn"),
      giveupBtn: document.getElementById("giveup-btn"),
      rulesBtn: document.getElementById("rules-btn"),
      personalizedBtn: document.getElementById("personalized-btn"),
      tableBody: document.getElementById("guesses-body"),
      forfeitModal: document.getElementById("forfeit-modal"),
      confirmForfeitBtn: document.getElementById("confirm-forfeit-btn"),
      cancelForfeitBtn: document.getElementById("cancel-forfeit-btn"),
      timerContainer: document.getElementById("next-word-timer"),
      successCountSpan: document.getElementById("success-count"),
      avgTriesSpan: document.getElementById("avg-tries-count"),
      avgHintsSpan: document.getElementById("avg-hints-count"),
      showAllBtn: document.getElementById("show-all-btn"),
    };
  },

  bindEvents() {
    if (this.nodes.input && this.nodes.suggestionsBox) {
      this.nodes.input.addEventListener("input", (e) =>
        this.handleSuggestionsFilter(e),
      );
      this.nodes.input.addEventListener("keydown", (e) =>
        this.handleSuggestionsKeyboard(e),
      );
    }

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
      const reportData = {
        elementName:
          document.getElementById("bug-element-select")?.value || "N/A",
        bugType: document.getElementById("bug-type-select")?.value,
        description: document.getElementById("bug-description-input")?.value,
        isSpoiler:
          document.getElementById("bug-spoiler-checkbox")?.checked || false,
      };

      ApiService.sendBugReport(reportData)
        .then(() => {
          this.showToastNotification("Bug report sent!");
          this.closeBugModal();
        })
        .catch(() => this.showToastNotification("Failed to send report."));
    });

    if (this.nodes.hintBtn) {
      this.nodes.hintBtn.addEventListener("click", () => {
        if (this.hintUses >= this.hintLimit) {
          this.showToastNotification("No hints left.");
          return;
        }
        this.updateHintButtonsState();
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
      ?.addEventListener("click", () => this.requestHint("false_friend"));
    document
      .getElementById("hint-opt-secret")
      ?.addEventListener("click", () => this.requestHint("secret_info"));
    document
      .getElementById("hint-opt-wrong")
      ?.addEventListener("click", () => this.requestHint("wrong_info"));

    if (this.nodes.personalizedBtn) {
      this.nodes.personalizedBtn.addEventListener("click", () =>
        ModalService.openPersonalizedModal(this),
      );
    }
    if (this.nodes.form) {
      this.nodes.form.addEventListener("submit", (e) =>
        this.handleFormSubmit(e),
      );
    }
    if (this.nodes.rulesBtn) {
      this.nodes.rulesBtn.addEventListener("click", () =>
        this.renderRulesModal(),
      );
    }
    if (this.nodes.giveupBtn) {
      this.nodes.giveupBtn.addEventListener("click", () => {
        if (this.nodes.forfeitModal)
          this.nodes.forfeitModal.style.display = "flex";
      });
    }
    if (this.nodes.cancelForfeitBtn) {
      this.nodes.cancelForfeitBtn.addEventListener("click", () => {
        if (this.nodes.forfeitModal)
          this.nodes.forfeitModal.style.display = "none";
      });
    }
    if (this.nodes.confirmForfeitBtn) {
      this.nodes.confirmForfeitBtn.addEventListener("click", () =>
        this.handleForfeit(),
      );
    }
    if (this.nodes.shareBtn) {
      this.nodes.shareBtn.addEventListener("click", () =>
        this.handleShareScore(),
      );
    }

    if (this.nodes.showAllBtn) {
      this.nodes.showAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.nodes.input.value = "";
        this.showAllSuggestions();
        this.nodes.input.focus();
      });
    }
    document.addEventListener("click", (e) => this.handleOutsideClick(e));
  },

  updateHintButtonsState() {
    const btnFF = document.getElementById("hint-opt-false-friend");
    const btnSecret = document.getElementById("hint-opt-secret");
    const btnWrong = document.getElementById("hint-opt-wrong");

    if (btnFF) btnFF.disabled = this.usedHintTypes.includes("false_friend");
    if (btnSecret)
      btnSecret.disabled = this.usedHintTypes.includes("secret_info");
    if (btnWrong) btnWrong.disabled = this.usedHintTypes.includes("wrong_info");
  },

  requestHint(type) {
    if (this.usedHintTypes.includes(type)) return;

    const modal = document.getElementById("hint-modal");
    if (modal) modal.style.display = "none";

    ApiService.fetchHint(type)
      .then((data) => {
        if (!data || !data.text) return;
        this.hintUses += 1;
        this.usedHintTypes.push(type);
        localStorage.setItem(
          "celestedle_used_hint_types",
          JSON.stringify(this.usedHintTypes),
        );
        this.updateHintButtonText();
        this.saveAndRenderHint(data.text);
      })
      .catch(() => this.showToastNotification("Error fetching hint."));
  },

  showAllSuggestions() {
    if (!this.nodes.suggestionsBox) return;
    this.nodes.suggestionsBox.innerHTML = "";
    this.selectedIndex = -1;

    const sortedElements = [...this.officialElementsList].sort((a, b) =>
      a.localeCompare(b),
    );

    sortedElements.forEach((name) => {
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      const div = document.createElement("div");
      div.classList.add("suggestion-item");

      const thumb = document.createElement("img");
      thumb.className = "suggestion-thumb";
      thumb.alt = displayName;
      thumb.src = "assets/entities/placeholder.svg";

      const textNode = document.createElement("span");
      textNode.textContent = displayName;

      div.appendChild(thumb);
      div.appendChild(textNode);

      this.resolveEntityImage(name.toLowerCase()).then((path) => {
        if (path) thumb.src = path;
      });

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectSuggestion(displayName);
      });

      this.nodes.suggestionsBox.appendChild(div);
    });

    this.nodes.suggestionsBox.style.display = "block";
  },
  saveAndRenderHint(text) {
    const savedHints = JSON.parse(
      localStorage.getItem("celestedle_saved_hints") || "[]",
    );
    savedHints.push(text);
    localStorage.setItem("celestedle_saved_hints", JSON.stringify(savedHints));
    this.renderActiveHints();
  },

  renderActiveHints() {
    const container = document.getElementById("active-hints-container");
    if (!container) return;
    const savedHints = JSON.parse(
      localStorage.getItem("celestedle_saved_hints") || "[]",
    );

    container.innerHTML = "";
    savedHints.forEach((hintText) => {
      const card = document.createElement("div");
      card.className = "hint-card";
      card.innerHTML = hintText;
      container.appendChild(card);
    });
  },

  openBugModal() {
    const select = document.getElementById("bug-element-select");
    if (select) {
      select.innerHTML = '<option value="">-- None / General bug --</option>';
      this.officialElementsList.forEach((el) => {
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
    const form = document.getElementById("bug-form");
    if (modal) modal.style.display = "none";
    if (form) form.reset();
  },

  checkDailyReset() {
    const todayDate = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Europe/Paris",
    });
    const savedDate = localStorage.getItem("celestedle_date");

    if (savedDate !== todayDate) {
      const keysToRemove = [
        "tries",
        "gameover",
        "status",
        "history",
        "version",
        "solution",
        "solution_attributes",
        "saved_hints",
        "used_hint_types",
      ];
      keysToRemove.forEach((key) =>
        localStorage.removeItem(`celestedle_${key}`),
      );
      localStorage.setItem("celestedle_date", todayDate);
    }
  },

  checkApplicationVersion() {
    ApiService.fetchSecretVersion().then((data) => {
      const savedVersion = localStorage.getItem("celestedle_version");
      if (savedVersion && savedVersion !== String(data.secretVersion)) {
        const keysToRemove = [
          "tries",
          "gameover",
          "status",
          "history",
          "saved_hints",
          "used_hint_types",
        ];
        keysToRemove.forEach((key) =>
          localStorage.removeItem(`celestedle_${key}`),
        );
        localStorage.setItem("celestedle_version", data.secretVersion);
        location.reload();
      } else if (!savedVersion) {
        localStorage.setItem("celestedle_version", data.secretVersion);
      }
    });
  },

  loadGameState() {
    this.tryCount = parseInt(localStorage.getItem("celestedle_tries")) || 0;
    if (this.nodes.tryCountSpan) {
      this.nodes.tryCountSpan.textContent = this.tryCount;
    }

    this.usedHintTypes = JSON.parse(
      localStorage.getItem("celestedle_used_hint_types") || "[]",
    );
    this.hintUses = this.usedHintTypes.length;

    this.historyLog =
      JSON.parse(localStorage.getItem("celestedle_history")) || [];
    this.historyLog.forEach((data) => this.addTableRow(data));

    this.renderActiveHints();

    if (localStorage.getItem("celestedle_gameover") === "true") {
      this.renderEndGameScreen();
    }
  },

  fetchPersonalizedSynonyms() {
    const savedSynonyms = localStorage.getItem("celestedle_synonyms");
    if (savedSynonyms) {
      const parsedSynonyms = JSON.parse(savedSynonyms);
      Object.keys(parsedSynonyms).forEach((key) => {
        this.synonyms[key] = parsedSynonyms[key];
      });
    }
  },

  fetchOfficialElements() {
    ApiService.fetchElements()
      .then((elements) => {
        this.officialElementsList = elements;
        this.updateHintButtonText();
      })
      .catch((err) => console.error("Error loading elements:", err));
  },

  fetchDailySuccessCount() {
    ApiService.fetchDailySuccessCount()
      .then((data) => {
        this.updateCommunityStats(data);
      })
      .catch((err) => console.error("Error loading daily stats:", err));
  },

  updateCommunityStats(data) {
    if (this.nodes.successCountSpan) {
      this.nodes.successCountSpan.textContent =
        data.count ?? data.dailySuccessCount ?? 0;
    }
    if (this.nodes.avgTriesSpan) {
      this.nodes.avgTriesSpan.textContent =
        data.avgTries != null ? Number(data.avgTries).toFixed(1) : "-";
    }
    if (this.nodes.avgHintsSpan) {
      this.nodes.avgHintsSpan.textContent =
        data.avgHints != null ? Number(data.avgHints).toFixed(1) : "-";
    }
  },

  updateHintButtonText() {
    if (!this.nodes.hintBtn) return;
    const remaining = Math.max(this.hintLimit - this.hintUses, 0);
    this.nodes.hintBtn.textContent =
      remaining > 0 ? `Hints (${remaining} left)` : `No hints left`;
    this.nodes.hintBtn.disabled = remaining === 0;
  },

  handleSuggestionsFilter(e) {
    const query = e.target.value.trim().toLowerCase();
    this.nodes.suggestionsBox.innerHTML = "";
    this.selectedIndex = -1;

    if (query.length < 3) {
      this.nodes.suggestionsBox.style.display = "none";
      return;
    }

    const matchingSuggestions = new Map();

    const addSuggestion = (word, priority, isSynonym = false) => {
      const existing = matchingSuggestions.get(word);
      if (existing === undefined || priority < existing.priority) {
        matchingSuggestions.set(word, { priority, isSynonym });
      }
    };

    Object.keys(this.synonyms).forEach((syn) => {
      if (syn.startsWith(query)) {
        const officialName = this.synonyms[syn];
        const displayName =
          officialName.charAt(0).toUpperCase() + officialName.slice(1);
        const lowerName = officialName.toLowerCase();
        const priority =
          lowerName === query ? 0 : lowerName.startsWith(query) ? 1 : 2;
        addSuggestion(displayName, priority, true);
      }
    });

    this.officialElementsList.forEach((name) => {
      const lowerName = name.toLowerCase();
      if (lowerName.includes(query)) {
        const displayName = name.charAt(0).toUpperCase() + name.slice(1);
        const priority =
          lowerName === query ? 0 : lowerName.startsWith(query) ? 1 : 2;
        addSuggestion(displayName, priority, false);
      }
    });

    if (matchingSuggestions.size > 0) {
      Array.from(matchingSuggestions.entries())
        .sort(([a, vA], [b, vB]) => {
          if (vA.priority !== vB.priority) return vA.priority - vB.priority;
          return a.localeCompare(b);
        })
        .forEach(([word, meta]) => {
          const div = document.createElement("div");
          div.classList.add("suggestion-item");

          const thumb = document.createElement("img");
          thumb.className = "suggestion-thumb";
          thumb.alt = word;
          thumb.src = "assets/entities/placeholder.svg";

          const textNode = document.createElement("span");
          textNode.textContent = word;

          div.appendChild(thumb);
          div.appendChild(textNode);

          if (meta && meta.isSynonym) {
            const img = document.createElement("img");
            img.className = "synonym-marker";
            img.src = "assets/entities/switch.svg";
            img.alt = "(synonym)";
            img.setAttribute("aria-hidden", "true");
            div.appendChild(img);
          }

          const key = word.toLowerCase();
          this.resolveEntityImage(key).then((path) => {
            if (path) thumb.src = path;
          });

          div.addEventListener("click", () => this.selectSuggestion(word));
          this.nodes.suggestionsBox.appendChild(div);
        });
      this.nodes.suggestionsBox.style.display = "block";
    } else {
      this.nodes.suggestionsBox.style.display = "none";
    }
  },

  handleSuggestionsKeyboard(e) {
    const items =
      this.nodes.suggestionsBox.querySelectorAll(".suggestion-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex++;
      if (this.selectedIndex >= items.length) this.selectedIndex = 0;
      this.updateSelectionHighlight(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex--;
      if (this.selectedIndex < 0) this.selectedIndex = items.length - 1;
      this.updateSelectionHighlight(items);
    } else if (e.key === "Enter") {
      if (this.selectedIndex > -1 && items[this.selectedIndex]) {
        e.preventDefault();
        this.selectSuggestion(items[this.selectedIndex].textContent);
      }
    }
  },

  updateSelectionHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  },

  selectSuggestion(word) {
    this.nodes.input.value = word;
    this.nodes.suggestionsBox.innerHTML = "";
    this.nodes.suggestionsBox.style.display = "none";
    this.selectedIndex = -1;
    this.nodes.input.focus();
  },

  handleOutsideClick(e) {
    if (
      this.nodes.suggestionsBox &&
      e.target !== this.nodes.input &&
      e.target !== this.nodes.suggestionsBox
    ) {
      this.nodes.suggestionsBox.style.display = "none";
    }
  },

  handleFormSubmit(e) {
    e.preventDefault();
    if (this.isProcessing) {
      this.showToastNotification("Server is loading, please slow down !");
      return;
    }
    this.isProcessing = true;
    const rawGuess = this.nodes.input ? this.nodes.input.value.trim() : "";
    const normalizedGuess = rawGuess.toLowerCase();
    let choice = normalizedGuess;
    const isSynonym = Boolean(this.synonyms[normalizedGuess]);

    if (isSynonym) choice = this.synonyms[normalizedGuess];

    const alreadyGuessed = this.historyLog.some(
      (attempt) => attempt.nom.toLowerCase() === choice,
    );
    if (alreadyGuessed) {
      this.showToastNotification("You already tried this ! Be original noob");
      this.nodes.input.classList.add("shake");
      setTimeout(() => this.nodes.input.classList.remove("shake"), 400);
      this.isProcessing = false;
      return;
    }
    if (!choice) {
      this.isProcessing = false;
      return;
    }

    ApiService.validateGuess(choice, this.tryCount + 1, this.hintUses)
      .then((data) => {
        this.isProcessing = false;
        const savedVersion = localStorage.getItem("celestedle_version");

        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = [
            "tries",
            "gameover",
            "status",
            "history",
            "saved_hints",
            "used_hint_types",
          ];
          keysToRemove.forEach((key) =>
            localStorage.removeItem(`celestedle_${key}`),
          );
          localStorage.setItem("celestedle_version", data.secretVersion);

          this.showToastNotification(
            "The secret word has been changed by an admin ! Your tries have been reset !",
          );
          setTimeout(() => location.reload(), 2500);
          this.isProcessing = false;
          return;
        }

        if (!savedVersion) {
          localStorage.setItem("celestedle_version", data.secretVersion);
        }

        this.tryCount++;
        localStorage.setItem("celestedle_tries", this.tryCount);
        if (this.nodes.tryCountSpan)
          this.nodes.tryCountSpan.textContent = this.tryCount;

        const guessData = {
          ...data,
          isSynonym,
          synonymOriginal: isSynonym ? rawGuess : undefined,
        };

        this.historyLog.push(guessData);
        localStorage.setItem(
          "celestedle_history",
          JSON.stringify(this.historyLog),
        );

        this.addTableRow(guessData);
        this.updateCommunityStats(data);

        if (this.nodes.input) this.nodes.input.value = "";
        if (this.nodes.suggestionsBox)
          this.nodes.suggestionsBox.style.display = "none";

        if (data.verdict.isCorrect) {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "win");
          this.renderEndGameScreen();
        }
      })
      .catch((err) => {
        if (this.nodes.input) {
          this.nodes.input.classList.add("shake");
          setTimeout(() => this.nodes.input.classList.remove("shake"), 400);
        }
        console.error("Submit processing error:", err);
      });
  },

  handlePersonalizedSynonymAdd(modal) {
    const keyInput = document.getElementById("synonym-key-input");
    const valueInput = document.getElementById("synonym-value-input");
    const errorContainer = document.getElementById("synonym-error-msg");

    const key = keyInput.value.trim().toLowerCase();
    const value = valueInput.value.trim().toLowerCase();

    errorContainer.textContent = "";
    errorContainer.style.display = "none";

    if (!key || !value) {
      errorContainer.textContent = "Please fill both fields.";
      errorContainer.style.display = "block";
      return;
    }

    if (this.synonyms[key]) {
      errorContainer.textContent = `The synonym "${key}" already exists.`;
      errorContainer.style.display = "block";
      return;
    }

    const officialExists = this.officialElementsList.some(
      (element) => element.toLowerCase() === value,
    );

    if (!officialExists) {
      errorContainer.textContent = `"${value}" is not a valid official element name.`;
      errorContainer.style.display = "block";
      return;
    }

    this.synonyms[key] = value;

    const currentSaved = JSON.parse(
      localStorage.getItem("celestedle_synonyms") || "{}",
    );
    currentSaved[key] = value;

    localStorage.setItem("celestedle_synonyms", JSON.stringify(currentSaved));

    keyInput.value = "";
    valueInput.value = "";

    ModalService.renderSynonymsList(modal, this);
  },

  handleForfeit() {
    ApiService.forfeitGame()
      .then((data) => {
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        if (data.secretElement) {
          localStorage.setItem("celestedle_solution", data.secretElement);
        }
        if (data.secretAttributes) {
          localStorage.setItem(
            "celestedle_solution_attributes",
            JSON.stringify(data.secretAttributes),
          );
        }
        if (this.nodes.forfeitModal) {
          this.nodes.forfeitModal.style.display = "none";
        }
        this.renderEndGameScreen();
      })
      .catch((err) => {
        console.error("Error during forfeit processing:", err);
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        if (this.nodes.forfeitModal) {
          this.nodes.forfeitModal.style.display = "none";
        }
        this.renderEndGameScreen();
      });
  },

  handleShareScore() {
    const isWin = localStorage.getItem("celestedle_status") !== "lose";

    const hintNamesMap = {
      false_friend: "False Friend",
      secret_info: "Secret Info",
      wrong_info: "NOT Hint",
    };

    let hintsSummary = "No hints used";
    if (this.usedHintTypes && this.usedHintTypes.length > 0) {
      const formattedHints = this.usedHintTypes
        .map((type) => hintNamesMap[type] || type)
        .join(", ");
      const hintLabel = this.usedHintTypes.length > 1 ? "hints" : "hint";
      hintsSummary = `${this.usedHintTypes.length} ${hintLabel} used (${formattedHints})`;
    }

    let shareOutputText = isWin
      ? `Celestedle of the day in ${this.tryCount} tries\n${hintsSummary}\n\n`
      : `Celestedle of the day : Forfeit ❌ (${this.tryCount} tries)\n${hintsSummary}\n\n`;

    const scoreToEmojiMap = {
      correct: "🟩",
      partial: "🟨",
      notTotallyWrong: "🟧",
      wrong: "🟥",
    };

    this.historyLog.forEach((tryData) => {
      if (!tryData.verdict) return;
      const typeIcon = scoreToEmojiMap[tryData.verdict.type] || "🟥";
      const locationIcon = scoreToEmojiMap[tryData.verdict.lieu] || "🟥";
      const colorIcon = scoreToEmojiMap[tryData.verdict.couleur] || "🟥";
      const hitboxIcon = scoreToEmojiMap[tryData.verdict.hitbox] || "🟥";
      shareOutputText += `${typeIcon}${locationIcon}${colorIcon}${hitboxIcon}\n`;
    });

    navigator.clipboard
      .writeText(shareOutputText + "\nhttps://celestedle.vercel.app/")
      .then(() => {
        this.nodes.shareBtn.textContent = "Copied !";
        setTimeout(() => {
          this.nodes.shareBtn.textContent = "Share result";
        }, 2000);
      })
      .catch((err) => console.error("Could not write clip path data:", err));
  },

  showToastNotification(message) {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  },

  renderEndGameScreen() {
    if (this.nodes.form) this.nodes.form.style.display = "none";
    if (this.nodes.giveupBtn) this.nodes.giveupBtn.style.display = "none";
    if (this.nodes.hintBtn) this.nodes.hintBtn.style.display = "none";
    if (this.nodes.shareBtn)
      this.nodes.shareBtn.style.setProperty(
        "display",
        "inline-flex",
        "important",
      );

    const gameStatus = localStorage.getItem("celestedle_status");
    const isWin = gameStatus !== "lose";

    const targetContainer =
      document.getElementById("message-container") ||
      this.nodes.form?.parentNode;
    if (!targetContainer) return;

    const existingMsg = targetContainer.querySelector(
      ".win-message, .lose-message",
    );
    if (existingMsg) existingMsg.remove();

    const messageContainer = document.createElement("div");
    messageContainer.className = isWin ? "win-message" : "lose-message";
    const title = isWin ? "GG ! Victory ! 🎉" : "Nice try... Aba(n)ddon ! ❌";

    const solution = localStorage.getItem("celestedle_solution") || "Unknown";
    const formattedSolution =
      solution.charAt(0).toUpperCase() + solution.slice(1);
    const rawAttributes = localStorage.getItem(
      "celestedle_solution_attributes",
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
        const locationText = Array.isArray(attrs.lieu)
          ? attrs.lieu.join(", ")
          : attrs.lieu;
        const colorText = Array.isArray(attrs.couleur)
          ? attrs.couleur.join(", ")
          : attrs.couleur;
        attributeSummary = `<br><br><strong>Type:</strong> ${attrs.type || "-"}<br><strong>Locations:</strong> ${locationText || "-"}<br><strong>Colours:</strong> ${colorText || "-"}<br><strong>Hitbox:</strong> ${attrs.hitbox || "-"}`;
      } catch (error) {
        console.error("Failed to parse solution attributes:", error);
      }
    }

    const matchSummary = isWin
      ? `You found the secret element in <strong>${this.tryCount}</strong> tries. I used <strong>${this.hintUses}</strong> hints.`
      : `You didn't find today's celestedle ! The answer was : <strong>${formattedSolution}</strong>. I used <strong>${this.hintUses}</strong> hints.${attributeSummary}`;

    messageContainer.innerHTML = `<h2>${title}</h2><div>${matchSummary}</div>`;

    if (!isWin && solution) {
      const solutionDisplayName = formattedSolution;
      this.insertSolutionRow(solutionDisplayName, parsedSolutionAttrs);
      this.resolveEntityImage(solution)
        .then((imgPath) => {
          if (!imgPath) return;
          const firstRow = this.nodes.tableBody.querySelector("tr");
          if (!firstRow) return;
          const img = document.createElement("img");
          img.className = "entity-thumb";
          img.src = imgPath;
          img.alt = solutionDisplayName;
          const nameCell = firstRow.querySelector("td");
          if (nameCell) nameCell.insertBefore(img, nameCell.firstChild);
        })
        .catch(() => {});
    }

    if (document.getElementById("message-container")) {
      targetContainer.appendChild(messageContainer);
    } else {
      targetContainer.insertBefore(messageContainer, this.nodes.form);
    }
  },

  renderRulesModal() {
    const sidebar = document.getElementById("rules-sidebar");
    if (!sidebar) return;
    sidebar.style.display = sidebar.style.display === "none" ? "block" : "none";
  },

  addTableRow(data) {
    if (!this.nodes.tableBody) return;

    const row = document.createElement("tr");
    const createCell = (text, className) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      cell.className = className || "wrong";
      return cell;
    };

    const formattedName = data.nom.charAt(0).toUpperCase() + data.nom.slice(1);
    const nameCell = document.createElement("td");
    nameCell.className = data.verdict?.isCorrect ? "correct" : "wrong";

    const nameText = document.createElement("div");
    nameText.textContent = formattedName;
    nameCell.appendChild(nameText);

    this.resolveEntityImage(data.nom).then((imgPath) => {
      if (!imgPath) return;
      const thumb = document.createElement("img");
      thumb.className = "entity-thumb";
      thumb.src = imgPath;
      thumb.alt = formattedName;
      nameCell.insertBefore(thumb, nameCell.firstChild);
    });

    if (data.isSynonym && data.synonymOriginal) {
      const synonymBadge = document.createElement("span");
      synonymBadge.className = "synonym-indicator";
      synonymBadge.textContent = `Used synonym: ${data.synonymOriginal}`;
      nameCell.appendChild(synonymBadge);
    }

    row.appendChild(nameCell);
    row.appendChild(createCell(data.valeurs?.type || "-", data.verdict?.type));
    row.appendChild(createCell(data.valeurs?.lieu || "-", data.verdict?.lieu));
    row.appendChild(
      createCell(data.valeurs?.couleur || "-", data.verdict?.couleur),
    );
    row.appendChild(
      createCell(data.valeurs?.hitbox || "-", data.verdict?.hitbox),
    );

    this.nodes.tableBody.insertBefore(row, this.nodes.tableBody.firstChild);
  },

  async resolveEntityImage(name) {
    if (!name) return null;

    if (!this._entityImageMapPromise && this.entityImageMap === null) {
      const candidates = [
        "/assets/entities/mapping.json",
        "/public/assets/entities/mapping.json",
        "assets/entities/mapping.json",
        "public/assets/entities/mapping.json",
      ];

      this._entityImageMapPromise = (async () => {
        let json = null;
        for (const url of candidates) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              json = await res.json();
              break;
            }
          } catch (e) {
            // try next
          }
        }
        const norm = {};
        try {
          Object.keys(json || {}).forEach((k) => {
            norm[k.toLowerCase()] = json[k];
          });
        } catch (e) {}
        this.entityImageMap = norm;
      })();
    }

    if (this._entityImageMapPromise) await this._entityImageMapPromise;

    const key = name.toLowerCase();
    if (this.entityImageMap && this.entityImageMap[key]) {
      return this.entityImageMap[key];
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const exts = ["png", "webp", "jpg", "jpeg"];
    const bases = [
      "/assets/entities/",
      "/public/assets/entities/",
      "assets/entities/",
      "public/assets/entities/",
    ];

    for (let b = 0; b < bases.length; b++) {
      for (let i = 0; i < exts.length; i++) {
        const found = await new Promise((resolve) => {
          const path = `${bases[b]}${slug}.${exts[i]}`;
          const img = new Image();
          img.onload = () => resolve(path);
          img.onerror = () => resolve(null);
          img.src = path;
        });
        if (found) return found;
      }
    }

    return null;
  },

  insertSolutionRow(solutionName, attrs = {}) {
    if (!this.nodes.tableBody) return;

    const row = document.createElement("tr");

    const createCell = (text, className) => {
      const cell = document.createElement("td");
      cell.textContent = text;
      cell.className = className || "wrong";
      return cell;
    };

    const nameCell = document.createElement("td");
    nameCell.className = "correct solution-row";
    const nameText = document.createElement("div");
    nameText.textContent = solutionName;
    nameCell.appendChild(nameText);

    row.appendChild(nameCell);
    row.appendChild(createCell(attrs.type || "-", "correct"));
    const lieuText = Array.isArray(attrs.lieu)
      ? attrs.lieu.join(", ")
      : attrs.lieu || "-";
    row.appendChild(createCell(lieuText, "correct"));
    const couleurText = Array.isArray(attrs.couleur)
      ? attrs.couleur.join(", ")
      : attrs.couleur || "-";
    row.appendChild(createCell(couleurText, "correct"));
    row.appendChild(createCell(attrs.hitbox || "-", "correct"));

    this.nodes.tableBody.insertBefore(row, this.nodes.tableBody.firstChild);
  },
};

window.getSecretWordPlzUwU = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  ApiService.verifyAdminKey(adminPassword)
    .then(() => ApiService.getSecretWordAdmin())
    .then((data) =>
      alert("The secret element of the day is : " + data.secretElement),
    )
    .catch((err) => alert(err.message));
};

window.forceReset = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  ApiService.verifyAdminKey(adminPassword)
    .then(() => {
      const keysToRemove = [
        "tries",
        "gameover",
        "status",
        "history",
        "date",
        "version",
        "saved_hints",
        "used_hint_types",
      ];
      keysToRemove.forEach((key) =>
        localStorage.removeItem(`celestedle_${key}`),
      );
      alert("Local data wiped ! Reloading window context structure.");
    })
    .catch((err) => alert(err.message));
};

window.randomSecret = function (reset = false) {
  const adminPassword = prompt("Please enter admin password:");
  if (!adminPassword) return;
  let newHash = Math.floor(Math.random() * 1000000000);
  if (reset) newHash = null;

  ApiService.triggerRandomSecret(adminPassword, newHash)
    .then((data) => alert(data.error ? "Error : " + data.error : data.message))
    .catch((err) => console.error("Server context update error:", err));
};
