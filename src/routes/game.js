const express = require("express");
const router = express.Router();
const {
  database,
  officialElementsList,
  getSecretOfTheDay,
  normalizeMetaList,
} = require("../utils/helpers");

let secretVersion = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Europe/Paris",
});

router.post("/getSecretWord", (req, res) => {
  const secretElement = getSecretOfTheDay();
  res.json({ success: true, secretElement });
});

router.get("/elements", (req, res) => {
  res.json(officialElementsList);
});

router.get("/secret-version", (req, res) => {
  res.json({ secretVersion });
});

router.post("/validate", (req, res) => {
  const { choix } = req.body;

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
  let locationMatches = choiceLocations.filter((loc) => secretLocations.includes(loc));

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
    secretVersion,
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
});

router.get("/version", (req, res) => {
  res.json({
    status: "online",
    environment: process.env.API_URL?.includes("mizkyosia")
      ? "Production (VPS)"
      : "Beta-test (Render)",
  });
});

module.exports = router;