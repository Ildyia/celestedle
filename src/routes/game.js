const express = require("express");
const router = express.Router();
const {
  getSecretElement,
  getElementsList,
  getDailyStats,
  recordDailySuccess,
  getSecretVersion,
  getSeededRandom
} = require("../utils/helpers");

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
          : userGuess.hitbox
      },
      verdict,
      secretVersion: getSecretVersion ? getSecretVersion() : "1.0.0",
      dailySuccessCount: stats.count || 0,
      avgTries: stats.avgTries || 0,
      avgHints: stats.avgHints || 0
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

    router.post("/hint", (req, res) => {
      try {
        const { type } = req.body || {};
        const secret = getSecretElement();
        const elements = getElementsList() || [];

        if (type === "opposite") {
          const getNorm = (attr) => {
            if (Array.isArray(attr))
              return attr.map((v) => v.trim().toLowerCase());
            if (typeof attr === "string")
              return attr.split(",").map((v) => v.trim().toLowerCase());
            return [];
          };

          const secretAttrs = {
            type: getNorm(secret.type),
            lieu: getNorm(secret.lieu),
            couleur: getNorm(secret.couleur),
            hitbox: getNorm(secret.hitbox)
          };

          // 1. Filtrer les éléments qui n'ont AUCUN attribut identique (aucun vert)
          const validCandidates = elements.filter((el) => {
            if (!el.nom || el.nom.toLowerCase() === secret.nom.toLowerCase())
              return false;

            const checkExact = (g, s) =>
              g.length === s.length && g.every((v) => s.includes(v));

            const hasTypeMatch = checkExact(getNorm(el.type), secretAttrs.type);
            const hasLieuMatch = checkExact(getNorm(el.lieu), secretAttrs.lieu);
            const hasCouleurMatch = checkExact(
              getNorm(el.couleur),
              secretAttrs.couleur
            );
            const hasHitboxMatch = checkExact(
              getNorm(el.hitbox),
              secretAttrs.hitbox
            );

            return !(
              hasTypeMatch ||
              hasLieuMatch ||
              hasCouleurMatch ||
              hasHitboxMatch
            );
          });

          // 2. Scorer selon le nombre d'attributs partiellement communs (rouges/oranges)
          const scoredCandidates = validCandidates.map((el) => {
            let score = 0;
            ["type", "lieu", "couleur", "hitbox"].forEach((attr) => {
              const g = getNorm(el[attr]);
              const s = secretAttrs[attr];
              if (g.some((v) => s.includes(v))) score++;
            });
            return { el, score };
          });

          // 3. Récupérer le score maximal
          const maxScore = Math.max(...scoredCandidates.map((c) => c.score), 0);
          const bestCandidates = scoredCandidates
            .filter((c) => c.score === maxScore)
            .map((c) => c.el);

          // 4. Sélectionner parmi les meilleurs faux amis
          const index = getSeededRandom(1) % bestCandidates.length;
          const falseFriend = bestCandidates[index];

          return res.json({
            text: `<strong>False Friend:</strong> <em>${
              falseFriend ? falseFriend.nom : "Unknown"
            }</em> shares partial characteristics with the secret, but NONE of its attributes are fully correct.`
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

    if (type === "secret_info") {
      const infos = [
        `Its type includes: <strong>${Array.isArray(secret.type) ? secret.type[0] : secret.type}</strong>`,
        `It can be found in: <strong>${Array.isArray(secret.lieu) ? secret.lieu[0] : secret.lieu}</strong>`
      ];
      const index = getSeededRandom(2) % infos.length;
      return res.json({
        text: `<strong>Secret Info:</strong> ${infos[index]}`
      });
    }

    if (type === "truth_and_lies") {
      // Réservé exclusivement à Couleur et Hitbox
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

      const hintText = `<strong>1 Truth & 2 Lies:</strong><br>• ${statements.join("<br>• ")}`;

      return res.json({ text: hintText });
    }

    return res.status(400).json({ error: "Invalid hint type" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
