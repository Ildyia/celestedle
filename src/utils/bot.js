const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const PUBLIC_CHANNEL_ID = "1534624008614576209";

// Stockage en mémoire pour associer les bugs aux messages publics et votes
const reportsMap = new Map();

client.on("ready", () => {
  console.log(`Bot Discord connecté en tant que ${client.user.tag}`);
});

// Méthode appelée par la route /report-bug pour publier dans le salon public
client.createPublicReport = async ({
  reportId,
  elementName,
  bugType,
  description,
  isSpoiler,
  privateMessageId,
}) => {
  try {
    const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID);
    if (!publicChannel) return;

    const isSpoiler = isSpoiler
      ? "⚠️ This report contains spoilers for today's secret word!"
      : "";

    const publicMsg = await publicChannel.send({
      embeds: [
        {
          title: `Bug Report [${reportId}]`,
          fields: [
            { name: "Element", value: elementName || "N/A", inline: true },
            { name: "Type", value: bugType || "Non spécifié", inline: true },
            { name: "Status", value: "🔴 Nouveau", inline: true },
            { name: "Votes", value: "0", inline: true },
            { name: "Description", value: description || "Aucune" },
          ],
          color: 15158332,
          timestamp: new Date().toISOString(),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 2,
              emoji: "👍",
              custom_id: `vote_up_${reportId}`,
            },
            {
              type: 2,
              style: 2,
              emoji: "👎",
              custom_id: `vote_down_${reportId}`,
            },
          ],
        },
      ],
    });

    reportsMap.set(reportId, {
      publicMessageId: publicMsg.id,
      privateMessageId: privateMessageId,
      votes: new Map(),
    });
  } catch (err) {
    console.error("Erreur lors de la création du message public :", err);
  }
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  // --- 1. Gestion des votes (+1 / -1) dans le salon public ---
  if (customId.startsWith("vote_")) {
    const isUp = customId.startsWith("vote_up_");
    const reportId = customId.replace(isUp ? "vote_up_" : "vote_down_", "");
    const reportData = reportsMap.get(reportId);

    if (!reportData) {
      return interaction.reply({
        content: "Impossible de voter sur ce rapport (session expirée).",
        ephemeral: true,
      });
    }

    const userId = interaction.user.id;
    const currentVote = reportData.votes.get(userId);

    if ((isUp && currentVote === 1) || (!isUp && currentVote === -1)) {
      reportData.votes.delete(userId);
    } else {
      reportData.votes.set(userId, isUp ? 1 : -1);
    }

    let totalScore = 0;
    reportData.votes.forEach((val) => (totalScore += val));

    const embed = interaction.message.embeds[0];
    const updatedEmbed = {
      ...embed.data,
      fields: embed.fields.map((f) =>
        f.name === "Votes"
          ? { name: "Votes", value: `${totalScore}`, inline: true }
          : f,
      ),
    };

    await interaction.update({ embeds: [updatedEmbed] });
  }

  // --- 2. Gestion du statut dans le salon privé ---
  if (customId.startsWith("status_")) {
    let newStatus = "";
    let newColor = 0xef4444;

    if (customId.includes("_fixed_")) {
      newStatus = "🟢 Fixed";
      newColor = 0x10b981;
    } else if (customId.includes("_working_")) {
      newStatus = "🟡 Working on it";
      newColor = 0xf59e0b;
    } else if (customId.includes("_cant_")) {
      newStatus = "⚪ Can't reproduce";
      newColor = 0x64748b;
    } else if (customId.includes("_wrong_")) {
      newStatus = "🔴 Wrong report";
      newColor = 0xef4444;
    }

    const reportId = customId.split("_").pop();

    // Mise à jour du message privé
    const privateEmbed = interaction.message.embeds[0];
    const updatedPrivateEmbed = {
      ...privateEmbed.data,
      color: newColor,
      fields: privateEmbed.fields.map((f) =>
        f.name === "Statut"
          ? {
              name: "Statut",
              value: `${newStatus} (par ${interaction.user.username})`,
              inline: false,
            }
          : f,
      ),
    };
    await interaction.update({ embeds: [updatedPrivateEmbed] });

    // Mise à jour du message public correspondant
    const reportData = reportsMap.get(reportId);
    if (reportData) {
      try {
        const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID);
        const publicMsg = await publicChannel.messages.fetch(
          reportData.publicMessageId,
        );
        const publicEmbed = publicMsg.embeds[0];

        const updatedPublicEmbed = {
          ...publicEmbed.data,
          color: newColor,
          fields: publicEmbed.fields.map((f) =>
            f.name === "Statut"
              ? { name: "Statut", value: newStatus, inline: true }
              : f,
          ),
        };

        await publicMsg.edit({ embeds: [updatedPublicEmbed] });
      } catch (err) {
        console.error("Erreur de mise à jour du message public :", err);
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);

global.discordBotClient = client;
