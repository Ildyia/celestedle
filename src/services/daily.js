const elementsRepo = require("../repositories/elements");
const secretsRepo = require("../repositories/secrets");

// Un même mot ne revient pas avant ce nombre de jours (tant qu'il reste assez
// d'éléments jouables)
const NO_REPEAT_DAYS = 30;

// Valeur de secretVersion avant la base de données. On la garde pour la
// version 1 d'un jour afin que la mise à jour ne réinitialise pas les parties
// en cours (le client compare cette valeur à celle qu'il a stockée).
const LEGACY_SECRET_VERSION = "1.2.2";

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

const seedHash = parseSeed(process.env.RANDOM_SEED);

function todayParis() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

// Index de l'ancien tirage (hash de la date XOR seed) : le premier jour avec
// la base donne donc le même mot que l'ancien code.
function legacyIndex(date, count) {
  let dateHash = 0;
  for (let i = 0; i < date.length; i++) {
    dateHash = (dateHash * 33 + date.charCodeAt(i)) | 0;
  }
  return ((dateHash ^ seedHash) >>> 0) % count;
}

function pickAuto(date) {
  const elements = elementsRepo.listActive();
  if (elements.length === 0) throw new Error("Aucun élément actif en base");

  const recent = secretsRepo.recentElementIds(date, NO_REPEAT_DAYS);
  const start = legacyIndex(date, elements.length);
  for (let i = 0; i < elements.length; i++) {
    const candidate = elements[(start + i) % elements.length];
    if (!recent.has(candidate.id)) return candidate;
  }
  return elements[start];
}

function getTodayRow() {
  const date = todayParis();
  return secretsRepo.get(date) ?? secretsRepo.createIfMissing(date, pickAuto(date).id);
}

function getSecretElement() {
  return elementsRepo.findById(getTodayRow().element_id);
}

function getSecretVersion() {
  const row = getTodayRow();
  return row.version === 1 ? LEGACY_SECRET_VERSION : `${row.date}.${row.version}`;
}

// Choix de l'admin : remplace le mot du jour et incrémente sa version, ce qui
// réinitialise les parties en cours côté client.
function setSecret(element) {
  secretsRepo.replace(todayParis(), element.id, "admin");
  return getSecretElement();
}

function drawRandomSecret() {
  const current = getTodayRow().element_id;
  const candidates = elementsRepo.listActive().filter((e) => e.id !== current);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return setSecret(pick);
}

// Nombre pseudo-aléatoire stable pour la journée (indices)
function getSeededRandom(offset = 0) {
  const secretName = getSecretElement().nom;
  let hash = seedHash;
  const str = secretName + offset;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) | 0;
    hash = (Math.sin(hash) * 10000) | 0;
  }
  return Math.abs(hash);
}

module.exports = {
  todayParis,
  getSecretElement,
  getSecretVersion,
  setSecret,
  drawRandomSecret,
  getSeededRandom
};
