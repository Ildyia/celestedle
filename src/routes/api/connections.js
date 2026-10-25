const express = require("express");
const connections = require("../../services/connections");
const { requireStaff, requirePlaytester, limitedAction } = require("../../middleware/admin-auth");
const { rateLimit } = require("../../middleware/rate-limit");
const { HttpError } = require("../../utils/http-error");
const { todayParis, addDays, msUntilNextDay } = require("../../utils/dates");

const router = express.Router();

// Phase de test : le jeu est ouvert aux playtesters, la gestion à l'équipe admin
router.use("/connections", requirePlaytester);
router.use("/admin/connections", requireStaff);

// ?mode=normal|hard ; ?practice=1 : grille d'entraînement du joueur au lieu
// de la grille du jour
router.get("/connections", (req, res) => {
  const options = { mode: req.query.mode ?? "normal", practice: req.query.practice === "1" };
  res.json({ ...connections.getState(req.player, options), nextGridInMs: msUntilNextDay() });
});

router.post("/connections/guess", (req, res) => {
  const { names, mode = "normal", practice } = req.body || {};
  res.json(connections.guess(req.player, names, { mode, practice: practice === true }));
});

// Playtest : nouvelle grille d'entraînement, autant que voulu (la génération
// prend quelques millisecondes ; la limite évite seulement les abus)
const practiceLimit = rateLimit({ name: "connections-practice", windowMs: 60 * 1000, max: 30 });
router.post("/connections/practice", practiceLimit, (req, res) => {
  res.json(connections.newPracticePuzzle(req.player, req.body?.mode ?? "normal"));
});

router.get("/connections/leaderboard", (req, res) => {
  res.json({ top: connections.leaderboard(req.player.id, req.query.mode ?? "normal") });
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

// Grilles d'aujourd'hui et des 6 jours suivants, avec leurs réponses, pour
// chaque mode
router.get("/admin/connections/puzzles", (req, res) => {
  const today = todayParis();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  res.json(days.flatMap((date) => connections.MODES.map((mode) => connections.puzzlePreview(date, mode))));
});

router.post(
  "/admin/connections/puzzles/:date/regenerate",
  limitedAction("regenerate_grid", (req) => `${req.params.date} ${req.body?.mode ?? "normal"}`),
  (req, res) => {
    const { date } = req.params;
    const today = todayParis();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, 6)) {
      throw new HttpError(400, "Only today's grid and the next 6 days can be regenerated.");
    }
    const mode = req.body?.mode ?? "normal";
    connections.regeneratePuzzle(date, mode);
    res.json(connections.puzzlePreview(date, mode));
  }
);

module.exports = router;
