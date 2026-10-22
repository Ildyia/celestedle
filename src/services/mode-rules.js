const settingsRepo = require("../repositories/settings");
const { MODE_IDS, ADJUSTABLE, getMode, validateRule } = require("./modes");

// Règles effectives d'un mode : valeurs par défaut de modes.js, remplacées
// par celles réglées dans l'admin. Une limite enregistrée à 0 = illimitée.
const settingKey = (modeId, field) => `mode.${modeId}.${field}`;

function getModeRules(modeId = "normal") {
  const rules = { ...getMode(modeId) };
  for (const field of Object.keys(ADJUSTABLE[modeId] ?? {})) {
    const stored = settingsRepo.get(settingKey(modeId, field));
    if (stored === null) continue;
    const value = Number(stored);
    rules[field] = value === 0 && ADJUSTABLE[modeId][field].unlimited ? null : value;
  }
  return rules;
}

function allModeRules() {
  return Object.fromEntries(MODE_IDS.map((id) => [id, getModeRules(id)]));
}

// Valide tout avant d'enregistrer quoi que ce soit
function updateModeRules(modeId, changes) {
  getMode(modeId);
  const validated = Object.entries(changes).map(([field, value]) => [
    field,
    validateRule(modeId, field, value)
  ]);
  for (const [field, value] of validated) {
    settingsRepo.set(settingKey(modeId, field), value ?? 0);
  }
  return getModeRules(modeId);
}

module.exports = { getModeRules, allModeRules, updateModeRules };
