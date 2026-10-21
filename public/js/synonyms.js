import { el, clear, byId, openModal } from "./dom.js";
import { storage, KEYS } from "./storage.js";

// Synonymes : officiels (serveur, aliases.json) + personnels (ce navigateur)
export class Synonyms {
  constructor() {
    this.official = {};
    this.personal = storage.getJson(KEYS.synonyms, {});
    this.listeners = new Set();
  }

  setOfficial(map) {
    this.official = map || {};
    this.emit();
  }

  all() {
    return { ...this.official, ...this.personal };
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  emit() {
    this.listeners.forEach((listener) => listener(this.all()));
  }

  // Nom à envoyer au serveur pour ce que le joueur a tapé
  resolve(input) {
    const key = input.trim().toLowerCase();
    const target = this.all()[key];
    return target ? { guess: target, synonymOf: input.trim() } : { guess: input.trim(), synonymOf: null };
  }

  addPersonal(key, value) {
    this.personal[key] = value;
    storage.setJson(KEYS.synonyms, this.personal);
    this.emit();
  }

  removePersonal(key) {
    delete this.personal[key];
    storage.setJson(KEYS.synonyms, this.personal);
    this.emit();
  }
}

// Fenêtre « Manage Custom Synonyms »
export function bindSynonymsModal(synonyms, getElements) {
  const list = byId("synonyms-list");
  const keyInput = byId("synonym-key-input");
  const valueInput = byId("synonym-value-input");
  const error = byId("synonym-error-msg");

  function render() {
    clear(list);
    const entries = Object.entries(synonyms.personal);
    if (entries.length === 0) {
      list.append(el("li", { className: "small-subtext", text: "No personalized synonyms added yet." }));
      return;
    }
    for (const [key, value] of entries) {
      list.append(
        el("li", { className: "synonym-item-row" }, [
          el("span", {}, [el("strong", { text: key }), ` → ${value}`]),
          el("button", {
            className: "delete-syn-btn",
            text: "×",
            attrs: { type: "button", "aria-label": `Delete ${key}` },
            on: { click: () => { synonyms.removePersonal(key); render(); } }
          })
        ])
      );
    }
  }

  byId("personalized-btn")?.addEventListener("click", () => {
    byId("options-modal")?.classList.add("hidden");
    render();
    openModal("synonyms-modal");
  });

  byId("synonyms-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = keyInput.value.trim().toLowerCase();
    const value = valueInput.value.trim().toLowerCase();
    if (!key || !value) {
      error.textContent = "Please fill both fields.";
      return;
    }
    if (!getElements().some((element) => element.nom.toLowerCase() === value)) {
      error.textContent = "Target must be a valid official element.";
      return;
    }
    synonyms.addPersonal(key, value);
    error.textContent = "";
    keyInput.value = "";
    valueInput.value = "";
    render();
  });
}
