const express = require("express");
const router = express.Router();
const { getDB } = require("../utils/db");
const { database, officialElementsList, normalizeMetaList } = require("../utils/helpers");

// Fonction utilitaire pour récupérer la date au format Paris (sv-SE: YYYY-MM-DD)
function getParisDateString() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });
}

// Fonction pour chercher le mot du jour en DB
const crypto = require("crypto");

function getParisDateString() {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });
}

async function fetchSecretOfTheDay(db) {
  const wordDocs = await db.collection("words").find({}).sort({ name: 1 }).toArray();
  const allWords = wordDocs.map((doc) => doc.name);

  if (allWords.length === 0) return null;

  const todayStr = getParisDateString();

  const hash = crypto.createHash("sha256").update(todayStr).digest("hex");

  // On prend les 8 premiers caractères du hash hexadécimal et on les convertit en entier (base 16)
  const hashInteger = parseInt(hash.substring(0, 8), 16);
  const selectedIndex = hashInteger % allWords.length;
  const selectedWord = allWords[selectedIndex];

  return selectedWord.toLowerCase();
}

router.post("/getSecretWord", async (req, res) => {
  try {
    const db = getDB();
    const secretElement = await fetchSecretOfTheDay(db);
    res.json({ success: true, secretElement });
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/elements", (req, res) => {
  res.json(officialElementsList);
});

router.get("/secret-version", (req, res) => {
  const secretVersion = getParisDateString();
  res.json({ secretVersion });
});

router.post("/validate", async (req, res) => {
  const { choix } = req.body;

  if (!choix || !database[choix]) {
    return res.status(400).json({ error: "Invalid element name" });
  }

  try {
    const db = getDB();
    const secretName = await fetchSecretOfTheDay(db);

    const choiceData = database[choix];
    const secretData = database[secretName];

    const choiceLocations = normalizeMetaList(choiceData.lieu);
    const secretLocations = normalizeMetaList(secretData.lieu);
    const choiceColors = normalizeMetaList(choiceData.couleur);
    const secretColors = normalizeMetaList(secretData.couleur);

    let locationVerdict = "wrong";
    let locationMatches = choiceLocations.filter((loc) => secretLocations.includes(loc));

    if (locationMatches.length === secretLocations.length && locationMatches.length === choiceLocations.length) {
      locationVerdict = "correct";
    } else if (locationMatches.length > 0) {
      if (locationMatches.length === choiceLocations.length) {
        locationVerdict = "partial";
      } else {
        locationVerdict = "notTotallyWrong";
      }
    }

    let colorVerdict = "wrong";
    let colorMatches = choiceColors.filter((col) => secretColors.includes(col));

    if (colorMatches.length === secretColors.length && colorMatches.length === choiceColors.length) {
      colorVerdict = "correct";
    } else if (colorMatches.length > 0 || secretColors.includes("always")) {
      if (choiceColors.every((val, idx) => val === colorMatches[idx])) {
        colorVerdict = "partial";
      } else {
        colorVerdict = "notTotallyWrong";
      }
    }

    let hitboxVerdict = "wrong";
    if (choiceData.hitbox === secretData.hitbox) {
      hitboxVerdict = "correct";
    }

    res.json({
      nom: choix,
      secretVersion: getParisDateString(),
      verdict: {
        isCorrect: choix === secretName,
        type: choiceData.type === secretData.type ? "correct" : "wrong",
        lieu: locationVerdict,
        couleur: colorVerdict,
        hitbox: hitboxVerdict,
      },
      valeurs: {
        type: choiceData.type,
        lieu: choiceLocations.join(", "),
        couleur: choiceColors.join(", "),
        hitbox: choiceData.hitbox,
      },
    });
  } catch (error) {
    console.error("Erreur validation :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/version", (req, res) => {
  res.json({
    status: "online",
    environment: process.env.API_URL?.includes("mizkyosia") ? "Production (VPS)" : "Beta-test (Render)",
  });
});

module.exports = router;
