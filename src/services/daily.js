const config = require("../config");
const elementsRepo = require("../repositories/elements");
const secretsRepo = require("../repositories/secrets");
const settingsRepo = require("../repositories/settings");
const { todayParis } = require("../utils/dates");
const { getMode } = require("./modes");

// Un mot ne revient pas avant ce délai (jours). Réglable dans l'admin.
const REPEAT_DELAY_KEY = "repeat_delay_days";
const DEFAULT_REPEAT_DELAY = 2;

function parseSeed(raw) {
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  if (!isNaN(parsed)) return parsed;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return hash;
}

const seedHash = parseSeed(config.randomSeed);

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// Mode normal : même index que le tirage de la v1 (hash de la date XOR
// seed), donc le jour de la mise à jour garde le mot prévu.
function startIndex(date, mode, count) {
  const key = mode === "normal" ? date : `${date}|${mode}`;
  return ((hashString(key) ^ seedHash) >>> 0) % count;
}

function getRepeatDelay() {
  return settingsRepo.getNumber(REPEAT_DELAY_KEY, DEFAULT_REPEAT_DELAY);
}

function setRepeatDelay(days) {
  settingsRepo.set(REPEAT_DELAY_KEY, days);
}

// Mot du jour d'un catalogue. items : repository des éléments (ou des techs) ;
// secrets : sa table de mots du jour ; primary : le mode « normal » du
// catalogue, dont le mode Hard évite le mot ; checkMode(mode) refuse un mode
// inconnu.
function createDaily({ items, secrets, primary, checkMode }) {
  function pickAuto(date, mode) {
    const elements = items.listActive();
    if (elements.length === 0) throw new Error("Aucun élément actif en base");

    const excluded = secrets.recentElementIds(date, mode, getRepeatDelay());
    // Le mode Hard évite le mot du mode normal du même jour
    if (mode !== primary) excluded.add(getSecretRow(date, primary).element_id);

    const start = startIndex(date, mode, elements.length);
    for (let i = 0; i < elements.length; i++) {
      const candidate = elements[(start + i) % elements.length];
      if (!excluded.has(candidate.id)) return candidate;
    }
    return elements[start];
  }

  function getSecretRow(date, mode) {
    checkMode(mode);
    return secrets.get(date, mode) ?? secrets.createIfMissing(date, mode, pickAuto(date, mode).id);
  }

  function getTodaySecret(mode = primary) {
    const row = getSecretRow(todayParis(), mode);
    return { ...row, element: items.findById(row.element_id) };
  }

  // Choix de l'admin : remplace le mot du jour et incrémente sa version, ce qui
  // fait repartir à zéro les parties en cours de ce mode.
  function setSecret(mode, element) {
    checkMode(mode);
    secrets.replace(todayParis(), mode, element.id, "admin");
    return getTodaySecret(mode);
  }

  function drawRandomSecret(mode) {
    const current = getTodaySecret(mode).element_id;
    const candidates = items.listActive().filter((e) => e.id !== current);
    return setSecret(mode, candidates[Math.floor(Math.random() * candidates.length)]);
  }

  // Nombre pseudo-aléatoire stable pour la journée et le mode (indices)
  function seededRandom(mode, offset = 0) {
    const { element } = getTodaySecret(mode);
    let hash = seedHash;
    const str = `${element.nom}${mode === "normal" ? "" : mode}${offset}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33 + str.charCodeAt(i)) | 0;
      hash = (Math.sin(hash) * 10000) | 0;
    }
    return Math.abs(hash);
  }

  return { getTodaySecret, getSecretRow, setSecret, drawRandomSecret, seededRandom };
}

const elementsDaily = createDaily({
  items: elementsRepo,
  secrets: secretsRepo,
  primary: "normal",
  checkMode: (mode) => getMode(mode)
});

module.exports = {
  DEFAULT_REPEAT_DELAY,
  ...elementsDaily,
  createDaily,
  getRepeatDelay,
  setRepeatDelay
};
