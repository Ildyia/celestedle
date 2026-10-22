import { spriteUrl } from "./api.js";
import { el, clear } from "./dom.js";
import { capitalize } from "./format.js";

// Liste déroulante sous le champ de saisie. Désactivée en mode Hard.
export class Suggestions {
  constructor({ input, box, showAllButton }) {
    this.input = input;
    this.box = box;
    this.showAllButton = showAllButton;
    this.elements = [];
    this.synonyms = {};
    this.enabled = true;
    this.minChars = 3;
    this.showAllAllowed = true;
    this.selectedIndex = -1;

    input.addEventListener("input", () => this.filter());
    input.addEventListener("keydown", (e) => this.handleKeyboard(e));
    showAllButton?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.value = "";
      this.showAll();
      this.input.focus();
    });
    document.addEventListener("click", (e) => {
      if (e.target !== this.input && !this.box.contains(e.target)) this.hide();
    });
  }

  setData({ elements, synonyms }) {
    if (elements) this.elements = elements;
    if (synonyms) this.synonyms = synonyms;
  }

  // Règles du mode : nombre de lettres avant suggestion, liste complète ou non
  setRules({ enabled, minChars, showAll }) {
    this.enabled = enabled;
    this.minChars = minChars;
    this.showAllAllowed = showAll;
    if (this.showAllButton) this.showAllButton.hidden = !(enabled && showAll);
    if (!enabled) this.hide();
  }

  hide() {
    clear(this.box);
    this.box.style.display = "none";
    this.selectedIndex = -1;
  }

  filter() {
    if (!this.enabled) return;
    const query = this.input.value.trim().toLowerCase();
    if (query.length < this.minChars) return this.hide();

    const matches = new Map();
    const add = (name, priority, colors, isSynonym) => {
      const existing = matches.get(name);
      if (!existing || priority < existing.priority) matches.set(name, { priority, colors, isSynonym });
    };
    const priorityOf = (name) => (name === query ? 0 : name.startsWith(query) ? 1 : 2);

    for (const [synonym, official] of Object.entries(this.synonyms)) {
      if (synonym.startsWith(query)) {
        const element = this.elements.find((e) => e.nom.toLowerCase() === official.toLowerCase());
        add(official, priorityOf(official.toLowerCase()), element?.couleur ?? [], true);
      }
    }
    for (const { nom, couleur } of this.elements) {
      const lower = nom.toLowerCase();
      if (lower.includes(query)) add(nom, priorityOf(lower), couleur, false);
    }

    const sorted = [...matches.entries()].sort(
      ([a, ma], [b, mb]) => ma.priority - mb.priority || a.localeCompare(b)
    );
    this.render(sorted.map(([name, meta]) => ({ name, ...meta })));
  }

  showAll() {
    if (!this.enabled || !this.showAllAllowed) return;
    const sorted = [...this.elements].sort((a, b) => a.nom.localeCompare(b.nom));
    this.render(sorted.map((e) => ({ name: e.nom, colors: e.couleur, isSynonym: false })));
  }

  render(items) {
    clear(this.box);
    this.selectedIndex = -1;
    if (items.length === 0) return this.hide();

    for (const item of items) {
      const row = el(
        "div",
        { className: "suggestion-item", dataset: { name: item.name } },
        [
          el("img", { className: "suggestion-thumb", attrs: { src: spriteUrl(item.name), alt: "", loading: "lazy" } }),
          el("span", { text: capitalize(item.name) }),
          item.isSynonym
            ? el("img", { className: "synonym-marker", attrs: { src: "assets/entities/switch.svg", alt: "(synonym)" } })
            : null,
          el("span", {
            className: "suggestion-colorblind-helper",
            text: (item.colors || []).map(capitalize).join(", ")
          })
        ]
      );
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.select(item.name);
      });
      this.box.append(row);
    }
    this.box.style.display = "block";
  }

  handleKeyboard(e) {
    const items = this.box.querySelectorAll(".suggestion-item");
    if (items.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      this.selectedIndex = (this.selectedIndex + step + items.length) % items.length;
      items.forEach((item, i) => item.classList.toggle("selected", i === this.selectedIndex));
      items[this.selectedIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && this.selectedIndex > -1) {
      e.preventDefault();
      this.select(items[this.selectedIndex].dataset.name);
    } else if (e.key === "Escape") {
      this.hide();
    }
  }

  select(name) {
    this.input.value = capitalize(name);
    this.hide();
    this.input.focus();
  }
}
