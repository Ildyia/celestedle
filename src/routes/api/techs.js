const express = require("express");
const techs = require("../../services/techs");
const techsRepo = require("../../repositories/techs");
const statsRepo = require("../../repositories/stats");
const staff = require("../../services/staff");
const { requireAccess } = require("../../middleware/admin-auth");
const { requirePlayer } = require("../../middleware/player");
const { todayParis, msUntilNextDay } = require("../../utils/dates");

const router = express.Router();

// Qui peut jouer, pour afficher ou non l'onglet et le badge de test
router.get("/techs-access", (req, res) => {
  res.json({ access: staff.gameAccess("techs"), canPlay: staff.canPlay("techs", req.player) });
});

// Le jeu est ouvert selon le réglage d'accès de l'admin
router.use("/techs", requireAccess("techs"));

// Liste des techs jouables, pour les suggestions
router.get("/techs/list", (req, res) => {
  res.json({
    techs: techsRepo.listActive().map(({ nom, media }) => ({ nom, hasMedia: Boolean(media) })),
    aliases: techsRepo.listAliases()
  });
});

const wordIdOf = (req) => (typeof req.body?.wordId === "string" ? req.body.wordId : undefined);

router.get("/techs/game", (req, res) => {
  res.json({ ...techs.games.getState(req.player, req.query.mode ?? "tech"), nextWordInMs: msUntilNextDay() });
});

router.post("/techs/guess", requirePlayer, (req, res) => {
  const { mode = "tech", guess } = req.body || {};
  if (typeof guess !== "string" || !guess.trim()) {
    return res.status(400).json({ error: "Missing guess." });
  }
  res.json(techs.games.guess(req.player, mode, guess, wordIdOf(req)));
});

router.post("/techs/hint", requirePlayer, (req, res) => {
  const { mode = "tech", type, choice } = req.body || {};
  res.json(techs.games.useHint(req.player, mode, type, wordIdOf(req), choice));
});

router.post("/techs/forfeit", requirePlayer, (req, res) => {
  res.json(techs.games.forfeit(req.player, req.body?.mode ?? "tech", wordIdOf(req)));
});

// Règles des deux modes (fenêtre des règles)
router.get("/techs/modes", (req, res) => {
  res.json(Object.fromEntries(techs.MODE_IDS.map((id) => [id, techs.getRules(id)])));
});

router.get("/techs/stats", (req, res) => {
  const mode = techs.getRules(req.query.mode ?? "tech");
  techs.games.expireOverdueGames();
  res.json({ mode: mode.id, ...statsRepo.communityStats(todayParis(), mode.id) });
});

module.exports = router;
