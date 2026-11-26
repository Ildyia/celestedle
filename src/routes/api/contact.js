const express = require("express");
const contact = require("../../services/contact");
const { requirePlayer } = require("../../middleware/player");
const { requireStaff, limitedAction } = require("../../middleware/admin-auth");
const { rateLimit } = require("../../middleware/rate-limit");

const router = express.Router();

// Un joueur écrit à l'équipe (il faut un profil : la réponse arrive dans sa
// boîte aux lettres)
const sendLimit = rateLimit({ name: "contact", windowMs: 10 * 60 * 1000, max: 3 });
router.post("/contact", requirePlayer, sendLimit, (req, res) => {
  const message = contact.create(req.player, req.body || {});
  res.status(201).json({ id: message.id });
});

router.use("/admin/contact", requireStaff);

router.get("/admin/contact", (req, res) => {
  res.json({ messages: contact.list(), topics: contact.TOPIC_LABELS });
});

router.post("/admin/contact/:id/reply", limitedAction("reply_contact", (req) => req.params.id), (req, res) => {
  res.status(201).json(contact.reply(req.player, req.params.id, req.body || {}));
});

router.put("/admin/contact/:id", (req, res) => {
  res.json(contact.setStatus(req.params.id, req.body?.status));
});

router.delete("/admin/contact/:id", limitedAction("delete_contact", (req) => req.params.id), (req, res) => {
  contact.remove(req.params.id);
  res.status(204).end();
});

module.exports = router;
