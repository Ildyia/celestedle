import { byId } from "../dom.js";
import { admin } from "./client.js";

// Champs du formulaire ↔ réglages du mode Hard. Le temps est saisi en
// minutes et enregistré en secondes.
const HARD_FIELDS = [
  { input: "hard-max-hints", field: "maxHints" },
  { input: "hard-max-tries", field: "maxTries", unlimited: true },
  { input: "hard-time-limit", field: "timeLimitSeconds", unlimited: true, minutes: true },
  { input: "hard-suggestion-chars", field: "suggestionMinChars" }
];

function fill({ repeatDelayDays, modes }) {
  byId("repeat-delay-input").value = repeatDelayDays;
  for (const { input, field, minutes } of HARD_FIELDS) {
    const value = modes.hard[field];
    byId(input).value = value === null ? 0 : minutes ? value / 60 : value;
  }
}

function readHardRules() {
  return Object.fromEntries(
    HARD_FIELDS.map(({ input, field, minutes }) => {
      const value = Number(byId(input).value);
      return [field, minutes ? Math.round(value * 60) : value];
    })
  );
}

// Onglet Réglages : renvoie la fonction qui recharge les valeurs actuelles
export function bindSettings({ notify }) {
  byId("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const saved = await admin.saveSettings({
        repeatDelayDays: Number(byId("repeat-delay-input").value),
        modes: { hard: readHardRules() }
      });
      fill(saved);
      notify("Réglages enregistrés.");
    } catch (err) {
      notify(err.message, true);
    }
  });

  return async () => fill(await admin.settings());
}
