const express = require("express");
const { getLeaderboard } = require("../../services/leaderboard");

const router = express.Router();

router.get("/leaderboard", (req, res) => {
  const { period = "daily", mode = "normal", season } = req.query;
  const seasonId = season === undefined ? null : Number(season);
  res.json(getLeaderboard(period, mode, req.player ?? null, Number.isInteger(seasonId) ? seasonId : null));
});

module.exports = router;
