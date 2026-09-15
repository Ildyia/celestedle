const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const reportsFile = path.join(__dirname, "..", "reports.json");

function loadReports() {
  if (!fs.existsSync(reportsFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  } catch (e) {
    return {};
  }
}

router.get("/list", (req, res) => {
  const reports = loadReports();
  const list = Object.entries(reports).map(([id, data]) => {
    let total = 0;
    if (data.votes) {
      Object.values(data.votes).forEach((v) => (total += v));
    }
    return {
      id,
      score: total,
      elementName: data.elementName || "N/A",
      bugType: data.bugType || "N/A",
      description: data.description || "N/A"
    };
  });
  res.json(list);
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
      throw new Error("Discord bot not ready.");
    }
    await global.discordBotClient.handleBugReport({
      reportId,
      elementName: elementName || "N/A",
      bugType: bugType || "Not specified",
      description: description || "None",
      isSpoiler: Boolean(isSpoiler)
    });

    const reports = loadReports();
    reports[reportId] = {
      votes: {},
      elementName: elementName || "N/A",
      bugType: bugType || "Not specified",
      description: description || "None"
    };
    fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));

    res.json({ success: true, reportId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error occurred" });
  }
});

module.exports = router;
