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
  },
  officialElementsList: [],
  historyLog: [],
  tryCount: 0,
  selectedIndex: -1,
  nodes: {},

  init() {
    this.cacheDOM();
    this.checkDailyReset();
    this.checkApplicationVersion();
    this.loadGameState();
    this.fetchOfficialElements();
    this.bindEvents();
    this.fetchPersonalizedSynonyms();
    initTimer(this.nodes.timerContainer);
  },

  cacheDOM() {
    this.nodes = {
      form: document.getElementById("guess-form"),
      input: document.getElementById("element-input"),
      suggestionsBox: document.getElementById("element-suggestions"),
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
    };
  },

  bindEvents() {
    if (this.nodes.input && this.nodes.suggestionsBox) {
      this.nodes.input.addEventListener("input", (e) => this.handleSuggestionsFilter(e));
      this.nodes.input.addEventListener("keydown", (e) => this.handleSuggestionsKeyboard(e));
    }
    if (this.nodes.personalizedBtn) {
      this.nodes.personalizedBtn.addEventListener("click", () => ModalService.openPersonalizedModal(this));
    }
    if (this.nodes.form) {
      this.nodes.form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }
    if (this.nodes.rulesBtn) {
      this.nodes.rulesBtn.addEventListener("click", () => this.renderRulesModal());
    }
    if (this.nodes.giveupBtn) {
      this.nodes.giveupBtn.addEventListener("click", () => {
        if (this.nodes.forfeitModal) this.nodes.forfeitModal.style.display = "flex";
      });
    }
    if (this.nodes.cancelForfeitBtn) {
      this.nodes.cancelForfeitBtn.addEventListener("click", () => {
        if (this.nodes.forfeitModal) this.nodes.forfeitModal.style.display = "none";
      });
    }
    if (this.nodes.confirmForfeitBtn) {
      this.nodes.confirmForfeitBtn.addEventListener("click", () => this.handleForfeit());
    }
    if (this.nodes.shareBtn) {
      this.nodes.shareBtn.addEventListener("click", () => this.handleShareScore());
    }
    document.addEventListener("click", (e) => this.handleOutsideClick(e));
  },

  checkDailyReset() {
    const todayDate = new Date().toLocaleDateString("sv-SE", {
      timeZone: "Europe/Paris",
    });
    const savedDate = localStorage.getItem("celestedle_date");

    if (savedDate !== todayDate) {
      const keysToRemove = ["tries", "gameover", "status", "history", "version", "solution"];
      keysToRemove.forEach((key) => localStorage.removeItem(`celestedle_${key}`));
      localStorage.setItem("celestedle_date", todayDate);
    }
  },

  checkApplicationVersion() {
    ApiService.fetchSecretVersion().then((data) => {
      const savedVersion = localStorage.getItem("celestedle_version");
      if (savedVersion && savedVersion !== String(data.secretVersion)) {
        const keysToRemove = ["tries", "gameover", "status", "history"];
        keysToRemove.forEach((key) => localStorage.removeItem(`celestedle_${key}`));
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

    this.historyLog = JSON.parse(localStorage.getItem("celestedle_history")) || [];
    this.historyLog.forEach((data) => this.addTableRow(data));

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
      })
      .catch((err) => console.error("Error loading elements:", err));
  },

  handleSuggestionsFilter(e) {
    const query = e.target.value.trim().toLowerCase();
    this.nodes.suggestionsBox.innerHTML = "";
    this.selectedIndex = -1;

    if (query.length === 0) {
      this.nodes.suggestionsBox.style.display = "none";
      return;
    }

    const matchingSuggestions = new Set();

    Object.keys(this.synonyms).forEach((syn) => {
      if (syn.startsWith(query)) {
        const officialName = this.synonyms[syn];
        matchingSuggestions.add(officialName.charAt(0).toUpperCase() + officialName.slice(1));
      }
    });

    this.officialElementsList.forEach((name) => {
      if (name.toLowerCase().includes(query)) {
        matchingSuggestions.add(name.charAt(0).toUpperCase() + name.slice(1));
      }
    });

    if (matchingSuggestions.size > 0) {
      matchingSuggestions.forEach((word) => {
        const div = document.createElement("div");
        div.classList.add("suggestion-item");
        div.textContent = word;
        div.addEventListener("click", () => this.selectSuggestion(word));
        this.nodes.suggestionsBox.appendChild(div);
      });
      this.nodes.suggestionsBox.style.display = "block";
    } else {
      this.nodes.suggestionsBox.style.display = "none";
    }
  },

  handleSuggestionsKeyboard(e) {
    const items = this.nodes.suggestionsBox.querySelectorAll(".suggestion-item");
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
    if (e.target !== this.nodes.input && e.target !== this.nodes.suggestionsBox) {
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
    let choice = this.nodes.input ? this.nodes.input.value.trim().toLowerCase() : "";

    if (this.synonyms[choice]) choice = this.synonyms[choice];

    const alreadyGuessed = this.historyLog.some((attempt) => attempt.nom.toLowerCase() === choice);
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

    ApiService.validateGuess(choice)
      .then((data) => {
        const savedVersion = localStorage.getItem("celestedle_version");

        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = ["tries", "gameover", "status", "history"];
          keysToRemove.forEach((key) => localStorage.removeItem(`celestedle_${key}`));
          localStorage.setItem("celestedle_version", data.secretVersion);

          this.showToastNotification("The secret word has been changed by an admin ! Your tries have been reset !");
          setTimeout(() => location.reload(), 2500);
          this.isProcessing = false;
          return;
        }

        if (!savedVersion) {
          localStorage.setItem("celestedle_version", data.secretVersion);
        }

        this.tryCount++;
        localStorage.setItem("celestedle_tries", this.tryCount);
        if (this.nodes.tryCountSpan) this.nodes.tryCountSpan.textContent = this.tryCount;

        this.historyLog.push(data);
        localStorage.setItem("celestedle_history", JSON.stringify(this.historyLog));

        this.addTableRow(data);
        if (this.nodes.input) this.nodes.input.value = "";
        if (this.nodes.suggestionsBox) this.nodes.suggestionsBox.style.display = "none";

        if (data.verdict.isCorrect) {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "win");
          location.reload();
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

    const officialExists = this.officialElementsList.some((element) => element.toLowerCase() === value);

    if (!officialExists) {
      errorContainer.textContent = `"${value}" is not a valid official element name.`;
      errorContainer.style.display = "block";
      return;
    }

    this.synonyms[key] = value;

    const currentSaved = JSON.parse(localStorage.getItem("celestedle_synonyms") || "{}");
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
        if (data.secretElement) localStorage.setItem("celestedle_solution", data.secretElement);
        location.reload();
      })
      .catch((err) => {
        console.error("Error during forfeit processing:", err);
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        location.reload();
      });
  },

  handleShareScore() {
    const isWin = localStorage.getItem("celestedle_status") !== "lose";
    let shareOutputText = isWin ? `Celestedle of the day in ${this.tryCount} tries\n\n` : `Celestedle of the day : Forfeit ❌ (${this.tryCount} tries)\n\n`;

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
    this.nodes.form.style.display = "none";
    if (this.nodes.giveupBtn) this.nodes.giveupBtn.style.display = "none";
    if (this.nodes.shareBtn) this.nodes.shareBtn.style.setProperty("display", "inline-flex", "important");

    const gameStatus = localStorage.getItem("celestedle_status");
    const isWin = gameStatus !== "lose";
    const messageContainer = document.createElement("div");

    messageContainer.className = isWin ? "win-message" : "lose-message";
    const title = isWin ? "GG ! Victory ! 🎉" : "Nice try... Forfeit ! ❌";

    const solution = localStorage.getItem("celestedle_solution") || "Unknown";
    const formattedSolution = solution.charAt(0).toUpperCase() + solution.slice(1);

    const matchSummary = isWin
      ? `You found the secret element in <strong>${this.tryCount}</strong> tries.`
      : `You didn't find today's celestedle ! The answer was : <strong>${formattedSolution}</strong>`;

    messageContainer.innerHTML = `<h2>${title}</h2><p>${matchSummary}</p>`;
    const targetContainer = document.getElementById("message-container");
    if (targetContainer) {
      targetContainer.appendChild(messageContainer);
    } else {
      this.nodes.form.parentNode.insertBefore(messageContainer, this.nodes.form);
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
    row.appendChild(createCell(formattedName, data.verdict?.isCorrect ? "correct" : "wrong"));
    row.appendChild(createCell(data.valeurs?.type || "-", data.verdict?.type));
    row.appendChild(createCell(data.valeurs?.lieu || "-", data.verdict?.lieu));
    row.appendChild(createCell(data.valeurs?.couleur || "-", data.verdict?.couleur));
    row.appendChild(createCell(data.valeurs?.hitbox || "-", data.verdict?.hitbox));

    this.nodes.tableBody.insertBefore(row, this.nodes.tableBody.firstChild);
  },
};

// --- Commandes Globales Admin ---
window.getSecretWordPlzUwU = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  ApiService.verifyAdminKey(adminPassword)
    .then(() => ApiService.getSecretWordAdmin())
    .then((data) => alert("The secret element of the day is : " + data.secretElement))
    .catch((err) => alert(err.message));
};

window.forceReset = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  ApiService.verifyAdminKey(adminPassword)
    .then(() => {
      const keysToRemove = ["tries", "gameover", "status", "history", "date", "version"];
      keysToRemove.forEach((key) => localStorage.removeItem(`celestedle_${key}`));
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
