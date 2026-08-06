const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const {
  database,
  officialElementsList,
  getSecretOfTheDay,
  normalizeMetaList,
} = require("../utils/helpers");

const STATS_FILE = path.join(__dirname, "../stats.json");

let secretVersion = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Europe/Paris",
});

function loadStatsHistory() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, "utf8"));
    }
  } catch (err) {
    console.error("Error reading stats file:", err);
  }
  return [];
}

function getCurrentWordStats() {
  const currentSecret = getSecretOfTheDay();
  const history = loadStatsHistory();
  const currentEntry = history.find(
    (entry) =>
      entry.word === currentSecret && entry.secretVersion === secretVersion,
  );

  if (currentEntry) {
    return currentEntry.stats;
  }

  return { count: 0, totalTries: 0, totalHints: 0 };
}

function saveCurrentWordStats(stats) {
  const currentSecret = getSecretOfTheDay();
  const today = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });
  const history = loadStatsHistory();

  const avgTries =
    stats.count > 0 ? Number((stats.totalTries / stats.count).toFixed(2)) : 0;

  const existingIndex = history.findIndex(
    (entry) =>
      entry.word === currentSecret && entry.secretVersion === secretVersion,
  );

  const updatedEntry = {
    date: today,
    word: currentSecret,
    secretVersion: secretVersion,
    victories: stats.count,
    avgTries: avgTries,
    stats: stats,
  };

  if (existingIndex !== -1) {
    history[existingIndex] = updatedEntry;
  } else {
    history.push(updatedEntry);
  }

  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    console.error("Error saving stats file:", err);
  }
}

router.get("/daily-stats", (req, res) => {
  const dailyStats = getCurrentWordStats();
  const avgTries =
    dailyStats.count > 0 ? dailyStats.totalTries / dailyStats.count : 0;
  const avgHints =
    dailyStats.count > 0 ? dailyStats.totalHints / dailyStats.count : 0;

  res.json({
    count: dailyStats.count,
    avgTries,
    avgHints,
  });
});

router.post("/getSecretWord", (req, res) => {
  const secretElement = getSecretOfTheDay();

  if (!secretElement || !database[secretElement]) {
    console.error(
      "Erreur: Mot secret introuvable dans la base de données :",
      secretElement,
    );
    return res.status(500).json({
      error: "Secret element not found in database",
      secretElement: secretElement || "Unknown",
    });
  }

  const secretData = database[secretElement];

  res.json({
    success: true,
    secretElement,
    secretAttributes: {
      type: secretData.type || "Unknown",
      lieu: normalizeMetaList(secretData.lieu),
      couleur: normalizeMetaList(secretData.couleur),
      hitbox: secretData.hitbox || "Unknown",
    },
  });
});

router.get("/elements", (req, res) => {
  res.json(officialElementsList);
});

router.get("/secret-version", (req, res) => {
  res.json({ secretVersion });
});

router.post("/validate", (req, res) => {
  const { choix, tryCount, hintUses } = req.body;

  if (!choix || !database[choix]) {
    return res.status(400).json({ error: "Invalid element name" });
  }

  const secretName = getSecretOfTheDay();
  const choiceData = database[choix];
  const secretData = database[secretName];

  const choiceLocations = normalizeMetaList(choiceData.lieu);
  const secretLocations = normalizeMetaList(secretData.lieu);
  const choiceColors = normalizeMetaList(choiceData.couleur);
  const secretColors = normalizeMetaList(secretData.couleur);

  let locationVerdict = "wrong";
  let locationMatches = choiceLocations.filter((loc) =>
    secretLocations.includes(loc),
  );

  if (
    locationMatches.length === secretLocations.length &&
    locationMatches.length === choiceLocations.length
  ) {
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

  if (
    colorMatches.length === secretColors.length &&
    colorMatches.length === choiceColors.length
  ) {
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

  const isCorrect = choix === secretName;
  const dailyStats = getCurrentWordStats();

  if (isCorrect) {
    dailyStats.count += 1;
    if (tryCount) dailyStats.totalTries += Number(tryCount);
    if (hintUses) dailyStats.totalHints += Number(hintUses);
    saveCurrentWordStats(dailyStats);
  }

  const avgTries =
    dailyStats.count > 0 ? dailyStats.totalTries / dailyStats.count : 0;
  const avgHints =
    dailyStats.count > 0 ? dailyStats.totalHints / dailyStats.count : 0;

  res.json({
    nom: choix,
    secretVersion,
    verdict: {
      isCorrect,
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
    count: dailyStats.count,
    avgTries,
    avgHints,
  });
});

router.get("/version", (req, res) => {
  res.json({
    status: "online",
    environment: process.env.API_URL?.includes("mizkyosia")
      ? "Production (VPS)"
      : "Beta-test (Render)",
  });
});

router.post("/hint", (req, res) => {
  const { type } = req.body;
  const secretName = getSecretOfTheDay();
  const secretData = database[secretName];

  if (!secretData) {
    return res.status(500).json({ error: "Secret element not found" });
  }

  const secretLocations = normalizeMetaList(secretData.lieu);
  const secretColors = normalizeMetaList(secretData.couleur);

  if (type === "list_attr") {
    const attributes = ["type", "lieu", "couleur", "hitbox"];
    const chosenAttr =
      attributes[Math.floor(Math.random() * attributes.length)];
    const items = officialElementsList.map((name) => {
      const el = database[name];
      let val = el[chosenAttr];
      if (Array.isArray(val)) val = val.join(", ");
      return { name, value: val };
    });
    return res.json({
      hintType: "list_attr",
      attributeName: chosenAttr,
      items,
    });
  }

  if (type === "secret_info") {
    const options = [
      { label: "Type", value: secretData.type },
      { label: "Location", value: secretLocations.join(", ") },
      { label: "Colour", value: secretColors.join(", ") },
      { label: "Hitbox", value: secretData.hitbox },
    ];
    const chosen = options[Math.floor(Math.random() * options.length)];
    return res.json({
      hintType: "secret_info",
      label: chosen.label,
      value: chosen.value,
    });
  }

  if (type === "wrong_info") {
    const allTypes = [
      ...new Set(officialElementsList.map((n) => database[n].type)),
    ];
    const allLocations = [
      ...new Set(
        officialElementsList.flatMap((n) =>
          normalizeMetaList(database[n].lieu),
        ),
      ),
    ];
    const allColors = [
      ...new Set(
        officialElementsList.flatMap((n) =>
          normalizeMetaList(database[n].couleur),
        ),
      ),
    ];
    const allHitboxes = [
      ...new Set(officialElementsList.map((n) => database[n].hitbox)),
    ];

    const wrongTypes = allTypes.filter((t) => t !== secretData.type);
    const wrongLocs = allLocations.filter((l) => !secretLocations.includes(l));
    const wrongColors = allColors.filter((c) => !secretColors.includes(c));
    const wrongHitboxes = allHitboxes.filter((h) => h !== secretData.hitbox);

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    return res.json({
      hintType: "wrong_info",
      wrongType: pick(wrongTypes) || "N/A",
      wrongLocation: pick(wrongLocs) || "N/A",
      wrongColor: pick(wrongColors) || "N/A",
      wrongHitbox: pick(wrongHitboxes) || "N/A",
    });
  }

  return res.status(400).json({ error: "Invalid hint type" });
});

module.exports = router;
