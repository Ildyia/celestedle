export const ModalService = {
  openPersonalizedModal(appContext) {
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
    this.renderSynonymsList(modal, appContext);

    modal.querySelector("#close-synonyms-btn").addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    modal.querySelector("#save-synonyms-btn").addEventListener("click", () => {
      appContext.handlePersonalizedSynonymAdd(modal);
    });
  },

  renderSynonymsList(modal, appContext) {
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
        delete appContext.synonyms[keyToDelete];

        const currentSaved = JSON.parse(localStorage.getItem("celestedle_synonyms") || "{}");
        delete currentSaved[keyToDelete];

        localStorage.setItem("celestedle_synonyms", JSON.stringify(currentSaved));
        this.renderSynonymsList(modal, appContext);
      });

      container.appendChild(li);
    });
  }
};