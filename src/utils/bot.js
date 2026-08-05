const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

global.discordBotClient = client;

// IDs des salons par défaut (peuvent être surchargés par la commande)
let publicChannelId =
  process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209";
let privateChannelId =
  process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498";

const reportsMap = new Map();

// --- 1. Déclaration de la commande Slash ---
const commands = [
  new SlashCommandBuilder()
    .setName("setup-reports")
    .setDescription("Configure les salons pour les rapports de bugs")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("public")
        .setDescription("Salon public pour les votes")
        .setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName("private")
        .setDescription("Salon privé pour la gestion")
        .setRequired(true),
    ),
].map((cmd) => cmd.toJSON());

client.on("ready", async () => {
  console.log(`Bot Discord connecté : ${client.user.tag}`);

  // Enregistrement global de la commande Slash
  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_BOT_TOKEN,
    );
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });
    console.log("Commandes Slash enregistrées avec succès.");
  } catch (err) {
    console.error("Erreur d'enregistrement des commandes Slash :", err);
  }
});

// --- 2. Fonction de traitement des rapports ---
client.handleBugReport = async ({
  reportId,
  elementName,
  bugType,
  description,
  isSpoiler,
}) => {
  const privateChannel = await client.channels.fetch(privateChannelId);
  const publicChannel = await client.channels.fetch(publicChannelId);

  if (!privateChannel || !publicChannel) {
    throw new Error("Salons Discord introuvables. Vérifiez la configuration.");
  }

  const spoilerTag = isSpoiler ? " ⚠️ [SPOILER]" : "";
  const embedColor = isSpoiler ? 0xf59e0b : 15158332;

  const privateMsg = await privateChannel.send({
    embeds: [
      {
        title: `🛠️ Gestion Bug [${reportId}]${spoilerTag}`,
        fields: [
          { name: "ID", value: `\`${reportId}\``, inline: true },
          { name: "Element", value: elementName, inline: true },
          { name: "Type", value: bugType || "Not specified", inline: true },
          { name: "Status", value: "🔴 New", inline: false },
          { name: "Description", value: description },
        ],
        color: embedColor,
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
  });

  const publicMsg = await publicChannel.send({
    embeds: [
      {
        title: `🐛 Bug Report [${reportId}]${spoilerTag}`,
        fields: [
          { name: "Element", value: elementName, inline: true },
          { name: "Type", value: bugType || "Not specified", inline: true },
          { name: "Status", value: "🔴 New", inline: true },
          { name: "Votes", value: "0", inline: true },
          { name: "Description", value: description },
        ],
        color: embedColor,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 2, emoji: "👍", custom_id: `vote_up_${reportId}` },
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
    privateMessageId: privateMsg.id,
    votes: new Map(),
  });
};

// --- 3. Gestion des interactions (Commande Slash + Boutons) ---
client.on("interactionCreate", async (interaction) => {
  // A. Commande Slash de configuration
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "setup-reports") {
      const pubChan = interaction.options.getChannel("public");
      const privChan = interaction.options.getChannel("private");

      publicChannelId = pubChan.id;
      privateChannelId = privChan.id;

      return interaction.reply({
        content: `Configuration mise à jour avec succès !\n- **Salon Public** : <#${publicChannelId}>\n- **Salon Privé** : <#${privateChannelId}>`,
        ephemeral: true,
      });
    }
  }

  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  // B. Votes (Salon Public)
  if (customId.startsWith("vote_")) {
    const isUp = customId.startsWith("vote_up_");
    const reportId = customId.replace(isUp ? "vote_up_" : "vote_down_", "");
    const reportData = reportsMap.get(reportId);

    if (!reportData) {
      return interaction.reply({
        content: "Session de vote expirée.",
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

  // C. Statut (Salon Privé)
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

    const privateEmbed = interaction.message.embeds[0];
    const updatedPrivateEmbed = {
      ...privateEmbed.data,
      color: newColor,
      fields: privateEmbed.fields.map((f) =>
        f.name === "Status"
          ? {
              name: "Status",
              value: `${newStatus} (par ${interaction.user.username})`,
              inline: false,
            }
          : f,
      ),
    };
    await interaction.update({ embeds: [updatedPrivateEmbed] });

    const reportData = reportsMap.get(reportId);
    if (reportData) {
      try {
        const publicChannel = await client.channels.fetch(publicChannelId);
        const publicMsg = await publicChannel.messages.fetch(
          reportData.publicMessageId,
        );
        const publicEmbed = publicMsg.embeds[0];

        const updatedPublicEmbed = {
          ...publicEmbed.data,
          color: newColor,
          fields: publicEmbed.fields.map((f) =>
            f.name === "Statut"
              ? { name: "Status", value: newStatus, inline: true }
              : f,
          ),
        };

        await publicMsg.edit({ embeds: [updatedPublicEmbed] });
      } catch (err) {
        console.error("Error updating public message:", err);
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
