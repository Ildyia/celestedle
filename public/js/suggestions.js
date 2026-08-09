export const SuggestionsManager = {
  init(app) {
    this.app = app;
  },

  handleFilter(e) {
    const query = e.target.value.trim().toLowerCase();
    this.app.nodes.suggestionsBox.innerHTML = "";
    this.app.selectedIndex = -1;

    if (query.length < 3) {
      this.app.nodes.suggestionsBox.style.display = "none";
      return;
    }

    const matchingSuggestions = new Map();

    const addSuggestion = (word, priority, isSynonym = false) => {
      const existing = matchingSuggestions.get(word);
      if (existing === undefined || priority < existing.priority) {
        matchingSuggestions.set(word, { priority, isSynonym });
      }
    };

    Object.keys(this.app.synonyms).forEach((syn) => {
      if (syn.startsWith(query)) {
        const officialName = this.app.synonyms[syn];
        const displayName =
          officialName.charAt(0).toUpperCase() + officialName.slice(1);
        const lowerName = officialName.toLowerCase();
        const priority =
          lowerName === query ? 0 : lowerName.startsWith(query) ? 1 : 2;
        addSuggestion(displayName, priority, true);
      }
    });

    const elements = Array.isArray(this.app.officialElementsList)
      ? this.app.officialElementsList
      : [];
    elements.forEach((name) => {
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
          this.app.resolveEntityImage(key).then((path) => {
            if (path) thumb.src = path;
          });

          div.addEventListener("click", () => this.selectSuggestion(word));
          this.app.nodes.suggestionsBox.appendChild(div);
        });
      this.app.nodes.suggestionsBox.style.display = "block";
    } else {
      this.app.nodes.suggestionsBox.style.display = "none";
    }
  },

  handleKeyboard(e) {
    const items =
      this.app.nodes.suggestionsBox.querySelectorAll(".suggestion-item");
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.app.selectedIndex++;
      if (this.app.selectedIndex >= items.length) this.app.selectedIndex = 0;
      this.updateSelectionHighlight(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.app.selectedIndex--;
      if (this.app.selectedIndex < 0) this.app.selectedIndex = items.length - 1;
      this.updateSelectionHighlight(items);
    } else if (e.key === "Enter") {
      if (this.app.selectedIndex > -1 && items[this.app.selectedIndex]) {
        e.preventDefault();
        this.selectSuggestion(items[this.app.selectedIndex].textContent);
      }
    }
  },

  updateSelectionHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.app.selectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  },

  selectSuggestion(word) {
    this.app.nodes.input.value = word;
    this.app.nodes.suggestionsBox.innerHTML = "";
    this.app.nodes.suggestionsBox.style.display = "none";
    this.app.selectedIndex = -1;
    this.app.nodes.input.focus();
  },

  showAll() {
    if (!this.app.nodes.suggestionsBox) return;
    this.app.nodes.suggestionsBox.innerHTML = "";
    this.app.selectedIndex = -1;

    const elements = Array.isArray(this.app.officialElementsList)
      ? this.app.officialElementsList
      : [];
    const sortedElements = [...elements].sort((a, b) => a.localeCompare(b));

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

      this.app.resolveEntityImage(name.toLowerCase()).then((path) => {
        if (path) thumb.src = path;
      });

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectSuggestion(displayName);
      });

      this.app.nodes.suggestionsBox.appendChild(div);
    });

    this.app.nodes.suggestionsBox.style.display = "block";
  },
};
