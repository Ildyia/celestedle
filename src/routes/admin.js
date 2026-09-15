const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const {
  updateSeedHash,
  getSecretOfTheDay,
  getSecretElement,
  getElementsList
} = require("../utils/helpers");

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expirée" });
  }
}

router.post("/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: "Mot de passe incorrect" });
});

router.get("/session", verifyAdminToken, (req, res) => {
  res.json({ authenticated: true });
});

router.post("/trigger-reset", verifyAdminToken, (req, res) => {
  const newHash = Math.floor(Math.random() * 1000000);
  updateSeedHash(newHash);
  const secret = getSecretElement();
  res.json({
    message: "Reset réussi",
    secretElement: secret.nom,
    details: secret,
    newHash
  });
});

router.post("/random-hash", verifyAdminToken, (req, res) => {
  const newHash = req.body.newHash || Math.floor(Math.random() * 1000000);
  updateSeedHash(newHash);
  const secret = getSecretElement();
  res.json({
    message: "Hash à jour",
    secretElement: secret.nom,
    details: secret,
    newHash
  });
});

router.post("/get-secret", verifyAdminToken, (req, res) => {
  const secret = getSecretElement();
  res.json({ secretElement: secret.nom, details: secret });
});

router.post("/set-secret", verifyAdminToken, (req, res) => {
  const { elementName } = req.body || {};
  const elements = getElementsList() || [];

  const found = elements.find(
    (el) => el.nom && el.nom.toLowerCase() === (elementName || "").toLowerCase()
  );

  if (!found) {
    return res.status(404).json({ error: "Élément introuvable" });
  }

  res.json({
    message: `Mot secret défini sur : ${found.nom}`,
    secretElement: found.nom,
    details: found
  });
});

router.get("/elements-list", verifyAdminToken, (req, res) => {
  const elements = getElementsList() || [];
  res.json(elements);
});

// Route publique/admin pour charger les détails de tous les éléments pour le tableau
router.get("/all-elements-details", (req, res) => {
  try {
    const elements = getElementsList() || [];
    res.json(elements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route publique/admin pour lire l'historique des statistiques
router.get("/stats-history", (req, res) => {
  try {
    const historyPath = path.join(__dirname, "../../stats-history.json");
    if (fs.existsSync(historyPath)) {
      const data = JSON.parse(fs.readFileSync(historyPath, "utf8"));
      return res.json(data);
    }
    return res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
