document.addEventListener("DOMContentLoaded", () => {
  App.init();
});

const App = {
  // --- Constants & State ---
  
  // Maps casual terms, typos or translations to the official dataset names
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
  },
  officialElementsList: [], // Holds the full list of elements fetched from the API
  historyLog: [],            // Stores the past guesses for the current session
  tryCount: 0,              // Tracks the total number of attempts
  selectedIndex: -1,        // Keeps track of the highlighted item in the autocomplete box
  nodes: {},                // Object cache for DOM element references

  // --- Core Lifecycle ---

  // Orchestrates application initialization workflow sequential steps
  init() {
    this.cacheDOM();
    this.checkDailyReset();
    this.checkApplicationVersion();
    this.loadGameState();
    this.fetchOfficialElements();
    this.bindEvents();
  },

  // Caches interactive DOM nodes references to prevent repeated selection lookups
  cacheDOM() {
    this.nodes = {
      form: document.getElementById("guess-form"),
      input: document.getElementById("element-input"),
      suggestionsBox: document.getElementById("element-suggestions"),
      tryCountSpan: document.getElementById("try-count"),
      shareBtn: document.getElementById("share-btn"),
      giveupBtn: document.getElementById("giveup-btn"),
      rulesBtn: document.getElementById("rules-btn"),
      tableBody: document.getElementById("guesses-body"),
    };
  },

  // Attaches event listeners for user input, form submissions and click triggers
  bindEvents() {
    if (this.nodes.input && this.nodes.suggestionsBox) {
      // Monitor text inputs to refresh the autocomplete suggestions dropdown
      this.nodes.input.addEventListener("input", (e) => this.handleSuggestionsFilter(e));
      // Intercept keypress events to handle dropdown navigation (Arrows + Enter)
      this.nodes.input.addEventListener("keydown", (e) => this.handleSuggestionsKeyboard(e));
    }

    // Process game submit actions
    if (this.nodes.form) {
      this.nodes.form.addEventListener("submit", (e) => this.handleFormSubmit(e));
    }

    // Open game guide modal view
    if (this.nodes.rulesBtn) {
      this.nodes.rulesBtn.addEventListener("click", () => this.renderRulesModal());
    }

    // Trigger surrender workflow
    if (this.nodes.giveupBtn) {
      this.nodes.giveupBtn.addEventListener("click", () => this.handleForfeit());
    }

    // Format results map to user clipboard profiles
    if (this.nodes.shareBtn) {
      this.nodes.shareBtn.addEventListener("click", () => this.handleShareScore());
    }

    // Dismiss active suggestion overlay panel upon broad context blur events
    document.addEventListener("click", (e) => this.handleOutsideClick(e));
  },

  // --- State & Storage Sync ---

  // Clears out active storage records when shifting onto a new day context
  checkDailyReset() {
    const todayDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const savedDate = localStorage.getItem("celestedle_date");

    // If dates mismatch, clear game variables to start fresh for the new daily puzzle
    if (savedDate !== todayDate) {
      const keysToRemove = ["tries", "gameover", "status", "history", "version", "solution"];
      keysToRemove.forEach(key => localStorage.removeItem(`celestedle_${key}`));
      localStorage.setItem("celestedle_date", todayDate);
    }
  },

  // Pulls remote application parameters to wipe obsolete states if a new database hash drops
  checkApplicationVersion() {
    fetch("https://celestedle-api.onrender.com/secret-version")
      .then((res) => res.json())
      .then((data) => {
        const savedVersion = localStorage.getItem("celestedle_version");
        // Reset local logs if an admin forces an immediate dataset patch update
        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = ["tries", "gameover", "status", "history"];
          keysToRemove.forEach(key => localStorage.removeItem(`celestedle_${key}`));
          localStorage.setItem("celestedle_version", data.secretVersion);
          location.reload();
        } else if (!savedVersion) {
          localStorage.setItem("celestedle_version", data.secretVersion);
        }
      });
  },

  // Hydrates counter elements, layout states and past attempts logs from LocalStorage variables
  loadGameState() {
    // Restore tries count data
    this.tryCount = parseInt(localStorage.getItem("celestedle_tries")) || 0;
    if (this.nodes.tryCountSpan) {
      this.nodes.tryCountSpan.textContent = this.tryCount;
    }

    // Rebuild grid log structure from historical steps array
    this.historyLog = JSON.parse(localStorage.getItem("celestedle_history")) || [];
    this.historyLog.forEach((data) => this.addTableRow(data));

    // Disable target inputs loops if user already won or surrendered earlier
    const isGameOver = localStorage.getItem("celestedle_gameover") === "true";
    if (isGameOver) {
      this.renderEndGameScreen();
    }
  },

  // Pre-fetches the list of canonical entity tags used to feed autocomplete algorithms
  fetchOfficialElements() {
    fetch("https://celestedle-api.onrender.com/api/elements")
      .then((res) => res.json())
      .then((elements) => {
        this.officialElementsList = elements;
      })
      .catch((err) => console.error("Error loading elements:", err));
  },

  // --- Autocomplete & Dropdown Engine ---

  // Parses active keystrokes to extract overlapping values among synonyms and valid items
  handleSuggestionsFilter(e) {
    const query = e.target.value.trim().toLowerCase();
    this.nodes.suggestionsBox.innerHTML = "";
    this.selectedIndex = -1;

    // Hide overlay container if text value gets completely wiped out
    if (query.length === 0) {
      this.nodes.suggestionsBox.style.display = "none";
      return;
    }

    const matchingSuggestions = new Set();

    // Check query bounds against alias shortcodes prefix mappings (e.g. typing "pi" shows "Bird")
    Object.keys(this.synonyms).forEach((syn) => {
      if (syn.startsWith(query)) {
        const officialName = this.synonyms[syn];
        matchingSuggestions.add(officialName.charAt(0).toUpperCase() + officialName.slice(1));
      }
    });

    // Fallback search evaluation loops over canonical entities strings (e.g. typing "bi" shows "Bird")
    this.officialElementsList.forEach((name) => {
      if (name.toLowerCase().includes(query)) {
        matchingSuggestions.add(name.charAt(0).toUpperCase() + name.slice(1));
      }
    });

    // Render HTML suggestion block rows from resulting calculation set
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

  // Interprets direction arrows and enter keys to surf the dynamic options stack
  handleSuggestionsKeyboard(e) {
    const items = this.nodes.suggestionsBox.querySelectorAll(".suggestion-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault(); // Stop native viewport scrolling behaviors
      this.selectedIndex++;
      if (this.selectedIndex >= items.length) this.selectedIndex = 0; // Wrap back to the top
      this.updateSelectionHighlight(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex--;
      if (this.selectedIndex < 0) this.selectedIndex = items.length - 1; // Wrap around to the bottom
      this.updateSelectionHighlight(items);
    } else if (e.key === "Enter") {
      // If a dropdown option is highlighted, apply it instead of executing full form submission
      if (this.selectedIndex > -1 && items[this.selectedIndex]) {
        e.preventDefault();
        this.selectSuggestion(items[this.selectedIndex].textContent);
      }
    }
  },

  // Shifts visual active states classes across the target nodes arrays and scrolls them into focus
  updateSelectionHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" }); // Keeps active item visible inside overflow setups
      } else {
        item.classList.remove("selected");
      }
    });
  },

  // Injects chosen string patterns inside the search element and hides the panel layer
  selectSuggestion(word) {
    this.nodes.input.value = word;
    this.nodes.suggestionsBox.innerHTML = "";
    this.nodes.suggestionsBox.style.display = "none";
    this.selectedIndex = -1;
    this.nodes.input.focus();
  },

  // Shuts down autocomplete menus if clicks occur outside the target input structures
  handleOutsideClick(e) {
    if (e.target !== this.nodes.input && e.target !== this.nodes.suggestionsBox) {
      this.nodes.suggestionsBox.style.display = "none";
    }
  },

  // --- Handlers & Network Events ---

  // Fires verification request vectors to compare the current answer string against database variables
  handleFormSubmit(e) {
    e.preventDefault();
    let choice = this.nodes.input ? this.nodes.input.value.trim().toLowerCase() : "";

    // Convert raw input if it matches any pre-configured synonym alias
    if (this.synonyms[choice]) choice = this.synonyms[choice];
    if (!choice) return;

    fetch("https://celestedle-api.onrender.com/api/valider", {
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

        // Force an app reset if database tables undergo mid-day configurations changes
        if (savedVersion && savedVersion !== String(data.secretVersion)) {
          const keysToRemove = ["tries", "gameover", "status", "history"];
          keysToRemove.forEach(key => localStorage.removeItem(`celestedle_${key}`));
          localStorage.setItem("celestedle_version", data.secretVersion);
          alert("The secret word has been changed by an admin ! Your tries have been reset !");
          location.reload();
          return;
        }

        if (!savedVersion) {
          localStorage.setItem("celestedle_version", data.secretVersion);
        }

        // Increment attempts counters values
        this.tryCount++;
        localStorage.setItem("celestedle_tries", this.tryCount);
        if (this.nodes.tryCountSpan) this.nodes.tryCountSpan.textContent = this.tryCount;

        // Push valid row response metadata inside storage slots array logs
        this.historyLog.push(data);
        localStorage.setItem("celestedle_history", JSON.stringify(this.historyLog));

        // Inject new status tracking items to results display grids
        this.addTableRow(data);
        if (this.nodes.input) this.nodes.input.value = "";
        if (this.nodes.suggestionsBox) this.nodes.suggestionsBox.style.display = "none";

        // Handle full victory setup routines
        if (data.verdict.isCorrect) {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
          localStorage.setItem("celestedle_gameover", "true");
          localStorage.setItem("celestedle_status", "win");
          location.reload();
        }
      })
      .catch((err) => {
        alert("This element does not exist");
        console.error("Submit processing error:", err);
      });
  },

  // Contacts backend routes to reveal daily solutions upon premature match termination
  handleForfeit() {
    if (!confirm("Are you sure you want to give up?")) return;

    fetch("https://celestedle-api.onrender.com/api/getSecretWord", {
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

  // Transforms historical rows items into clean matrix boxes and writes them into system clipboard scopes
  handleShareScore() {
    const isWin = localStorage.getItem("celestedle_status") !== "lose";
    let shareOutputText = isWin
      ? `Celestedle of the day in ${this.tryCount} tries\n\n`
      : `Celestedle of the day : Forfeit ❌ (${this.tryCount} tries)\n\n`;

    const scoreToEmojiMap = { correct: "🟩", partial: "🟨", notTotallyWrong: "🟧", wrong: "🟥" };

    // Formats result grid row structures map into an emoji block layout string
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
        setTimeout(() => { this.nodes.shareBtn.textContent = "Share result"; }, 2000);
      })
      .catch((err) => console.error("Could not write clip path data:", err));
  },

  // --- HTML Rendering & DOM Mutation ---

  // Appends static message templates inside the viewport frame once a game resolves
  renderEndGameScreen() {
    this.nodes.form.style.display = "none";
    if (this.nodes.giveupBtn) this.nodes.giveupBtn.style.display = "none";
    if (this.nodes.shareBtn) this.nodes.shareBtn.style.display = "block";

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
    this.nodes.form.parentNode.insertBefore(messageContainer, this.nodes.form);
  },

  // Creates and throws full popup tutorial descriptions over active interface backgrounds
  renderRulesModal() {
    const rulesModal = document.createElement("div");
    rulesModal.classList.add("rules-modal");

    rulesModal.innerHTML = `
      <div class="rules-content">
        <button class="close-rules-btn">&times;</button>
        <h2>Rules of Celestedle</h2>
        <p>Guess the secret element of the day by entering its name. After each guess, you'll receive feedback on how close your guess is to the secret element based on its type, location, color, and hitbox.</p>
        <h4> What is the difference between the categories ?</h4>
        <ul>
            <li><strong>Collectibles</strong>: These are items that can be collected in the game, such as strawberries or golden strawberries.</li>
            <li><strong>Characters</strong>: These are the characters that appear in the game, such as Theo, Granny, or Oshiro.</li>
            <li><strong>Environments</strong>: These are the entities that do not affect the gameplay, such as Binoculars or Breakable Walls.</li>
            <li><strong>Mechanics</strong>: These are the entities that affects the gameplay, such as crumble blocks or core switchs.</li>
            <li><strong>Movement and propulsion :</strong> These are the entities that the player will use to gain speed or to move in the room, such as moving block or boosters</li>
            <li><strong>Hazards</strong>: These are the entities that will kill the player if touched, such as spikes or spinners.</li>
        </ul>
        <h4>And the colors ?</h4>
        <ul>
          <li><span style="color: var(--color-correct);">🟩 Correct</span>: The guessed attribute matches the secret element's attribute.</li>
          <li><span style="color: var(--color-partial);">🟨 Partial</span>: The guessed attribute is partially correct, i.e. the submitted answer is part of the correct answer. ex: If the correct answer is "Red, Blue" and the guessed attribute is "Red", it would be considered "Partial"</li>
          <li><span style="color: var(--color-notTotallyWrong);">🟧 Not Totally Wrong</span>: The guessed attribute contains the correct answer, but contains too wrong elements. ex: If the correct answer is "Red" and the guessed attribute is "Red, Blue", it would be considered "Not Totally Wrong"</li>
          <li><span style="color: var(--color-wrong);">🟥 Wrong</span>: The guessed attribute is incorrect.</li>
        </ul>
        <p>You have unlimited tries, but you can choose to forfeit if you give up. Good luck!</p>
      </div>
    `;

    // Close the overlay modal if user clicks on the backdrop background frame or close button
    rulesModal.addEventListener("click", (e) => {
      if (e.target === rulesModal || e.target.classList.contains("close-rules-btn")) {
        rulesModal.remove();
      }
    });

    document.body.appendChild(rulesModal);
  },

  // Inserts analytical dynamic row entities at the first child slot of the results log grid
  addTableRow(data) {
    if (!this.nodes.tableBody) return;

    const row = document.createElement("tr");
    // Small helper module closure to abstract row cell creations parameters
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

    // Pre-pend structural row nodes to ensure the newest attempts show up on top
    this.nodes.tableBody.insertBefore(row, this.nodes.tableBody.firstChild);
  }
};

