const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const { updateSeedHash } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

const adminKey = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET n'est pas défini, définis-le dans tes variables d'environnement !"
  );
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h

function signAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "2h" });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.clearCookie("admin_token");
    return res.status(401).json({ error: "Session expired" });
  }
}

// --- LOGIN ---
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password !== adminKey) {
    return res.status(403).json({ error: "Incorrect password" });
  }

  res.cookie("admin_token", signAdminToken(), {
    httpOnly: true,
    secure: true, // nécessite HTTPS (déjà le cas en prod sur onrender/tes domaines)
    sameSite: "none", // requis car front et back sont sur des domaines différents
    maxAge: TOKEN_TTL_MS
  });

  res.json({ success: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie("admin_token");
  res.json({ success: true });
});

// Le front appelle ça au chargement pour savoir si la session est valide
router.get("/session", requireAdmin, (req, res) => {
  res.json({ valid: true });
});

router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "public", "admin.html"));
});

// --- Routes protégées : plus besoin d'envoyer le mot de passe dans le body ---

router.post("/random-hash", requireAdmin, (req, res) => {
  const { newHash } = req.body;
  const fallbackHash = process.env.RANDOM_SEED
    ? parseInt(process.env.RANDOM_SEED, 10)
    : 20250204;
  updateSeedHash(
    newHash === null || newHash === undefined ? fallbackHash : newHash
  );
  res.json({ success: true, message: "Secret updated" });
});

router.post("/trigger-reset", requireAdmin, (req, res) => {
  const newHash = Math.floor(Math.random() * 10000000);
  updateSeedHash(newHash);
  res.json({
    success: true,
    message:
      "Game forced reset successfully. Secret element and hints regenerated.",
    newHash
  });
});

router.post("/assign-image", requireAdmin, (req, res) => {
  const { entityName, srcPath } = req.body;
  if (!entityName || !srcPath)
    return res.status(400).json({ error: "Missing parameters" });

  const publicDir = path.join(__dirname, "..", "..", "public");
  const dumpFull = path.join(publicDir, srcPath);
  if (!fs.existsSync(dumpFull))
    return res.status(404).json({ error: "Source file not found: " + srcPath });

  const ext = path.extname(dumpFull) || ".png";
  const slug = entityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const destRel = `assets/entities/${slug}${ext}`;
  const destFull = path.join(publicDir, destRel);

  try {
    fs.copyFileSync(dumpFull, destFull);
    const mappingPath = path.join(
      publicDir,
      "assets",
      "entities",
      "mapping.json"
    );
    let mapping = {};
    if (fs.existsSync(mappingPath))
      mapping = JSON.parse(fs.readFileSync(mappingPath));
    mapping[entityName] = destRel;
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    return res.json({
      success: true,
      mappingEntry: mapping[entityName],
      dest: destRel
    });
  } catch (err) {
    console.error("assign-image error", err);
    return res.status(500).json({ error: "Failed to assign image" });
  }
});

router.post("/upload-image", requireAdmin, (req, res) => {
  const { entityName, fileName, fileData } = req.body;
  if (!entityName || !fileName || !fileData)
    return res.status(400).json({ error: "Missing parameters" });

  const publicDir = path.join(__dirname, "..", "..", "public");
  const ext = path.extname(fileName).toLowerCase() || ".png";
  const slug = entityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const destRel = `assets/entities/${slug}${ext}`;
  const destFull = path.join(publicDir, destRel);

  try {
    const buffer = Buffer.from(fileData, "base64");
    fs.writeFileSync(destFull, buffer);

    const mappingPath = path.join(
      publicDir,
      "assets",
      "entities",
      "mapping.json"
    );
    let mapping = {};
    if (fs.existsSync(mappingPath))
      mapping = JSON.parse(fs.readFileSync(mappingPath));
    mapping[entityName] = destRel;
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    return res.json({
      success: true,
      mappingEntry: mapping[entityName],
      dest: destRel
    });
  } catch (err) {
    console.error("upload-image error", err);
    return res.status(500).json({ error: "Failed to upload image" });
  }
});

module.exports = router;
