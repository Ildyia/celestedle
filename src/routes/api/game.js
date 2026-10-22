const express = require("express");
const games = require("../../services/games");
const statsRepo = require("../../repositories/stats");
const { getMode } = require("../../services/modes");
const { allModeRules } = require("../../services/mode-rules");
const { requirePlayer } = require("../../middleware/player");
const { todayParis, msUntilNextDay } = require("../../utils/dates");

const router = express.Router();

// Partie du jour pour le mode demandé (vide si le joueur n'a pas encore joué)
router.get("/game", (req, res) => {
  res.json({
    ...games.getState(req.player, req.query.mode),
    nextWordInMs: msUntilNextDay()
  });
});

router.post("/game/guess", requirePlayer, (req, res) => {
  const { mode, guess } = req.body || {};
  if (typeof guess !== "string" || !guess.trim()) {
    return res.status(400).json({ error: "Missing guess." });
  }
  res.json(games.guess(req.player, mode, guess));
});

router.post("/game/hint", requirePlayer, (req, res) => {
  const { mode, type } = req.body || {};
  res.json(games.useHint(req.player, mode, type));
});

router.post("/game/forfeit", requirePlayer, (req, res) => {
  res.json(games.forfeit(req.player, req.body?.mode));
});

// Règles actuelles de chaque mode (pour la fenêtre des règles)
router.get("/modes", (req, res) => {
  res.json(allModeRules());
});

// Statistiques communautaires du jour
router.get("/stats/today", (req, res) => {
  const mode = getMode(req.query.mode);
  res.json({ mode: mode.id, ...statsRepo.communityStats(todayParis(), mode.id) });
});

module.exports = router;
