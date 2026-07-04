document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
const API_BASE_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "https://celestedle-api.onrender.com"
    : "https://celestedle-api.mizkyosia.fr";
const App = {
  // --- Constants & State ---
  synonyms: {
    cassette: "cassette tape",
    tape: "cassette tape",
    tile: "tiles",
    crumble: "crumble block",
    crumbleblock: "crumble block",
    jumpthroughs: "jumpthrough",
    "blue booster": "green booster",
    piaf: "bird",
    oiseau: "bird",
    "moving block": "move block",
    zippers: "zip movers",
    "cristal spinner": "crystal spinner",
    "electricity box": "power box",
    "electricity":"lightning", 
    "button": "dash switch",
    "huge mess switch": "clutter switch",
    "mess switch": "clutter switch",
    "huge mess tiles": "clutter tiles",
    "mess tiles": "clutter tiles",
    "dash refill": "refill",
    "dash crystal": "refill",
    "key gate": "lock"
  },
  officialElementsList: [],
  historyLog: [],
  tryCount: 0,
  selectedIndex: -1,
  nodes: {},

  // --- Core Lifecycle ---
  init() {
    this.cacheDOM();
    this.checkDailyReset();
    this.checkApplicationVersion();
    this.loadGameState();
    this.fetchOfficialElements();
    this.bindEvents();
    this.fetchPersonalizedSynonyms();
    this.initTimer(); // Ajout ici
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
      personalizedBtn: document.getElementById("Personalized-btn"),
      tableBody: document.getElementById("guesses-body"),
      forfeitModal: document.getElementById("forfeit-modal"),
      confirmForfeitBtn: document.getElementById("confirm-forfeit-btn"),
      cancelForfeitBtn: document.getElementById("cancel-forfeit-btn"),
      timerContainer: document.getElementById("next-word-timer"),
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
    if (this.nodes.personalizedBtn) {
    this.nodes.personalizedBtn.addEventListener("click", () => 
      this.handlePersonalizedModalOpen()
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

    document.addEventListener("click", (e) => this.handleOutsideClick(e));
  },

  // --- State & Storage Sync ---
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
      ];
      keysToRemove.forEach((key) =>
        localStorage.removeItem(`celestedle_${key}`),
      );
      localStorage.setItem("celestedle_date", todayDate);
    }
  },

  checkApplicationVersion() {
    fetch(`${API_BASE_URL}/secret-version`)
      .then((res) => res.json())
      .then((data) => {
        const savedVersion = localStorage.getItem("celestedle_version");
        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = ["tries", "gameover", "status", "history"];
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

    this.historyLog =
      JSON.parse(localStorage.getItem("celestedle_history")) || [];
    this.historyLog.forEach((data) => this.addTableRow(data));

    const isGameOver = localStorage.getItem("celestedle_gameover") === "true";
    if (isGameOver) {
      this.renderEndGameScreen();
    }
  },
  initTimer() {
    if (!this.nodes.timerContainer) return;

    const updateTimer = () => {
      const now = new Date();
      
      const nextReset = new Date(now);
      nextReset.toLocaleString("en-US", { timeZone: "Europe/Paris" });
      nextReset.setHours(24, 0, 0, 0); 

      const diff = nextReset - now;

      if (diff <= 0) {
        this.nodes.timerContainer.textContent = "00:00:00";
        setTimeout(() => location.reload(), 1000);
        return;
      }

      const hours = String(Math.floor((diff / (1000 * 60 * 60)) % 24)).padStart(2, "0");
      const minutes = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, "0");
      const seconds = String(Math.floor((diff / 1000) % 60)).padStart(2, "0");

      this.nodes.timerContainer.textContent = `${hours}:${minutes}:${seconds}`;
    };

    updateTimer();
    setInterval(updateTimer, 1000);
  },

  /// --- Fetching personalizerd synonyms in local data ---
  fetchPersonalizedSynonyms() {
    const savedSynonyms = localStorage.getItem("celestedle_synonyms");
    if (savedSynonyms) {
      //add personnalized synonyms to the current synonyms list
      const parsedSynonyms = JSON.parse(savedSynonyms);
      Object.keys(parsedSynonyms).forEach((key) => {
        this.synonyms[key] = parsedSynonyms[key];
      });
    }
  },

  fetchOfficialElements() {
    fetch(`${API_BASE_URL}/api/elements`)
      .then((res) => res.json())
      .then((elements) => {
        this.officialElementsList = elements;
      })
      .catch((err) => console.error("Error loading elements:", err));
  },

  // --- Autocomplete Engine ---
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
        matchingSuggestions.add(
          officialName.charAt(0).toUpperCase() + officialName.slice(1),
        );
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
      e.target !== this.nodes.input &&
      e.target !== this.nodes.suggestionsBox
    ) {
      this.nodes.suggestionsBox.style.display = "none";
    }
  },

  // --- Handlers & Game Actions ---
  handleFormSubmit(e) {
    e.preventDefault();
    let choice = this.nodes.input
      ? this.nodes.input.value.trim().toLowerCase()
      : "";

    if (this.synonyms[choice]) choice = this.synonyms[choice];
    if (!choice) return;

    fetch(`${API_BASE_URL}/api/valider`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choix: choice }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid entities or server error");
        return res.json();
      })
      .then((data) => {
        const savedVersion = localStorage.getItem("celestedle_version");

        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = ["tries", "gameover", "status", "history"];
          keysToRemove.forEach((key) =>
            localStorage.removeItem(`celestedle_${key}`),
          );
          localStorage.setItem("celestedle_version", data.secretVersion);

          this.showToastNotification(
            "The secret word has been changed by an admin ! Your tries have been reset !",
          );
          setTimeout(() => location.reload(), 2500);
          return;
        }

        if (!savedVersion) {
          localStorage.setItem("celestedle_version", data.secretVersion);
        }

        this.tryCount++;
        localStorage.setItem("celestedle_tries", this.tryCount);
        if (this.nodes.tryCountSpan)
          this.nodes.tryCountSpan.textContent = this.tryCount;

        this.historyLog.push(data);
        localStorage.setItem(
          "celestedle_history",
          JSON.stringify(this.historyLog),
        );

        this.addTableRow(data);
        if (this.nodes.input) this.nodes.input.value = "";
        if (this.nodes.suggestionsBox)
          this.nodes.suggestionsBox.style.display = "none";

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
  

  handlePersonalizedModalOpen() {
    if (document.querySelector(".personalized-synonyms-modal")) return;

    const modal = document.createElement("div");
    modal.className = "personalized-synonyms-modal";
    
    modal.innerHTML = `
      <span id="close-synonyms-btn">&times;</span>
      <h3>Personalized Synonyms</h3>
      <p>Current list:</p>
      <ul id="synonyms-list-container"></ul>
      <p>Add a new synonym:</p>
      <div class="input-row">
          <input type="text" id="synonym-key-input" placeholder="synonym">
          <input type="text" id="synonym-value-input" placeholder="official name">
      </div>
      <div id="synonym-error-msg"></div>
      <button id="save-synonyms-btn">Add</button>
    `;

    document.body.appendChild(modal);
    this.renderPersonalizedSynonymsList(modal);

    modal.querySelector("#close-synonyms-btn").addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    modal.querySelector("#save-synonyms-btn").addEventListener("click", () => {
      this.handlePersonalizedSynonymAdd(modal);
    });
  },

  renderPersonalizedSynonymsList(modal) {
    const container = modal.querySelector("#synonyms-list-container");
    container.innerHTML = "";
    
    const savedSynonyms = localStorage.getItem("celestedle_synonyms");
    const personalizedList = savedSynonyms ? JSON.parse(savedSynonyms) : {};
    const entries = Object.entries(personalizedList);
    
    if (entries.length === 0) {
      container.innerHTML = `<li style="color: var(--text-muted); font-size: 0.9rem;">No personalized synonyms added yet.</li>`;
      return;
    }

    entries.forEach(([syn, off]) => {
      const li = document.createElement("li");
      li.className = "synonym-item-row";
      li.innerHTML = `
        <span><strong>${syn}</strong> &rarr; ${off}</span>
        <button class="delete-syn-btn" data-key="${syn}">&times;</button>
      `;
      
      li.querySelector(".delete-syn-btn").addEventListener("click", (e) => {
        const keyToDelete = e.target.getAttribute("data-key");
        delete this.synonyms[keyToDelete];
        
        const currentSaved = JSON.parse(localStorage.getItem("celestedle_synonyms") || "{}");
        delete currentSaved[keyToDelete];
        
        localStorage.setItem("celestedle_synonyms", JSON.stringify(currentSaved));
        this.renderPersonalizedSynonymsList(modal);
      });

      container.appendChild(li);
    });
  },
handlePersonalizedSynonymAdd(modal) {
    const keyInput = document.getElementById("synonym-key-input");
    const valueInput = document.getElementById("synonym-value-input");
    const errorContainer = document.getElementById("synonym-error-msg");
    
    const key = keyInput.value.trim().toLowerCase();
    const value = valueInput.value.trim().toLowerCase();
    
    // Réinitialise le message d'erreur
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
      (element) => element.toLowerCase() === value
    );

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
    
    this.renderPersonalizedSynonymsList(modal);
  },

  handleForfeit() {
    fetch(`${API_BASE_URL}/api/getSecretWord`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server error during forfeit");
        return res.json();
      })
      .then((data) => {
        localStorage.setItem("celestedle_gameover", "true");
        localStorage.setItem("celestedle_status", "lose");
        if (data.secretElement)
          localStorage.setItem("celestedle_solution", data.secretElement);
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
    let shareOutputText = isWin
      ? `Celestedle of the day in ${this.tryCount} tries\n\n`
      : `Celestedle of the day : Forfeit ❌ (${this.tryCount} tries)\n\n`;

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

  // --- UI Layout & Component Rendering ---
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
    if (this.nodes.shareBtn)
      this.nodes.shareBtn.style.setProperty(
        "display",
        "inline-flex",
        "important",
      );

    const gameStatus = localStorage.getItem("celestedle_status");
    const isWin = gameStatus !== "lose";
    const messageContainer = document.createElement("div");

    messageContainer.className = isWin ? "win-message" : "lose-message";
    const title = isWin ? "GG ! Victory ! 🎉" : "Nice try... Aba(n)ddon ! ❌";

    const solution = localStorage.getItem("celestedle_solution") || "Unknown";
    const formattedSolution =
      solution.charAt(0).toUpperCase() + solution.slice(1);

    const matchSummary = isWin
      ? `You found the secret element in <strong>${this.tryCount}</strong> tries.`
      : `You didn't find today's celestedle ! The answer was : <strong>${formattedSolution}</strong>`;

    messageContainer.innerHTML = `<h2>${title}</h2><p>${matchSummary}</p>`;
    const targetContainer = document.getElementById("message-container");
    if (targetContainer) {
      targetContainer.appendChild(messageContainer);
    } else {
      this.nodes.form.parentNode.insertBefore(messageContainer, this.nodes.form);
}  },

  // Intercept and replace old modal injection with clean sidebar layout toggle
  renderRulesModal() {
    const sidebar = document.getElementById("rules-sidebar");
    if (!sidebar) return;

    if (sidebar.style.display === "none") {
      sidebar.style.display = "block";
    } else {
      sidebar.style.display = "none";
    }
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
    row.appendChild(
      createCell(formattedName, data.verdict?.isCorrect ? "correct" : "wrong"),
    );
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
};



// --- Console Admin Accessors ---
window.getSecretWordPlzUwU = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  fetch(`${API_BASE_URL}/api/admin/verifier-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminPassword }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    })
    .then(() => {
      fetch(`${API_BASE_URL}/api/getSecretWord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => {
          alert("The secret element of the day is : " + data.secretElement);
        })
        .catch((err) =>
          console.error("Error fetching admin key parameters:", err),
        );
    })
    .catch((err) => alert(err.message));
};

window.forceReset = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  fetch(`${API_BASE_URL}/api/admin/verifier-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminPassword }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    })
    .then(() => {
      const keysToRemove = [
        "tries",
        "gameover",
        "status",
        "history",
        "date",
        "version",
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

  fetch(`${API_BASE_URL}/api/admin/random-Hash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminPassword, newHash: newHash }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) alert("Error : " + data.error);
      else alert(data.message);
    })
    .catch((err) => console.error("Server context update error:", err));
};
