const express = require("express");
const router = express.Router();
const {
  getSecretElement,
  getElementsList,
  getDailyStats,
  recordDailySuccess,
  getSecretVersion,
} = require("../utils/helpers");

const ALL_TYPES = ["Entity", "Trigger", "Environment", "Mechanic"];
const ALL_HITBOXES = ["Small", "Medium", "Large", "Full Tile", "None"];
const ALL_LOCATIONS = [
  "Forsaken City",
  "Old Site",
  "Celestial Resort",
  "Golden Ridge",
  "Mirror Temple",
  "Reflection",
  "The Summit",
  "Core",
  "Farewell",
];
const ALL_COLORS = [
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Purple",
  "Pink",
  "White",
  "Black",
  "Orange",
  "Brown",
];

function getRandomWrongValue(correctValue, allPossibleValues) {
  if (!correctValue) return allPossibleValues[0] || "Unknown";
  const current = Array.isArray(correctValue) ? correctValue : [correctValue];
  const wrongs = allPossibleValues.filter((v) => !current.includes(v));
  if (wrongs.length === 0) return "Unknown";
  return wrongs[Math.floor(Math.random() * wrongs.length)];
}

router.get("/secret-version", (req, res) => {
  try {
    const version = getSecretVersion ? getSecretVersion() : "1.0.0";
    res.json({ secretVersion: version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/elements", (req, res) => {
  try {
    const elements = getElementsList() || [];
    res.json(elements.map((el) => el.nom));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/daily-stats", (req, res) => {
  try {
    const stats = getDailyStats() || { count: 0, avgTries: 0, avgHints: 0 };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/validate", (req, res) => {
  try {
    const { choix, tryCount, hintUses } = req.body || {};
    if (!choix) return res.status(400).json({ error: "Missing guess choice" });

    const elements = getElementsList() || [];
    const secret = getSecretElement();

    const userGuess = elements.find(
      (el) => el.nom && el.nom.toLowerCase() === choix.toLowerCase(),
    );

    if (!userGuess) {
      return res.status(400).json({ error: "Invalid element" });
    }

    const isCorrect = userGuess.nom.toLowerCase() === secret.nom.toLowerCase();

    const checkMatch = (attrGuess, attrSecret) => {
      const arrG = Array.isArray(attrGuess) ? attrGuess : [attrGuess];
      const arrS = Array.isArray(attrSecret) ? attrSecret : [attrSecret];

      const exact =
        arrG.length === arrS.length && arrG.every((v) => arrS.includes(v));
      if (exact) return "correct";

      const partial = arrG.some((v) => arrS.includes(v));
      if (partial) return "partial";

      return "wrong";
    };

    const verdict = {
      isCorrect,
      type: checkMatch(userGuess.type, secret.type),
      lieu: checkMatch(userGuess.lieu, secret.lieu),
      couleur: checkMatch(userGuess.couleur, secret.couleur),
      hitbox: checkMatch(userGuess.hitbox, secret.hitbox),
    };

    if (isCorrect && recordDailySuccess) {
      recordDailySuccess(tryCount, hintUses);
    }

    const stats = getDailyStats() || {};

    res.json({
      nom: userGuess.nom,
      valeurs: {
        type: Array.isArray(userGuess.type)
          ? userGuess.type.join(", ")
          : userGuess.type,
        lieu: Array.isArray(userGuess.lieu)
          ? userGuess.lieu.join(", ")
          : userGuess.lieu,
        couleur: Array.isArray(userGuess.couleur)
          ? userGuess.couleur.join(", ")
          : userGuess.couleur,
        hitbox: Array.isArray(userGuess.hitbox)
          ? userGuess.hitbox.join(", ")
          : userGuess.hitbox,
      },
      verdict,
      secretVersion: getSecretVersion ? getSecretVersion() : "1.0.0",
      dailySuccessCount: stats.count || 0,
      avgTries: stats.avgTries || 0,
      avgHints: stats.avgHints || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/getSecretWord", (req, res) => {
  try {
    const secret = getSecretElement();
    res.json({
      secretElement: secret.nom,
      secretAttributes: {
        type: Array.isArray(secret.type) ? secret.type.join(", ") : secret.type,
        lieu: Array.isArray(secret.lieu) ? secret.lieu.join(", ") : secret.lieu,
        couleur: Array.isArray(secret.couleur)
          ? secret.couleur.join(", ")
          : secret.couleur,
        hitbox: Array.isArray(secret.hitbox)
          ? secret.hitbox.join(", ")
          : secret.hitbox,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/hint", (req, res) => {
  try {
    const { type } = req.body || {};
    const secret = getSecretElement();
    const elements = getElementsList() || [];

    if (type === "false_friend") {
      const wrongElements = elements.filter(
        (el) => el.nom && el.nom.toLowerCase() !== secret.nom.toLowerCase(),
      );
      // Sélection déterministe via la seed
      const index = getSeededRandom(1) % wrongElements.length;
      const randomWrong = wrongElements[index];
      return res.json({
        text: `<strong>False Friend:</strong> The secret element is NOT <em>${randomWrong ? randomWrong.nom : "Unknown"}</em>.`,
      });
    }

    if (type === "secret_info") {
      const infos = [
        `Its type includes: <strong>${Array.isArray(secret.type) ? secret.type[0] : secret.type}</strong>`,
        `Its hitbox is: <strong>${Array.isArray(secret.hitbox) ? secret.hitbox[0] : secret.hitbox}</strong>`,
        `It can be found in: <strong>${Array.isArray(secret.lieu) ? secret.lieu[0] : secret.lieu}</strong>`,
      ];
      // Choix déterministe de l'info
      const index = getSeededRandom(2) % infos.length;
      return res.json({
        text: `<strong>Secret Info:</strong> ${infos[index]}`,
      });
    }

    if (type === "truth_and_lies") {
      const secretColor = Array.isArray(secret.couleur)
        ? secret.couleur[0]
        : secret.couleur;
      const secretLocation = Array.isArray(secret.lieu)
        ? secret.lieu[0]
        : secret.lieu;
      const secretType = Array.isArray(secret.type)
        ? secret.type[0]
        : secret.type;
      const secretHitbox = Array.isArray(secret.hitbox)
        ? secret.hitbox[0]
        : secret.hitbox;

      const truthPool = [
        `Type is "${secretType}"`,
        `Hitbox is "${secretHitbox}"`,
        `Color includes "${secretColor}"`,
        `Location includes "${secretLocation}"`,
      ];
      // 1. Choix fixe de la vérité
      const trueIndex = getSeededRandom(3) % truthPool.length;
      const trueStatement = truthPool[trueIndex];

      // 2. Choix fixe des mensonges
      const fakeType = getRandomWrongValue(secret.type, ALL_TYPES);
      const fakeHitbox = getRandomWrongValue(secret.hitbox, ALL_HITBOXES);
      const fakeLocation = getRandomWrongValue(secret.lieu, ALL_LOCATIONS);
      const fakeColor = getRandomWrongValue(secret.couleur, ALL_COLORS);

      const liesPool = [
        `Type is "${fakeType}"`,
        `Hitbox is "${fakeHitbox}"`,
        `Location includes "${fakeLocation}"`,
        `Color includes "${fakeColor}"`,
      ];

      // Sélection fixe de 2 mensonges sans Math.random()
      const lie1Index = getSeededRandom(4) % liesPool.length;
      let lie2Index = getSeededRandom(5) % liesPool.length;
      if (lie2Index === lie1Index)
        lie2Index = (lie1Index + 1) % liesPool.length;

      const lie1 = liesPool[lie1Index];
      const lie2 = liesPool[lie2Index];

      // 3. Mélange fixe des 3 propositions
      const statements = [trueStatement, lie1, lie2];
      const randOrder = getSeededRandom(6) % 3;
      if (randOrder === 1) statements.push(statements.shift());
      if (randOrder === 2) statements.unshift(statements.pop());

      const hintText = `<strong>1 Truth & 2 Lies:</strong><br>• ${statements.join("<br>• ")}`;

      return res.json({ text: hintText });
    }

    return res.status(400).json({ error: "Invalid hint type" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
