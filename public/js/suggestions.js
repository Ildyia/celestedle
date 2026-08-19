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

    const addSuggestion = (word, priority, colors, isSynonym = false) => {
      const existing = matchingSuggestions.get(word);
      if (existing === undefined || priority < existing.priority) {
        matchingSuggestions.set(word, { priority, isSynonym, colors });
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
        addSuggestion(displayName, priority, [], true);
      }
    });

    const elements = Array.isArray(this.app.officialElementsList)
      ? this.app.officialElementsList
      : [];
    elements.forEach(({ nom, couleur }) => {
      const lowerName = nom.toLowerCase();
      if (lowerName.includes(query)) {
        const displayName = nom.charAt(0).toUpperCase() + nom.slice(1);
        const priority =
          lowerName === query ? 0 : lowerName.startsWith(query) ? 1 : 2;
        addSuggestion(displayName, priority, couleur, false);
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
          thumb.src = API_BASE_URL + `/sprite/${word}`;

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

          const colorNode = document.createElement("span");
          colorNode.className = "suggestion-colorblind-helper";
          colorNode.textContent = meta?.colors?.map(c => c.charAt(0).toUpperCase() + c.slice(1))?.join(", ") ?? "";

          div.appendChild(colorNode);

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
    const sortedElements = [...elements].sort((a, b) => a.nom.localeCompare(b.nom));

    sortedElements.forEach(({ nom: name }) => {
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      const div = document.createElement("div");
      div.classList.add("suggestion-item");

      const thumb = document.createElement("img");
      thumb.className = "suggestion-thumb";
      thumb.alt = displayName;
      thumb.src = API_BASE_URL + `/sprite/${displayName}`;

      const textNode = document.createElement("span");
      textNode.textContent = displayName;

      div.appendChild(thumb);
      div.appendChild(textNode);

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectSuggestion(displayName);
      });

      this.app.nodes.suggestionsBox.appendChild(div);
    });

    this.app.nodes.suggestionsBox.style.display = "block";
  },
};
