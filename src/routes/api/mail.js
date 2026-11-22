// Boîte aux lettres : lecture par les joueurs, écriture par l'équipe admin
const express = require("express");
const mail = require("../../services/mail");
const { requirePlayer } = require("../../middleware/player");
const { requireStaff, limitedAction } = require("../../middleware/admin-auth");

const router = express.Router();

// Sans profil : le courrier pour tous, rien de lu
router.get("/mail", (req, res) => {
  res.json({ letters: mail.inbox(req.player) });
});

router.post("/mail/:id/read", requirePlayer, (req, res) => {
  res.json(mail.markRead(req.player, req.params.id));
});

router.get("/admin/mail", requireStaff, (req, res) => {
  res.json(mail.listForAdmin());
});

router.post("/admin/mail", requireStaff, limitedAction("send_mail", (req) => req.body?.title), async (req, res) => {
  res.status(201).json(await mail.send(req.player, req.body || {}));
});

router.put("/admin/mail/:id", requireStaff, limitedAction("edit_mail", (req) => req.params.id), async (req, res) => {
  res.json(await mail.edit(req.params.id, req.body || {}));
});

router.delete("/admin/mail/:id", requireStaff, limitedAction("delete_mail", (req) => req.params.id), async (req, res) => {
  res.json(await mail.remove(req.params.id));
});

module.exports = router;
