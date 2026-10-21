const express = require("express");
const { resolvePlayer } = require("../../middleware/player");
const { notFound } = require("../../middleware/errors");

const router = express.Router();

router.use(resolvePlayer);
router.use(require("./meta"));
router.use(require("./game"));
router.use(require("./elements"));
router.use(require("./players"));
router.use(require("./leaderboard"));
router.use(require("./reports"));
router.use(require("./admin"));
router.use(notFound);

module.exports = router;
