const express = require("express");
const router = express.Router();

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
      isSpoiler: Boolean(isSpoiler),
    });

    res.json({ success: true, reportId });
  } catch (err) {
    console.error("Error reporting bug:", err);
    res.status(500).json({ error: "Error occurred while submitting report." });
  }
});

module.exports = router;
