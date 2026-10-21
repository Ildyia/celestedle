const express = require("express");
const elementsRepo = require("../../repositories/elements");
const playersRepo = require("../../repositories/players");
const statsRepo = require("../../repositories/stats");
const daily = require("../../services/daily");
const reports = require("../../services/reports");
const { expireOverdueGames } = require("../../services/games");
const { MODE_IDS } = require("../../services/modes");
const { login, requireAdmin } = require("../../middleware/admin-auth");
const { rateLimit } = require("../../middleware/rate-limit");
const { HttpError } = require("../../utils/http-error");
const { todayParis } = require("../../utils/dates");

const router = express.Router();

const loginLimit = rateLimit({ name: "admin-login", windowMs: 15 * 60 * 1000, max: 10 });

router.post("/admin/login", loginLimit, async (req, res) => {
  const token = await login(req.body?.password);
  res.json({ success: true, token });
});

router.use("/admin", requireAdmin);

// Les chiffres de l'admin comptent comme perdues les parties Hard expirées
router.use("/admin", (req, res, next) => {
  expireOverdueGames();
  next();
});

router.get("/admin/session", (req, res) => {
  res.json({ authenticated: true });
});

function secretSummary(mode) {
  const secret = daily.getTodaySecret(mode);
  return {
    nom: secret.element.nom,
    sprite: secret.element.sprite,
    source: secret.source,
    version: secret.version
  };
}

// Aujourd'hui : mot et chiffres de chaque mode
router.get("/admin/overview", (req, res) => {
  const date = todayParis();
  const byMode = Object.fromEntries(statsRepo.dayOverview(date).map((row) => [row.mode, row]));
  res.json({
    date,
    totalPlayers: playersRepo.count(),
    repeatDelayDays: daily.getRepeatDelay(),
    modes: Object.fromEntries(
      MODE_IDS.map((mode) => [
        mode,
        {
          secret: secretSummary(mode),
          stats: byMode[mode] ?? { players: 0, wins: 0, forfeits: 0, losses: 0, playing: 0 }
        }
      ])
    )
  });
});

router.get("/admin/history", (req, res) => {
  res.json(statsRepo.history());
});

router.get("/admin/words", (req, res) => {
  res.json(statsRepo.wordStats());
});

// Tirer un autre mot ou imposer un élément, pour un mode
router.post("/admin/secret", (req, res) => {
  const { mode = "normal", action, elementName } = req.body || {};
  if (action === "random") {
    daily.drawRandomSecret(mode);
  } else if (action === "set") {
    const element = elementsRepo.findByName(elementName);
    if (!element || !element.isActive) throw new HttpError(404, "Élément introuvable");
    daily.setSecret(mode, element);
  } else {
    throw new HttpError(400, 'action must be "random" or "set"');
  }
  res.json(secretSummary(mode));
});

// Éditeur d'éléments
router.get("/admin/elements", (req, res) => {
  res.json({ elements: elementsRepo.listAll(), vocabulary: elementsRepo.vocabulary() });
});

function validateElementInput(input, { partial }) {
  const vocab = elementsRepo.vocabulary();
  const out = {};

  if (input.name !== undefined || !partial) {
    const name = String(input.name ?? "").trim();
    if (name.length < 1 || name.length > 60) throw new HttpError(400, "Name must be 1 to 60 characters.");
    out.name = name;
  }
  const single = (field, list) => {
    if (input[field] === undefined && partial) return;
    if (!list.includes(input[field])) throw new HttpError(400, `Unknown ${field} "${input[field]}".`);
    out[field] = input[field];
  };
  const multiple = (field, list) => {
    if (input[field] === undefined && partial) return;
    const values = Array.isArray(input[field]) ? input[field] : [];
    if (values.length === 0) throw new HttpError(400, `${field} needs at least one value.`);
    const unknown = values.find((v) => !list.includes(v));
    if (unknown) throw new HttpError(400, `Unknown ${field} "${unknown}".`);
    out[field] = values;
  };
  single("type", vocab.types);
  single("shape", vocab.shapes);
  multiple("lieu", vocab.locations);
  multiple("couleur", vocab.colors);

  if (input.sprite !== undefined) {
    const sprite = input.sprite ? String(input.sprite).trim() : null;
    if (sprite && !/^assets\/[\w./-]+$/.test(sprite)) {
      throw new HttpError(400, 'Sprite must be a path like "assets/entities/name.png".');
    }
    out.sprite = sprite;
  }
  if (input.isActive !== undefined) out.isActive = Boolean(input.isActive);
  return out;
}

function saveElement(fn) {
  try {
    return fn();
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "An element with this name already exists.");
    }
    throw err;
  }
}

router.post("/admin/elements", (req, res) => {
  const input = validateElementInput(req.body || {}, { partial: false });
  res.status(201).json(saveElement(() => elementsRepo.create(input)));
});

router.patch("/admin/elements/:id", (req, res) => {
  const input = validateElementInput(req.body || {}, { partial: true });
  const element = saveElement(() => elementsRepo.update(Number(req.params.id), input));
  if (!element) throw new HttpError(404, "Élément introuvable");
  res.json(element);
});

// Base actuelle au format db.json, à recopier dans le dépôt
router.get("/admin/export/db.json", (req, res) => {
  res.set("Content-Disposition", 'attachment; filename="db.json"');
  res.json(elementsRepo.exportAsDbJson());
});

router.get("/admin/reports", (req, res) => {
  res.json({ statuses: reports.STATUSES, reports: reports.listAll() });
});

router.patch("/admin/reports/:id", (req, res) => {
  res.json(reports.setStatus(req.params.id, req.body?.status));
});

router.put("/admin/settings", (req, res) => {
  const days = Number(req.body?.repeatDelayDays);
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    throw new HttpError(400, "repeatDelayDays must be an integer between 0 and 60.");
  }
  daily.setRepeatDelay(days);
  res.json({ repeatDelayDays: daily.getRepeatDelay() });
});

module.exports = router;
