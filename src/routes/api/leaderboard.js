const express = require("express");
const { getLeaderboard } = require("../../services/leaderboard");

const router = express.Router();

router.get("/leaderboard", (req, res) => {
  const { period = "daily", mode = "normal" } = req.query;
  res.json(getLeaderboard(period, mode, req.player ?? null));
});

module.exports = router;
