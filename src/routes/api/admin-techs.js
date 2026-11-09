const express = require("express");
const techs = require("../../services/techs");
const techsRepo = require("../../repositories/techs");
const statsRepo = require("../../repositories/stats");
const staff = require("../../services/staff");
const sprites = require("../../services/sprites");
const { requireStaff, limitedAction } = require("../../middleware/admin-auth");
const { HttpError } = require("../../utils/http-error");
const { todayParis } = require("../../utils/dates");

// Admin des techs : liste, édition, image ou GIF, accès, tech du jour
const router = express.Router();
router.use("/admin/techs", requireStaff);

// TAS, GM et GM+ s'écrivent en capitales, les autres niveaux avec une majuscule
function capitalize(text) {
  return ["tas", "gm", "gm+"].includes(text) ? text.toUpperCase() : text.charAt(0).toUpperCase() + text.slice(1);
}

function secretSummary(mode) {
  const secret = techs.daily.getTodaySecret(mode);
  return { nom: secret.element.nom, hasMedia: Boolean(secret.element.media), source: secret.source, version: secret.version };
}

// Tech du jour et chiffres de chaque mode
function today() {
  techs.games.expireOverdueGames();
  const byMode = Object.fromEntries(statsRepo.dayOverview(todayParis(), { techs: true }).map((row) => [row.mode, row]));
  return Object.fromEntries(
    techs.MODE_IDS.map((mode) => [
      mode,
      { secret: secretSummary(mode), stats: byMode[mode] ?? { players: 0, wins: 0, forfeits: 0, losses: 0, playing: 0 } }
    ])
  );
}

router.get("/admin/techs", (req, res) => {
  res.json({
    techs: techsRepo.listAll(),
    vocabulary: techsRepo.vocabulary(),
    difficulties: techs.DIFFICULTIES.map(capitalize),
    access: staff.gameAccess("techs"),
    today: today()
  });
});

function text(value, field, max = 40) {
  const clean = String(value ?? "").trim();
  if (clean.length < 1 || clean.length > max) throw new HttpError(400, `${field} must be 1 to ${max} characters.`);
  return clean;
}

function validateTech(input, { partial }) {
  const out = {};
  if (input.name !== undefined || !partial) out.name = text(input.name, "Name", 60);
  for (const field of techsRepo.TECH_FIELDS) {
    if (input[field] === undefined && partial) continue;
    out[field] = text(input[field], techs.CATEGORY_LABELS[field]);
  }
  if (out.difficulty !== undefined) {
    const level = out.difficulty.toLowerCase();
    if (!techs.DIFFICULTIES.includes(level)) {
      throw new HttpError(400, `Difficulty must be one of ${techs.DIFFICULTIES.map(capitalize).join(", ")}.`);
    }
    out.difficulty = capitalize(level);
  }
  if (input.aliases !== undefined) {
    const list = Array.isArray(input.aliases) ? input.aliases : String(input.aliases).split(",");
    out.aliases = [...new Set(list.map((a) => String(a).trim()).filter(Boolean))];
    if (out.aliases.some((a) => a.length > 60)) throw new HttpError(400, "An alias must be 60 characters or less.");
  }
  if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
  return out;
}

function save(fn) {
  try {
    return fn();
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw new HttpError(409, "A tech with this name already exists.");
    }
    throw err;
  }
}

router.post("/admin/techs", limitedAction("create_tech", (req) => req.body?.name), (req, res) => {
  const input = validateTech(req.body || {}, { partial: false });
  res.status(201).json(save(() => techsRepo.create(input)));
});

router.patch("/admin/techs/:id", limitedAction("edit_tech", (req) => req.params.id), (req, res) => {
  const input = validateTech(req.body || {}, { partial: true });
  const tech = save(() => techsRepo.update(Number(req.params.id), input));
  if (!tech) throw new HttpError(404, "Unknown tech.");
  res.json(tech);
});

// Image ou GIF : corps brut, 3 Mo au plus
router.post(
  "/admin/techs/:id/media",
  limitedAction("upload_tech_media", (req) => req.params.id),
  express.raw({ type: () => true, limit: sprites.MAX_MEDIA_BYTES }),
  (req, res) => {
    const tech = techsRepo.findById(Number(req.params.id));
    if (!tech) throw new HttpError(404, "Unknown tech.");
    const media = sprites.saveUpload(tech, req.body, { maxBytes: sprites.MAX_MEDIA_BYTES });
    const updated = techsRepo.update(tech.id, { media });
    sprites.removeUpload(tech.media);
    res.json(updated);
  }
);

router.delete("/admin/techs/:id/media", limitedAction("delete_tech_media", (req) => req.params.id), (req, res) => {
  const tech = techsRepo.findById(Number(req.params.id));
  if (!tech) throw new HttpError(404, "Unknown tech.");
  const updated = techsRepo.update(tech.id, { media: null });
  sprites.removeUpload(tech.media);
  res.json(updated);
});

router.put("/admin/techs/access", limitedAction("techs_access", (req) => req.body?.access), (req, res) => {
  res.json({ access: staff.setGameAccess("techs", req.body?.access) });
});

// Tirer une autre tech ou en imposer une, pour un mode
router.post(
  "/admin/techs/secret",
  limitedAction("set_tech_secret", (req) => `${req.body?.mode ?? "tech"}:${req.body?.action}`),
  (req, res) => {
    const { mode = "tech", action, name } = req.body || {};
    techs.getRules(mode);
    if (action === "random") {
      techs.daily.drawRandomSecret(mode);
    } else if (action === "set") {
      const tech = techsRepo.findByNameOrAlias(name);
      if (!tech || !tech.isActive) throw new HttpError(404, "Unknown tech.");
      techs.daily.setSecret(mode, tech);
    } else {
      throw new HttpError(400, 'action must be "random" or "set"');
    }
    res.json(today());
  }
);

module.exports = router;
