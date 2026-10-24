const express = require("express");
const connections = require("../../services/connections");
const { requireStaff, limitedAction } = require("../../middleware/admin-auth");
const { HttpError } = require("../../utils/http-error");
const { todayParis, addDays, msUntilNextDay } = require("../../utils/dates");

const router = express.Router();

// Phase de test : tout Connections est réservé à l'équipe admin
router.use("/connections", requireStaff);
router.use("/admin/connections", requireStaff);

router.get("/connections", (req, res) => {
  res.json({ ...connections.getState(req.player), nextGridInMs: msUntilNextDay() });
});

router.post("/connections/guess", (req, res) => {
  res.json(connections.guess(req.player, req.body?.names));
});

router.get("/connections/leaderboard", (req, res) => {
  res.json({ top: connections.leaderboard(req.player.id) });
});

// Tags : les éléments cochés l'ont, les autres non
router.get("/admin/connections/tags", (req, res) => {
  res.json(connections.listTags());
});

router.post("/admin/connections/tags", limitedAction("create_tag", (req) => req.body?.label), (req, res) => {
  res.status(201).json(connections.saveTag(null, req.body || {}));
});

router.put("/admin/connections/tags/:id", limitedAction("edit_tag", (req) => req.params.id), (req, res) => {
  res.json(connections.saveTag(Number(req.params.id), req.body || {}));
});

router.delete("/admin/connections/tags/:id", limitedAction("delete_tag", (req) => req.params.id), (req, res) => {
  connections.deleteTag(Number(req.params.id));
  res.status(204).end();
});

// Grilles d'aujourd'hui et des 6 jours suivants, avec leurs réponses
router.get("/admin/connections/puzzles", (req, res) => {
  const today = todayParis();
  res.json(Array.from({ length: 7 }, (_, i) => connections.puzzlePreview(addDays(today, i))));
});

router.post(
  "/admin/connections/puzzles/:date/regenerate",
  limitedAction("regenerate_grid", (req) => req.params.date),
  (req, res) => {
    const { date } = req.params;
    const today = todayParis();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, 6)) {
      throw new HttpError(400, "Only today's grid and the next 6 days can be regenerated.");
    }
    connections.regeneratePuzzle(date);
    res.json(connections.puzzlePreview(date));
  }
);

module.exports = router;
