const express = require("express");
const router = express.Router();
const {
  getSecretElement,
  getElementsList,
  getSecretVersion,
  getSeededRandom
} = require("../utils/helpers");

const { createDailyStatsStore } = require("../utils/stats-store");
const statsStore = createDailyStatsStore();

const ALL_TYPES = [
  "mechanics",
  "movement and propulsion",
  "environment",
  "hazards",
  "characters",
  "collectibles"
];
const ALL_HITBOXES = [
  "no hitbox interaction",
  "circular",
  "square",
  "rectangular",
  "other shape"
];
const ALL_LOCATIONS = [
  "prologue",
  "city",
  "site",
  "resort",
  "ridge",
  "temple",
  "summit",
  "core",
  "farewell"
];
const ALL_COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "pink",
  "white",
  "black",
  "orange",
  "brown",
  "grey"
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
    const secret = getSecretElement();
    const stats = statsStore.getStats(secret ? secret.nom : "");
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/validate", (req, res) => {
  try {
    const { choix, tryCount, hintUses, timeInSeconds } = req.body || {};
    if (!choix) return res.status(400).json({ error: "Missing guess choice" });

    const elements = getElementsList() || [];
    const secret = getSecretElement();

    const userGuess = elements.find(
      (el) => el.nom && el.nom.toLowerCase() === choix.toLowerCase()
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

      const hasCommon = arrG.some((v) => arrS.includes(v));

      if (hasCommon) {
        const hasExtra = arrG.some((v) => !arrS.includes(v));
        if (hasExtra) return "notTotallyWrong";

        return "partial";
      }

      return "wrong";
    };

    const verdict = {
      isCorrect,
      type: checkMatch(userGuess.type, secret.type),
      lieu: checkMatch(userGuess.lieu, secret.lieu),
      couleur: checkMatch(userGuess.couleur, secret.couleur),
      hitbox: checkMatch(userGuess.hitbox, secret.hitbox)
    };

    if (isCorrect) {
      statsStore.registerSuccess(secret.nom, tryCount, hintUses, timeInSeconds);
    }

    const stats = statsStore.getStats(secret.nom);

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
          : userGuess.hitbox
      },
      verdict,
      secretVersion: getSecretVersion ? getSecretVersion() : "1.0.0",
      dailySuccessCount: stats.count || 0,
      avgTries: stats.avgTries || 0,
      avgHints: stats.avgHints || 0,
      avgTime: stats.avgTime || 0
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
          : secret.hitbox
      }
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

    if (type === "opposite") {
      const secret = getSecretElement();
      const elements = getElementsList() || [];

      const getRawArr = (attr) =>
        Array.isArray(attr)
          ? attr.map((v) => v.trim().toLowerCase())
          : [attr.trim().toLowerCase()];

      const secretType = getRawArr(secret.type);
      const secretLieu = getRawArr(secret.lieu);
      const secretCouleur = getRawArr(secret.couleur);
      const secretHitbox = getRawArr(secret.hitbox);

      // 1. On évalue chaque élément selon son nombre de catégories totallement différentes (max 4)
      const scoredCandidates = elements
        .filter(
          (el) => el.nom && el.nom.toLowerCase() !== secret.nom.toLowerCase()
        )
        .map((el) => {
          let diffCount = 0;
          const elType = getRawArr(el.type);
          const elLieu = getRawArr(el.lieu);
          const elCouleur = getRawArr(el.couleur);
          const elHitbox = getRawArr(el.hitbox);

          if (!elType.some((t) => secretType.includes(t))) diffCount++;
          if (!elLieu.some((l) => secretLieu.includes(l))) diffCount++;
          if (!elCouleur.some((c) => secretCouleur.includes(c))) diffCount++;
          if (!elHitbox.some((h) => secretHitbox.includes(h))) diffCount++;

          return { el, diffCount };
        });

      // 2. On trie du plus différent au moins différent (on veut le max de différences, ex: 4)
      scoredCandidates.sort((a, b) => b.diffCount - a.diffCount);

      let opposite = null;
      let differentCategories = [];

      if (scoredCandidates.length > 0) {
        const maxDiff = scoredCandidates[0].diffCount;
        const bestCandidates = scoredCandidates.filter(
          (c) => c.diffCount === maxDiff
        );

        const index = getSeededRandom(1) % bestCandidates.length;
        opposite = bestCandidates[index].el;

        // 3. On détecte lesquelles sont différentes pour le texte
        const opType = getRawArr(opposite.type);
        const opLieu = getRawArr(opposite.lieu);
        const opCouleur = getRawArr(opposite.couleur);
        const opHitbox = getRawArr(opposite.hitbox);

        if (!opType.some((t) => secretType.includes(t)))
          differentCategories.push("Type");
        if (!opLieu.some((l) => secretLieu.includes(l)))
          differentCategories.push("Location");
        if (!opCouleur.some((c) => secretCouleur.includes(c)))
          differentCategories.push("Colour");
        if (!opHitbox.some((h) => secretHitbox.includes(h)))
          differentCategories.push("Hitbox");
      }

      let categoriesText = "its attributes";
      if (differentCategories.length === 4) {
        categoriesText = "is a perfect opposite !";
      } else if (differentCategories.length > 0) {
        if (differentCategories.length === 1) {
          categoriesText = `is opposite to the word on ${differentCategories[0]}`;
        } else {
          const last = differentCategories.pop();
          categoriesText = `is opposite to the word on ${differentCategories.join(", ")} and ${last}`;
        }
      } else {
        categoriesText = "shares some attributes";
      }

      return res.json({
        text: `<strong>Opposite:</strong> <em>${
          opposite ? opposite.nom : "Unknown"
        }</em> ${categoriesText}.`
      });

      return res.json({
        text: `<strong>Opposite:</strong> <em>${
          opposite ? opposite.nom : "Unknown"
        }</em> is opposite to the word on ${categoriesText}.`
      });
    }

    if (type === "secret_info") {
      const infos = [
        `Its type includes: <strong>${
          Array.isArray(secret.type) ? secret.type[0] : secret.type
        }</strong>`,
        `It can be found in: <strong>${
          Array.isArray(secret.lieu) ? secret.lieu[0] : secret.lieu
        }</strong>`
      ];
      const index = getSeededRandom(2) % infos.length;
      return res.json({
        text: `<strong>Secret Info:</strong> ${infos[index]}`
      });
    }

    if (type === "truth_and_lies") {
      const secretColor = Array.isArray(secret.couleur)
        ? secret.couleur[0]
        : secret.couleur;
      const secretHitbox = Array.isArray(secret.hitbox)
        ? secret.hitbox[0]
        : secret.hitbox;

      const truthPool = [
        `Hitbox is "${secretHitbox || "Unknown"}"`,
        `Color includes "${secretColor || "Unknown"}"`
      ];

      const trueIndex = getSeededRandom(3) % truthPool.length;
      const trueStatement = truthPool[trueIndex];

      const getSeededWrong = (currentVal, pool, seedOffset) => {
        const arr = Array.isArray(currentVal) ? currentVal : [currentVal];
        const filtered = pool.filter((v) => !arr.includes(v));
        if (filtered.length === 0) return "Other";
        const idx = getSeededRandom(seedOffset) % filtered.length;
        return filtered[idx];
      };

      const fakeHitbox = getSeededWrong(secret.hitbox, ALL_HITBOXES, 11);
      const fakeColor = getSeededWrong(secret.couleur, ALL_COLORS, 13);

      const liesPool = [
        `Hitbox is "${fakeHitbox}"`,
        `Color includes "${fakeColor}"`
      ];

      const statements = [trueStatement, liesPool[0], liesPool[1]];

      const randOrder = getSeededRandom(6) % 3;
      if (randOrder === 1) statements.push(statements.shift());
      if (randOrder === 2) statements.unshift(statements.pop());

      const hintText = `<strong>1 Truth & 2 Lies:</strong><br>• ${statements.join(
        "<br>• "
      )}`;

      return res.json({ text: hintText });
    }

    return res.status(400).json({ error: "Invalid hint type" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
