const express = require("express");
const mail = require("../../services/mail");
const connections = require("../../services/connections");
const { requireStaff, requirePlaytester, limitedAction } = require("../../middleware/admin-auth");
const { rateLimit } = require("../../middleware/rate-limit");
const { requirePlayer } = require("../../middleware/player");
const staff = require("../../services/staff");
const players = require("../../services/players");
const statsRepo = require("../../repositories/stats");
const { HttpError } = require("../../utils/http-error");
const { todayParis, addDays, msUntilNextDay } = require("../../utils/dates");

const router = express.Router();

// Qui peut jouer, pour afficher ou non le lien et le badge de test ; les
// grilles d'entraînement sont réservées à l'équipe admin
// cside : la C-Side (grilles de tags seulement), avec son propre accès
router.get("/connections-access", (req, res) => {
  res.json({
    access: staff.connectionsAccess(),
    canPlay: staff.canPlaytest(req.player),
    canPractice: staff.isStaff(req.player),
    cside: { access: staff.csideAccess(), canPlay: staff.canPlayCside(req.player) }
  });
});

function checkPractice(req, practice) {
  if (practice && !staff.isStaff(req.player)) throw new HttpError(403, "Practice grids are for the admin team.");
  return practice;
}

// La C-Side (mode « custom ») a son propre accès, en plus de celui du jeu
function checkSide(req, mode = "normal") {
  if (mode !== "custom" || staff.canPlayCside(req.player)) return mode;
  if (!req.player) throw new HttpError(401, "Sign in with your player profile first.");
  throw new HttpError(403, "The C-Side is only open to playtesters for now.");
}

// Le jeu est ouvert selon le réglage d'accès, la gestion à l'équipe admin
router.use("/connections", requirePlaytester);
router.use("/admin/connections", requireStaff);

// ?mode=normal|hard ; ?practice=1 : grille d'entraînement du joueur au lieu
// de la grille du jour
router.get("/connections", (req, res) => {
  const options = { mode: checkSide(req, req.query.mode ?? "normal"), practice: checkPractice(req, req.query.practice === "1") };
  res.json({ ...connections.getState(req.player, options), nextGridInMs: msUntilNextDay() });
});

router.post("/connections/guess", requirePlayer, (req, res) => {
  const { names, mode = "normal", practice, gridId } = req.body || {};
  const options = { mode: checkSide(req, mode), practice: checkPractice(req, practice === true), gridId: typeof gridId === "string" ? gridId : undefined };
  res.json(connections.guess(req.player, names, options));
});

router.post("/connections/hint", requirePlayer, (req, res) => {
  const { type, mode = "normal", practice, gridId } = req.body || {};
  const options = { mode: checkSide(req, mode), practice: checkPractice(req, practice === true), gridId: typeof gridId === "string" ? gridId : undefined };
  res.json(connections.useHint(req.player, type, options));
});

// Playtest : nouvelle grille d'entraînement, autant que voulu (tirée dans le
// worker ; la limite évite seulement les abus)
const practiceLimit = rateLimit({ name: "connections-practice", windowMs: 60 * 1000, max: 30 });
router.post("/connections/practice", requirePlayer, practiceLimit, async (req, res) => {
  checkPractice(req, true);
  res.json(await connections.newPracticePuzzle(req.player, checkSide(req, req.body?.mode ?? "normal")));
});

// Statistiques du joueur sur les grilles du jour (journal du menu) ;
// « tries » compte les erreurs
router.get("/connections/me/stats", requirePlayer, (req, res) => {
  const mode = checkSide(req, ["hard", "custom"].includes(req.query.mode) ? req.query.mode : "normal");
  res.json({ mode, ...players.summarizeGames(statsRepo.playerConnectionGames(req.player.id, mode)) });
});

router.get("/connections/stats", (req, res) => {
  res.json(connections.communityStats(checkSide(req, req.query.mode ?? "normal")));
});

router.get("/connections/leaderboard", (req, res) => {
  res.json({ top: connections.leaderboard(req.player?.id, checkSide(req, req.query.mode ?? "normal")) });
});

const suggestLimit = rateLimit({ name: "connections-suggest", windowMs: 10 * 60 * 1000, max: 5 });
router.post("/connections/tag-suggestions", requirePlayer, suggestLimit, (req, res) => {
  res.status(201).json(connections.suggestTag(req.player, req.body || {}));
});

// Avec les lettres déjà envoyées à leur auteur
router.get("/admin/connections/suggestions", (req, res) => {
  const replies = mail.repliesTo("suggestion");
  res.json(connections.listSuggestions().map((s) => ({ ...s, replies: replies[s.id] ?? [] })));
});

// Lettre personnelle à l'auteur de la suggestion, dans sa boîte aux lettres
router.post("/admin/connections/suggestions/:id/reply", limitedAction("reply_suggestion", (req) => req.params.id), (req, res) => {
  res.status(201).json(mail.replyToSuggestion(req.player, req.params.id, req.body || {}));
});

// Suggestion traitée (tag créé) ou écartée. ?added=<nom du tag> : devenue
// un tag, son auteur reçoit une lettre (rien quand elle est écartée)
router.delete("/admin/connections/suggestions/:id", (req, res) => {
  if (req.query.added) mail.suggestionAdded(req.params.id, String(req.query.added));
  connections.deleteSuggestion(Number(req.params.id));
  res.status(204).end();
});

router.put("/admin/connections/access", limitedAction("connections_access", (req) => req.body?.access), (req, res) => {
  res.json({ access: staff.setConnectionsAccess(req.body?.access) });
});

router.put("/admin/connections/cside-access", limitedAction("cside_access", (req) => req.body?.access), (req, res) => {
  res.json({ access: staff.setCsideAccess(req.body?.access) });
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

// Grilles d'aujourd'hui et des jours suivants (UPCOMING_DAYS en tout), avec
// leurs réponses, pour chaque mode. Celles qui manquent sont tirées dans le
// worker : le serveur continue de répondre aux joueurs pendant ce temps.
// Diagnostic des tags : quelques secondes de grilles d'essai dans le worker
router.get("/admin/connections/tags/diagnostics", async (req, res) => {
  res.json(await connections.tagDiagnostics());
});

router.get("/admin/connections/puzzles", async (req, res) => {
  const today = todayParis();
  const previews = [];
  for (let i = 0; i < connections.UPCOMING_DAYS; i++) {
    const date = addDays(today, i);
    for (const mode of connections.MODES) {
      // Une grille qui échoue n'empêche pas d'afficher les autres
      try {
        await connections.ensurePuzzle(date, mode);
        previews.push(connections.puzzlePreview(date, mode));
      } catch (err) {
        console.error(`[ERROR] Connections ${mode} ${date}`, err);
        previews.push({ date, mode, error: `${err.name}: ${err.message}` });
      }
    }
  }
  res.json(previews);
});

router.post(
  "/admin/connections/puzzles/:date/regenerate",
  limitedAction("regenerate_grid", (req) => `${req.params.date} ${req.body?.mode ?? "normal"}`),
  async (req, res) => {
    const { date } = req.params;
    const today = todayParis();
    const last = addDays(today, connections.UPCOMING_DAYS - 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > last) {
      throw new HttpError(400, `Only today's grid and the next ${connections.UPCOMING_DAYS - 1} days can be regenerated.`);
    }
    const mode = req.body?.mode ?? "normal";
    await connections.regeneratePuzzle(date, mode);
    res.json(connections.puzzlePreview(date, mode));
  }
);

module.exports = router;
