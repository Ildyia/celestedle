import { byId, openModal } from "./dom.js";
import { storage, KEYS } from "./storage.js";

// Préférences d'affichage, gardées dans ce navigateur
const OPTIONS = [
  {
    checkbox: "toggle-theme-checkbox",
    key: KEYS.celesteTheme,
    fallback: true,
    apply: (on) => document.body.classList.toggle("theme-celeste", on)
  },
  {
    checkbox: "toggle-timer-checkbox",
    key: KEYS.showTimer,
    fallback: true,
    apply: (on) => byId("game-timer-badge")?.toggleAttribute("hidden", !on)
  },
  {
    checkbox: "toggle-cursor-checkbox",
    key: KEYS.customCursor,
    fallback: true,
    apply: (on) => {
      document.body.classList.toggle("no-custom-cursor", !on);
      const cursor = byId("custom-cursor");
      if (cursor) cursor.style.display = on ? "block" : "none";
    }
  },
  {
    checkbox: "toggle-colorblind-checkbox",
    key: KEYS.colorblind,
    fallback: false,
    apply: (on) => document.body.classList.toggle("colorblind", on)
  }
];

export function initOptions() {
  for (const option of OPTIONS) {
    const checkbox = byId(option.checkbox);
    const enabled = storage.getBool(option.key, option.fallback);
    option.apply(enabled);
    if (checkbox) {
      checkbox.checked = enabled;
      checkbox.addEventListener("change", () => {
        storage.set(option.key, checkbox.checked);
        option.apply(checkbox.checked);
      });
    }
  }
  byId("options-btn")?.addEventListener("click", () => openModal("options-modal"));
}
