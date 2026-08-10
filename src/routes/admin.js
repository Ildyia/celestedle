const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const {
  updateSeedHash,
  getSecretOfTheDay,
  getSecretElement
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
  res.json({ message: "Reset réussi", secret: getSecretOfTheDay(), newHash });
});

router.post("/random-hash", verifyAdminToken, (req, res) => {
  const newHash = req.body.newHash || Math.floor(Math.random() * 1000000);
  updateSeedHash(newHash);
  res.json({ message: "Hash à jour", secret: getSecretOfTheDay(), newHash });
});

router.post("/get-secret", verifyAdminToken, (req, res) => {
  const secret = getSecretElement();
  res.json({ secretElement: secret.nom, details: secret });
});

// 1. Définir un mot secret spécifique
router.post("/set-secret", verifyAdminToken, (req, res) => {
  const { elementName } = req.body || {};
  const elements = getElementsList() || [];

  const found = elements.find(
    (el) => el.nom && el.nom.toLowerCase() === (elementName || "").toLowerCase()
  );

  if (!found) {
    return res.status(404).json({ error: "Élément introuvable" });
  }

  // Si tu as une fonction pour forcer l'index ou l'élément
  // updateSeedElement(found);

  res.json({
    message: `Mot secret défini sur : ${found.nom}`,
    secret: found.nom,
    details: found
  });
});

// 2. Liste complète des éléments pour l'auto-complétion admin
router.get("/elements-list", verifyAdminToken, (req, res) => {
  const elements = getElementsList() || [];
  res.json(elements);
});

module.exports = router;
