const express = require("express");
const router = express.Router();

router.get("/list", (req, res) => {
  if (!global.reportsMap) return res.json([]);
  const reports = Array.from(global.reportsMap.entries()).map(([id, data]) => {
    let total = 0;
    data.votes.forEach((v) => (total += v));
    return {
      id,
      score: total,
      elementName: data.elementName || "N/A",
      bugType: data.bugType || "N/A",
      description: data.description || "N/A"
    };
  });
  res.json(reports);
});

router.post("/vote", async (req, res) => {
  const { reportId, userId, isUp } = req.body;
  if (!global.discordBotClient)
    return res.status(500).json({ error: "Bot offline" });
  const success = await global.discordBotClient.handleWebVote(
    reportId,
    userId,
    isUp
  );
  res.json({ success });
});

router.post("/", async (req, res) => {
  const { elementName, bugType, description, isSpoiler } = req.body;
  const reportId = `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  try {
    if (!global.discordBotClient) {
      throw new Error("Discord bot not ready yet. Please try again later.");
    }
    await global.discordBotClient.handleBugReport({
      reportId,
      elementName: elementName || "N/A",
      bugType: bugType || "Not specified",
      description: description || "None",
      isSpoiler: Boolean(isSpoiler)
    });
    res.json({ success: true, reportId });
  } catch (err) {
    console.error("Error reporting bug:", err);
    res.status(500).json({ error: "Error occurred while submitting report." });
  }
});

module.exports = router;
