const fs = require("fs");
const path = require("path");
const { createDailyStatsStore } = require("./stats-store");

const database = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../db.json"), "utf8")
);
const officialElementsList = Object.keys(database).sort();
const spritesMapping = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/assets/entities/mapping.json")));

let secretForce = null;
let secretVersion = "1.2.2";
const dailyStatsStore = createDailyStatsStore();

let globalSeedHash = 0;
if (process.env.RANDOM_SEED) {
  const parsed = parseInt(process.env.RANDOM_SEED, 10);
  if (isNaN(parsed)) {
    for (let i = 0; i < process.env.RANDOM_SEED.length; i++) {
      globalSeedHash =
        (globalSeedHash * 31 + process.env.RANDOM_SEED.charCodeAt(i)) | 0;
    }
  } else {
    globalSeedHash = parsed;
  }
}

function getSecretOfTheDay() {
  const dateString = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris"
  });

  let dateHash = 0;
  for (let i = 0; i < dateString.length; i++) {
    dateHash = (dateHash * 33 + dateString.charCodeAt(i)) | 0;
  }

  const combined = (dateHash ^ globalSeedHash) >>> 0;
  const targetedIndex = combined % officialElementsList.length;

  return officialElementsList[targetedIndex];
}

// Log placé APRÈS l'initialisation de globalSeedHash
console.log(
  `[INIT] SEED: ${process.env.RANDOM_SEED} | HASH: ${globalSeedHash} | MOT DU JOUR: ${getSecretOfTheDay()}`
);

// Alias pour compatibilité avec routes/game.js
function getSecretElement() {
  const secretName = getSecretOfTheDay();
  return {
    nom: secretName,
    ...database[secretName]
  };
}

// Alias pour compatibilité avec routes/game.js
function getElementsList() {
  return officialElementsList.map((nom) => ({
    nom,
    ...database[nom]
  }));
}

function normalizeMetaList(data) {
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0].includes(",")) {
      return data[0].split(",").map((item) => item.trim());
    }
    return data.map((item) => item.trim());
  }
  if (typeof data === "string") {
    return data.split(",").map((item) => item.trim());
  }
  return [];
}

function updateSeedHash(newHash) {
  globalSeedHash = newHash;
  secretVersion = Date.now().toString();
}

function getSecretVersion() {
  return secretVersion;
}

function registerDailySuccess(secretName, tryCount, hintUses, timeInSeconds) {
  return dailyStatsStore.registerSuccess(
    secretName,
    tryCount,
    hintUses,
    timeInSeconds
  );
}

function getDailyStats() {
  const secretName = getSecretOfTheDay();
  return dailyStatsStore.getStats(secretName);
}

function recordDailySuccess(tryCount, hintUses, timeInSeconds) {
  const secretName = getSecretOfTheDay();
  return dailyStatsStore.registerSuccess(
    secretName,
    tryCount,
    hintUses,
    timeInSeconds
  );
}

function getSeededRandom(offset = 0) {
  const secretName = getSecretOfTheDay();
  let hash = globalSeedHash;
  const str = secretName + offset;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) | 0;
    hash = (Math.sin(hash) * 10000) | 0;
  }
  return Math.abs(hash);
}

function getEntitySprite(name) {
  return spritesMapping[name?.trim?.().replaceAll("%20", " ").toLowerCase()];
}

module.exports = {
  database,
  officialElementsList,
  getSecretOfTheDay,
  getSecretElement,
  getElementsList,
  normalizeMetaList,
  updateSeedHash,
  getSecretVersion,
  registerDailySuccess,
  getDailyStats,
  recordDailySuccess,
  getSeededRandom,
  getEntitySprite
};