// --- Developer Console Admin Accessors ---

// Prompts for secret password to read out the backend daily answer string without terminating the match
window.getSecretWordPlzUwU = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  fetch("https://celestedle-api.onrender.com/api/admin/verifier-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminPassword }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    })
    .then(() => {
      fetch("https://celestedle-api.onrender.com/api/getSecretWord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then((res) => res.json())
        .then((data) => { alert("The secret element of the day is : " + data.secretElement); })
        .catch((err) => console.error("Error fetching admin key parameters:", err));
    })
    .catch((err) => alert(err.message));
};

// Prompts for password to clear out all storage records and reset execution sessions contexts
window.forceReset = function () {
  const adminPassword = prompt("Please enter admin password :");
  if (!adminPassword) return;

  fetch("https://celestedle-api.onrender.com/api/admin/verifier-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: adminPassword }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Incorrect credentials");
      return res.json();
    })
    .then(() => {
      const keysToRemove = ["tries", "gameover", "status", "history", "date", "version"];
      keysToRemove.forEach(key => localStorage.removeItem(`celestedle_${key}`));
      alert("Local data wiped ! Reloading window context structure.");
    })
    .catch((err) => alert(err.message));
};

// Dispatches command structures to randomize the active daily item configuration parameters
window.randomSecret = function (reset = false) {
  const adminPassword = prompt("Please enter admin password:");
  if (!adminPassword) return;
  let newHash = Math.floor(Math.random() * 1000000000);
  if (reset) newHash = null;

  fetch("https://celestedle-api.onrender.com/api/admin/random-Hash", {
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