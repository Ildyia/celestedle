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
  const current = Array.isArray(correctValue) ? correctValue : [correctValue];
  const wrongs = allPossibleValues.filter((v) => !current.includes(v));
  if (wrongs.length === 0) return "Unknown";
  return wrongs[Math.floor(Math.random() * wrongs.length)];
}

router.get("/secret-version", (req, res) => {
  res.json({ secretVersion: getSecretVersion() });
});

router.get("/elements", (req, res) => {
  const elements = getElementsList();
  res.json(elements.map((el) => el.nom));
});

router.get("/daily-stats", (req, res) => {
  const stats = getDailyStats();
  res.json(stats);
});

router.post("/validate", (req, res) => {
  const { choix, tryCount, hintUses } = req.body;
  const elements = getElementsList();
  const secret = getSecretElement();

  const userGuess = elements.find(
    (el) => el.nom.toLowerCase() === choix.toLowerCase(),
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

  if (isCorrect) {
    recordDailySuccess(tryCount, hintUses);
  }

  const stats = getDailyStats();

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
    secretVersion: getSecretVersion(),
    dailySuccessCount: stats.count,
    avgTries: stats.avgTries,
    avgHints: stats.avgHints,
  });
});

router.post("/getSecretWord", (req, res) => {
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
});

router.post("/hint", (req, res) => {
  const { type } = req.body;
  const secret = getSecretElement();
  const elements = getElementsList();

  if (type === "false_friend") {
    const wrongElements = elements.filter(
      (el) => el.nom.toLowerCase() !== secret.nom.toLowerCase(),
    );
    const randomWrong =
      wrongElements[Math.floor(Math.random() * wrongElements.length)];
    return res.json({
      text: `<strong>False Friend:</strong> The secret element is NOT <em>${randomWrong.nom}</em>.`,
    });
  }

  if (type === "secret_info") {
    const infos = [
      `Its type includes: <strong>${Array.isArray(secret.type) ? secret.type[0] : secret.type}</strong>`,
      `Its hitbox is: <strong>${Array.isArray(secret.hitbox) ? secret.hitbox[0] : secret.hitbox}</strong>`,
      `It can be found in: <strong>${Array.isArray(secret.lieu) ? secret.lieu[0] : secret.lieu}</strong>`,
    ];
    const randomInfo = infos[Math.floor(Math.random() * infos.length)];
    return res.json({ text: `<strong>Secret Info:</strong> ${randomInfo}` });
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
    const trueStatement =
      truthPool[Math.floor(Math.random() * truthPool.length)];

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

    const shuffledLies = liesPool.sort(() => 0.5 - Math.random());
    const lie1 = shuffledLies[0];
    const lie2 = shuffledLies[1];

    const statements = [trueStatement, lie1, lie2].sort(
      () => 0.5 - Math.random(),
    );

    const hintText = `<strong>1 Truth & 2 Lies:</strong><br>• ${statements.join("<br>• ")}`;

    return res.json({ text: hintText });
  }

  return res.status(400).json({ error: "Invalid hint type" });
});

module.exports = router;
