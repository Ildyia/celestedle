const express = require("express");
const router = express.Router();
const { updateSeedHash } = require("../utils/helpers");

const adminKey = process.env.ADMIN_PASSWORD;
console.log("--- LA CLÉ ADMIN CHARGÉE EST :", adminKey, "---"); // <-- AJOUTE CETTE LIGNE

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
    return res.json({
      message: "The seed hash has been reset to the system default configuration.",
    });
  }

  updateSeedHash(newHash);
  res.json({
    message: "The seed hash updated successfully. Daily element puzzle has rotated.",
  });
});

module.exports = router;