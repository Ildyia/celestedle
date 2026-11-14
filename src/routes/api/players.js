const express = require("express");
const achievements = require("../../services/achievements");
const players = require("../../services/players");
const playersRepo = require("../../repositories/players");
const { requirePlayer } = require("../../middleware/player");
const { rateLimit } = require("../../middleware/rate-limit");
const { expireOverdueGames } = require("../../services/games");
const { REWARDS } = require("../../services/chapters");
const { FAMILIES } = require("../../services/avatars");
const trophies = require("../../services/trophies");

const router = express.Router();

const createLimit = rateLimit({ name: "players", windowMs: 60 * 60 * 1000, max: 20 });

// Crée un profil et renvoie son jeton (affiché ensuite comme code de récupération)
router.post("/players", createLimit, (req, res) => {
  const { player, token } = players.createPlayer();
  res.status(201).json({ player, token });
});

router.get("/players/options", (req, res) => {
  // families : les images de chaque personnage ; rewards : personnage et
  // couleur de chaque chapitre (verrouillés jusque-là)
  res.json({ avatars: players.AVATARS, colors: players.COLORS, families: FAMILIES, rewards: REWARDS });
});

router.get("/players/me", requirePlayer, (req, res) => {
  playersRepo.touch(req.player.id);
  res.json({ player: req.player });
});

router.patch("/players/me", requirePlayer, (req, res) => {
  const body = req.body || {};
  // Le chapitre n'est calculé que si on change de portrait ou de couleur
  const changing = (body.avatar && body.avatar !== req.player.avatar) || (body.color && body.color !== req.player.color);
  const chapter = changing ? achievements.playerClimb(req.player).chapter : 0;
  res.json({ player: players.updateProfile(req.player, body, chapter) });
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
  res.json({
    achievements: achievements.playerAchievements(req.player),
    climb: achievements.playerClimb(req.player),
    trophies: trophies.playerTrophies(req.player.id)
  });
});

// Fiche publique d'un joueur des classements : son ticket (nom, avatar,
// fraises, tampons, chapitre). Les fraises sont celles des chapitres : une
// par victoire, sur tous les jeux. Comme les classements, elle ne montre ni les profils
// cachés ni les profils anonymes.
router.get("/players/:id/card", (req, res) => {
  const target = playersRepo.findById(req.params.id);
  if (!target || target.isHidden || target.isAnonymous) return res.status(404).json({ error: "Player not found" });
  expireOverdueGames();
  const normal = players.playerStats(target, "normal");
  const hard = players.playerStats(target, "hard");
  const times = [normal.bestSeconds, hard.bestSeconds].filter((t) => t !== null && t !== undefined);
  const climb = achievements.playerClimb(target);
  res.json({
    player: { id: target.id, name: target.name, avatar: target.avatar, color: target.color },
    wins: climb.berries,
    falls: climb.chapters.reduce((sum, c) => sum + c.deaths, 0),
    streak: Math.max(normal.streak.current, hard.streak.current),
    bestTime: times.length ? Math.min(...times) : null,
    stamps: achievements.playerAchievements(target).filter((a) => a.earned).map((a) => a.id),
    chapter: climb.chapter,
    trophies: trophies.playerTrophies(target.id)
  });
});

module.exports = router;
