const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../daily-stats-db.json");

function loadStats() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Error loading daily stats DB:", err);
  }
  return {};
}

function saveStats(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving daily stats DB:", err);
  }
}

function createDailyStatsStore() {
  const statsData = loadStats();

  return {
    registerSuccess(secretName, tryCount = 1, hintUses = 0) {
      const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Paris",
      });
      const key = `${today}_${secretName}`;

      if (!statsData[key]) {
        statsData[key] = {
          count: 0,
          totalTries: 0,
          totalHints: 0,
        };
      }

      statsData[key].count += 1;
      statsData[key].totalTries += Number(tryCount) || 1;
      statsData[key].totalHints += Number(hintUses) || 0;

      saveStats(statsData);
      return statsData[key];
    },

    getStats(secretName) {
      const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Paris",
      });
      const key = `${today}_${secretName}`;
      const entry = statsData[key];

      if (!entry || entry.count === 0) {
        return { count: 0, avgTries: 0, avgHints: 0 };
      }

      return {
        count: entry.count,
        avgTries: (entry.totalTries / entry.count).toFixed(1),
        avgHints: (entry.totalHints / entry.count).toFixed(1),
      };
    },
  };
}

module.exports = { createDailyStatsStore };
