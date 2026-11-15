const express = require("express");
const duels = require("../../services/duels");
const { requirePlayer } = require("../../middleware/player");
const { rateLimit } = require("../../middleware/rate-limit");

const router = express.Router();

const createLimit = rateLimit({ name: "duels", windowMs: 60 * 60 * 1000, max: 60 });

// Salons publics qui attendent un second joueur
router.get("/duels", (req, res) => {
  res.json({ rooms: duels.listOpen() });
});

router.post("/duels", requirePlayer, createLimit, (req, res) => {
  const { mode, isPublic } = req.body || {};
  res.status(201).json(duels.create(req.player, { mode, isPublic: isPublic !== false }));
});

// Salon, parties et résultat (le client le redemande toutes les 2 à 3 s)
router.get("/duels/:id", (req, res) => {
  res.json(duels.getDuel(req.params.id, req.player));
});

router.post("/duels/:id/join", requirePlayer, (req, res) => {
  res.json(duels.join(req.params.id, req.player));
});

router.post("/duels/:id/close", requirePlayer, (req, res) => {
  res.json(duels.close(req.params.id, req.player));
});

// Mêmes réponses que /game/guess, /game/hint, /game/forfeit
router.post("/duels/:id/guess", requirePlayer, (req, res) => {
  const guess = req.body?.guess;
  if (typeof guess !== "string" || !guess.trim()) return res.status(400).json({ error: "Missing guess." });
  res.json(duels.guess(req.params.id, req.player, guess));
});

router.post("/duels/:id/hint", requirePlayer, (req, res) => {
  res.json(duels.useHint(req.params.id, req.player, req.body?.type, req.body?.choice));
});

router.post("/duels/:id/forfeit", requirePlayer, (req, res) => {
  res.json(duels.forfeit(req.params.id, req.player));
});

router.post("/duels/:id/rematch", requirePlayer, (req, res) => {
  res.json(duels.rematch(req.params.id, req.player));
});

module.exports = router;
