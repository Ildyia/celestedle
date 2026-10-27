const express = require("express");
const betaSync = require("../../services/beta-sync");
const { HttpError } = require("../../utils/http-error");

const router = express.Router();

// Lu par la bêta au démarrage. Sans SYNC_TOKEN sur ce serveur, la route
// refuse tout le monde.
router.get("/sync/export", (req, res) => {
  const token = req.get("Authorization")?.replace(/^Bearer /, "");
  if (!betaSync.isSyncToken(token)) throw new HttpError(401, "Invalid sync token.");
  res.json(betaSync.exportForSync());
});

module.exports = router;
