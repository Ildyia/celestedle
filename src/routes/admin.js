const express = require("express");
const router = express.Router();
const { getDB } = require("../utils/db");
const helpers = require("../utils/helpers");
const adminKey = process.env.ADMIN_PASSWORD;
const { getDailyIndex, setAdminSeedModifier } = require("../utils/cronWord");

function getParisDateString() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });
}

router.post("/verify-key", (req, res) => {
  const { key } = req.body;
  if (key !== adminKey) {
    return res.status(403).json({ error: "Incorrect password" });
  }
  res.json({ success: true, message: "Access authorized" });
});

router.post("/random-hash", async (req, res) => {
  const { key, newHash } = req.body;

  if (key !== adminKey) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const db = getDB();
    const todayStr = getParisDateString();

    // 1. Applique le modificateur (null réinitialise la date par défaut)
    setAdminSeedModifier(newHash);

    // 2. Calcule le nouvel index et récupère le mot associé
    const index = getDailyIndex(todayStr);
    const newSecretWord = helpers.officialElementsList[index];

    // 3. Écrase ou insère le mot pour aujourd'hui dans daily_words
    await db.collection("daily_words").updateOne(
      { date: todayStr },
      { 
        $set: { 
          word: newSecretWord 
        },
        $setOnInsert: {
          successCount: 0,
          averageAttempts: 0,
          bestScore: null,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    return res.json({
      message: `Daily puzzle rotated successfully. New word for today is: ${newSecretWord}`,
    });

  } catch (error) {
    console.error("Admin rotation failed:", error);
    return res.status(500).json({ error: "Server error during rotation" });
  }
});

module.exports = router;