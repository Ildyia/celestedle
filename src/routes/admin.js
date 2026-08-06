const express = require("express");
const router = express.Router();
const { updateSeedHash } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

const adminKey = process.env.ADMIN_PASSWORD;
console.log("--- LA CLÉ ADMIN CHARGÉE EST :", adminKey, "---");

router.post("/verify-key", (req, res) => {
  const { key } = req.body;
  if (key !== adminKey) {
    return res.status(403).json({ error: "Incorrect password" });
  }
  res.json({ success: true, message: "Access authorized" });
});

router.post("/random-hash", (req, res) => {
  const { key, newHash } = req.body;

  if (key !== adminKey) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (newHash === null) {
    updateSeedHash(20250204);
  } else {
    updateSeedHash(newHash);
  }

  // Met à jour secretVersion pour déclencher le reset côté client
});

router.post("/trigger-reset", (req, res) => {
  const { key } = req.body;
  if (adminKey && key !== adminKey) {
    return res.status(403).json({ error: "Access denied" });
  }

  const newHash = Math.floor(Math.random() * 10000000);
  updateSeedHash(newHash);

  res.json({
    success: true,
    message:
      "Game forced reset successfully. Secret element and hints regenerated.",
    newHash,
  });
});

router.post("/assign-image", (req, res) => {
  const { key, entityName, srcPath } = req.body;
  if (adminKey && key !== adminKey)
    return res.status(403).json({ error: "Access denied" });
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
      "mapping.json",
    );
    let mapping = {};
    if (fs.existsSync(mappingPath))
      mapping = JSON.parse(fs.readFileSync(mappingPath));
    mapping[entityName] = destRel;
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    return res.json({
      success: true,
      mappingEntry: mapping[entityName],
      dest: destRel,
    });
  } catch (err) {
    console.error("assign-image error", err);
    return res.status(500).json({ error: "Failed to assign image" });
  }
});

router.post("/upload-image", (req, res) => {
  const { key, entityName, fileName, fileData } = req.body;
  if (adminKey && key !== adminKey)
    return res.status(403).json({ error: "Access denied" });
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
      "mapping.json",
    );
    let mapping = {};
    if (fs.existsSync(mappingPath))
      mapping = JSON.parse(fs.readFileSync(mappingPath));
    mapping[entityName] = destRel;
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
    return res.json({
      success: true,
      mappingEntry: mapping[entityName],
      dest: destRel,
    });
  } catch (err) {
    console.error("upload-image error", err);
    return res.status(500).json({ error: "Failed to upload image" });
  }
});

module.exports = router;
