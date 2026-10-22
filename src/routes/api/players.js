const express = require("express");
const players = require("../../services/players");
const playersRepo = require("../../repositories/players");
const { requirePlayer } = require("../../middleware/player");
const { rateLimit } = require("../../middleware/rate-limit");
const { expireOverdueGames } = require("../../services/games");

const router = express.Router();

const createLimit = rateLimit({ name: "players", windowMs: 60 * 60 * 1000, max: 20 });

// Crée un profil et renvoie son jeton (affiché ensuite comme code de récupération)
router.post("/players", createLimit, (req, res) => {
  const { player, token } = players.createPlayer();
  res.status(201).json({ player, token });
});

router.get("/players/options", (req, res) => {
  res.json({ avatars: players.AVATARS, colors: players.COLORS });
});

router.get("/players/me", requirePlayer, (req, res) => {
  playersRepo.touch(req.player.id);
  res.json({ player: req.player });
});

router.patch("/players/me", requirePlayer, (req, res) => {
  res.json({ player: players.updateProfile(req.player, req.body || {}) });
});

// Le joueur supprime son profil, ses parties et ses votes
router.delete("/players/me", requirePlayer, (req, res) => {
  players.deletePlayer(req.player.id);
  res.status(204).end();
});

router.get("/players/me/stats", requirePlayer, (req, res) => {
  expireOverdueGames();
  res.json(players.playerStats(req.player, req.query.mode));
});

module.exports = router;
