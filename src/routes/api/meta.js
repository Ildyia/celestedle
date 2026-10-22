const express = require("express");
const db = require("../../db");
const { version } = require("../../../package.json");

const router = express.Router();

router.get("/version", (req, res) => {
  res.json({ version });
});

// Pour les healthchecks Docker / Render
router.get("/health", (req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ status: "ok", version });
});

module.exports = router;
