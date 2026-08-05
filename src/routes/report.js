const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const { elementName, bugType, description, isSpoiler } = req.body;

  const reportId = `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const formattedElement =
    isSpoiler && elementName ? `||${elementName}||` : elementName || "N/A";
  const formattedDescription =
    isSpoiler && description ? `||${description}||` : description || "Aucune";

  try {
    if (!global.discordBotClient) {
      throw new Error("Le bot Discord n'est pas encore prêt.");
    }

    // Le bot crée les deux messages
    await global.discordBotClient.handleBugReport({
      reportId,
      elementName: formattedElement,
      bugType,
      description: formattedDescription,
      isSpoiler,
    });

    res.json({ success: true, reportId });
  } catch (err) {
    console.error("Error reporting bug :", err);
    res.status(500).json({ error: "Error while reporting" });
  }
});

module.exports = router;
