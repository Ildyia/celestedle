const fs = require("fs");
const path = require("path");
const { createDailyStatsStore } = require("./daily-stats");

const database = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../db.json"), "utf8")
);
const officialElementsList = Object.keys(database).sort();

let secretForce = null;
let secretVersion = "1.0.2";
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

  let localizedHash = globalSeedHash;

  for (let i = 0; i < dateString.length; i++) {
    localizedHash = (localizedHash * 33 + dateString.charCodeAt(i)) | 0;
    localizedHash = (Math.sin(localizedHash) * 10000) | 0;
  }

  const targetedIndex = Math.abs(localizedHash) % officialElementsList.length;
  return officialElementsList[targetedIndex];
}

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
  secretVersion = Date.now().toString(); // Met à jour la version pour forcer le reset client
}

function getSecretVersion() {
  return secretVersion;
}

function registerDailySuccess(secretName, playerId) {
  return dailyStatsStore.registerSuccess(secretName, playerId);
}

function getDailyStats() {
  const secretName = getSecretOfTheDay();
  return dailyStatsStore.getStats(secretName);
}

function recordDailySuccess(tryCount, hintUses) {
  const secretName = getSecretOfTheDay();
  return dailyStatsStore.registerSuccess(secretName, tryCount, hintUses);
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
  getSeededRandom
};
