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

module.exports = router;
