const express = require("express");
const router = express.Router();
router.post("/", async (req, res) => {
  const { elementName, bugType, description, isSpoiler } = req.body;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(500).json({ error: "Webhook Discord non configuré." });
  }

  const reportId = `BUG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // Formate les champs en spoiler si l'option est cochée
  const formattedElement =
    isSpoiler && elementName ? `||${elementName}||` : elementName || "N/A";
  const formattedDescription =
    isSpoiler && description ? `||${description}||` : description || "Aucune";
  const spoilerTag = isSpoiler ? " ⚠️ [SPOILER]" : "";

  try {
    const privateResponse = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: `🛠️ Gestion Bug [${reportId}]${spoilerTag}`,
            fields: [
              { name: "ID", value: `\`${reportId}\``, inline: true },
              { name: "Mot / Élément", value: formattedElement, inline: true },
              { name: "Type", value: bugType || "Non spécifié", inline: true },
              { name: "Statut", value: "🔴 Nouveau", inline: false },
              { name: "Description", value: formattedDescription },
            ],
            color: isSpoiler ? 0xf59e0b : 15158332,
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "Fixed",
                custom_id: `status_fixed_${reportId}`,
              },
              {
                type: 2,
                style: 1,
                label: "Working on it",
                custom_id: `status_working_${reportId}`,
              },
              {
                type: 2,
                style: 2,
                label: "Can't reproduce",
                custom_id: `status_cant_${reportId}`,
              },
              {
                type: 2,
                style: 4,
                label: "Wrong report",
                custom_id: `status_wrong_${reportId}`,
              },
            ],
          },
        ],
      }),
    });

    const privateData = await privateResponse.json();

    if (global.discordBotClient) {
      await global.discordBotClient.createPublicReport({
        reportId,
        elementName: formattedElement,
        bugType,
        description: formattedDescription,
        isSpoiler,
        privateMessageId: privateData.id,
      });
    }

    res.json({ success: true, reportId });
  } catch (err) {
    console.error("Erreur Report Bug:", err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});
