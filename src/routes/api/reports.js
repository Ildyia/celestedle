const express = require("express");
const reports = require("../../services/reports");
const { requirePlayer } = require("../../middleware/player");
const { rateLimit } = require("../../middleware/rate-limit");

const router = express.Router();

const createLimit = rateLimit({ name: "reports", windowMs: 10 * 60 * 1000, max: 5 });
const voteLimit = rateLimit({ name: "votes", windowMs: 60 * 1000, max: 30 });

const voterOf = (req) => (req.player ? `player:${req.player.id}` : null);

router.get("/reports", (req, res) => {
  res.json({ bugTypes: reports.BUG_TYPES, reports: reports.list(voterOf(req)) });
});

// Reports ouverts proches de ce que le joueur est en train d'écrire
router.post("/reports/similar", (req, res) => {
  const { elementName, description } = req.body || {};
  res.json(reports.findSimilar({ elementName, description }, voterOf(req)));
});

router.post("/reports", createLimit, (req, res) => {
  res.status(201).json(reports.create(req.body || {}, req.player));
});

router.post("/reports/:id/vote", requirePlayer, voteLimit, (req, res) => {
  res.json(reports.toPublic(reports.vote(req.params.id, voterOf(req), Boolean(req.body?.isUp))));
});

module.exports = router;
