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

function fillSeasons(seasons) {
  const [current, ...past] = seasons;
  byId("season-current").textContent = `En cours : ${current.name}, depuis le ${current.from}.`;
  byId("season-rename-input").value = current.name;
  byId("season-rename-form").dataset.seasonId = current.id;
  byId("season-past").textContent = past.length
    ? `Saisons passées : ${past.map((s) => `${s.name} (${s.from} → ${s.to})`).join(", ")}.`
    : "";
}

// Onglet Réglages : renvoie la fonction qui recharge les valeurs actuelles
export function bindSettings({ notify }) {
  byId("season-rename-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = Number(e.target.dataset.seasonId);
      const season = await admin.renameSeason(id, byId("season-rename-input").value.trim());
      fillSeasons(await admin.seasons());
      notify(`Saison renommée : ${season.name}.`);
    } catch (err) {
      notify(err.message, true);
    }
  });

  byId("season-start-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = byId("season-start-input").value.trim();
    if (!window.confirm(`Lancer « ${name} » aujourd'hui ? Le classement de la saison repart de zéro.`)) return;
    try {
      const season = await admin.startSeason(name);
      byId("season-start-input").value = "";
      fillSeasons(await admin.seasons());
      notify(`${season.name} a commencé.`);
    } catch (err) {
      notify(err.message, true);
    }
  });

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

  return async () => {
    const [settings, seasons] = await Promise.all([admin.settings(), admin.seasons()]);
    fill(settings);
    fillSeasons(seasons);
  };
}
