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

function pickAuto(date, mode) {
  const elements = elementsRepo.listActive();
  if (elements.length === 0) throw new Error("Aucun élément actif en base");

  const excluded = secretsRepo.recentElementIds(date, mode, getRepeatDelay());
  // Le mode Hard évite le mot du mode normal du même jour
  if (mode !== "normal") excluded.add(getSecretRow(date, "normal").element_id);

  const start = startIndex(date, mode, elements.length);
  for (let i = 0; i < elements.length; i++) {
    const candidate = elements[(start + i) % elements.length];
    if (!excluded.has(candidate.id)) return candidate;
  }
  return elements[start];
}

function getSecretRow(date, mode) {
  getMode(mode);
  return (
    secretsRepo.get(date, mode) ??
    secretsRepo.createIfMissing(date, mode, pickAuto(date, mode).id)
  );
}

function getTodaySecret(mode = "normal") {
  const row = getSecretRow(todayParis(), mode);
  return { ...row, element: elementsRepo.findById(row.element_id) };
}

// Choix de l'admin : remplace le mot du jour et incrémente sa version, ce qui
// fait repartir à zéro les parties en cours de ce mode.
function setSecret(mode, element) {
  getMode(mode);
  secretsRepo.replace(todayParis(), mode, element.id, "admin");
  return getTodaySecret(mode);
}

function drawRandomSecret(mode) {
  const current = getTodaySecret(mode).element_id;
  const candidates = elementsRepo.listActive().filter((e) => e.id !== current);
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

module.exports = {
  DEFAULT_REPEAT_DELAY,
  getTodaySecret,
  getSecretRow,
  setSecret,
  drawRandomSecret,
  getRepeatDelay,
  setRepeatDelay,
  seededRandom
};
