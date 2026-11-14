const express = require("express");
const achievements = require("../../services/achievements");
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

// Achievements du joueur : ils posent les tampons sur son ticket
router.get("/players/me/achievements", requirePlayer, (req, res) => {
  expireOverdueGames();
  res.json({ achievements: achievements.playerAchievements(req.player) });
});

// Fiche publique d'un joueur des classements : son ticket (nom, avatar,
// fraises, tampons). Comme les classements, elle ne montre ni les profils
// cachés ni les profils anonymes.
router.get("/players/:id/card", (req, res) => {
  const target = playersRepo.findById(req.params.id);
  if (!target || target.isHidden || target.isAnonymous) return res.status(404).json({ error: "Player not found" });
  expireOverdueGames();
  const normal = players.playerStats(target, "normal");
  const hard = players.playerStats(target, "hard");
  const times = [normal.bestSeconds, hard.bestSeconds].filter((t) => t !== null && t !== undefined);
  res.json({
    player: { id: target.id, name: target.name, avatar: target.avatar, color: target.color },
    wins: normal.wins + hard.wins,
    falls: normal.losses + normal.forfeits + hard.losses + hard.forfeits,
    streak: Math.max(normal.streak.current, hard.streak.current),
    bestTime: times.length ? Math.min(...times) : null,
    stamps: achievements.playerAchievements(target).filter((a) => a.earned).map((a) => a.id)
  });
});

module.exports = router;
