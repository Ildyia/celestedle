const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const {
  getSecretElement,
  getElementsList,
  findElementByName,
  setSecret,
  drawRandomSecret
} = require("../utils/helpers");
const { dataPath } = require("../utils/data-dir");

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

// Les deux boutons de l'admin tirent un autre mot pour aujourd'hui ; le choix
// est enregistré en base et survit aux redémarrages
router.post("/trigger-reset", verifyAdminToken, (req, res) => {
  const secret = drawRandomSecret();
  res.json({
    message: "Reset réussi",
    secretElement: secret.nom,
    details: secret
  });
});

router.post("/random-hash", verifyAdminToken, (req, res) => {
  const secret = drawRandomSecret();
  res.json({
    message: "Mot tiré au hasard",
    secretElement: secret.nom,
    details: secret
  });
});

router.post("/get-secret", verifyAdminToken, (req, res) => {
  const secret = getSecretElement();
  res.json({ secretElement: secret.nom, details: secret });
});

router.post("/set-secret", verifyAdminToken, (req, res) => {
  const { elementName } = req.body || {};
  const found = findElementByName(elementName);

  if (!found || !found.isActive) {
    return res.status(404).json({ error: "Élément introuvable" });
  }

  const secret = setSecret(found);
  res.json({
    message: `Mot secret défini sur : ${secret.nom}`,
    secretElement: secret.nom,
    details: secret
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
    const historyPath = dataPath("stats-history.json");
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
