const crypto = require("crypto");
const cron = require("node-cron");
const { getDB } = require("./db");
const helpers = require("./helpers"); // <-- Import complet ici

let adminSeedModifier = null;

function getDailyIndex(dateStr) {
  // Accès via le getter dynamique de l'objet helpers
  if (!helpers.officialElementsList || helpers.officialElementsList.length === 0) {
    throw new Error("officialElementsList is empty");
  }

  const stringToHash = adminSeedModifier ? `${dateStr}-${adminSeedModifier}` : dateStr;
  const hash = crypto.createHash("sha256").update(stringToHash).digest("hex");
  const hashInteger = parseInt(hash.substring(0, 8), 16);

  return hashInteger % helpers.officialElementsList.length;
}

function setAdminSeedModifier(newSeed) {
  adminSeedModifier = newSeed;
}

function initDailyCron() {
  cron.schedule("0 0 * * *", async () => {
    try {
      const db = getDB();
      const todayStr = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Paris",
      });

      const index = getDailyIndex(todayStr);
      const secretWord = helpers.officialElementsList[index];

      await db.collection("daily_words").updateOne(
        { date: todayStr },
        {
          $setOnInsert: {
            word: secretWord,
            successCount: 0, 
            averageAttempts: 0, 
            bestScore: null, 
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      console.log(`[CRON] Daily word generated for ${todayStr} : ${secretWord}`);
    } catch (error) {
      console.error("[CRON] Error on creation of daily word :", error);
    }
  });
}

module.exports = {
  initDailyCron,
  getDailyIndex,
  setAdminSeedModifier
};