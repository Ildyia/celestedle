const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

global.discordBotClient = client;

let publicChannelId =
  process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209";
let privateChannelId =
  process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498";

const reportsMap = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName("setup-reports")
    .setDescription("Configure channels for bug reports")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("public")
        .setDescription("Public channel for community votes")
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("private")
        .setDescription("Private channel for management")
        .setRequired(true)
    )
].map((cmd) => cmd.toJSON());

client.on("ready", async () => {
  console.log(`Discord Bot connected: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_BOT_TOKEN
    );
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands
    });
    console.log("Slash commands successfully registered.");
  } catch (err) {
    console.error("Error registering slash commands:", err);
  }
});

client.handleBugReport = async ({
  reportId,
  elementName,
  bugType,
  description,
  isSpoiler
}) => {
  const privateChannel = await client.channels.fetch(privateChannelId);
  const publicChannel = await client.channels.fetch(publicChannelId);

  if (!privateChannel || !publicChannel) {
    throw new Error("Discord channels not found. Please check configuration.");
  }

  const cleanElement = elementName.trim();
  const cleanDescription = description.trim();

  const formattedElement = isSpoiler ? `||${cleanElement}||` : cleanElement;
  const formattedDescription = isSpoiler
    ? cleanDescription
        .split("\n")
        .map((line) => (line.trim() ? `||${line.trim()}||` : ""))
        .join("\n")
    : cleanDescription;

  const spoilerTag = isSpoiler ? " ⚠️ [TODAY'S WORD SPOILER]" : "";
  const embedColor = isSpoiler ? 0xf59e0b : 15158332;

  // Send public message first to get its ID
  const publicMsg = await publicChannel.send({
    embeds: [
      {
        title: `Bug Report [${reportId}]${spoilerTag}`,
        fields: [
          { name: "Element", value: formattedElement, inline: true },
          { name: "Category", value: bugType, inline: true },
          { name: "Status", value: "🔴 New", inline: true },
          { name: "Votes", value: "0", inline: true },
          { name: "Description", value: formattedDescription }
        ],
        color: embedColor,
        timestamp: new Date().toISOString()
      }
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
            custom_id: `vote_down_${reportId}`
          }
        ]
      }
    ]
  });

  // Attach publicMsg.id to custom_id so we can fetch it directly later
  const privateMsg = await privateChannel.send({
    embeds: [
      {
        title: `🛠️ Bug Management [${reportId}]${spoilerTag}`,
        fields: [
          { name: "ID", value: `\`${reportId}\``, inline: true },
          { name: "Element", value: formattedElement, inline: true },
          { name: "Category", value: bugType, inline: true },
          { name: "Status", value: "🔴 New", inline: false },
          { name: "Description", value: formattedDescription }
        ],
        color: embedColor,
        timestamp: new Date().toISOString()
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Fixed",
            custom_id: `status_fixed_${reportId}_${publicMsg.id}`
          },
          {
            type: 2,
            style: 1,
            label: "Working on it",
            custom_id: `status_working_${reportId}_${publicMsg.id}`
          },
          {
            type: 2,
            style: 2,
            label: "Can't reproduce",
            custom_id: `status_cant_${reportId}_${publicMsg.id}`
          },
          {
            type: 2,
            style: 4,
            label: "Wrong report",
            custom_id: `status_wrong_${reportId}_${publicMsg.id}`
          }
        ]
      }
    ]
  });

  reportsMap.set(reportId, {
    publicMessageId: publicMsg.id,
    privateMessageId: privateMsg.id,
    votes: new Map()
  });
};

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "setup-reports") {
      const pubChan = interaction.options.getChannel("public");
      const privChan = interaction.options.getChannel("private");

      publicChannelId = pubChan.id;
      privateChannelId = privChan.id;

      return interaction.reply({
        content: `Configuration successfully updated!\n- **Public Channel**: <#${publicChannelId}>\n- **Private Channel**: <#${privateChannelId}>`,
        ephemeral: true
      });
    }
  }

  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  if (customId.startsWith("vote_")) {
    const isUp = customId.startsWith("vote_up_");
    const reportId = customId.replace(isUp ? "vote_up_" : "vote_down_", "");
    let reportData = reportsMap.get(reportId);

    if (!reportData) {
      reportData = { votes: new Map() };
      reportsMap.set(reportId, reportData);
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
          : f
      )
    };

    await interaction.update({ embeds: [updatedEmbed] });
  }

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

    const parts = customId.split("_");
    const publicMsgId = parts.pop();
    const reportId = parts.pop();

    const privateEmbed = interaction.message.embeds[0];
    const updatedPrivateEmbed = {
      ...privateEmbed.data,
      color: newColor,
      fields: privateEmbed.fields.map((f) =>
        f.name === "Status"
          ? {
              name: "Status",
              value: `${newStatus} (by ${interaction.user.username})`,
              inline: false
            }
          : f
      )
    };
    await interaction.update({ embeds: [updatedPrivateEmbed] });

    try {
      const publicChannel = await client.channels.fetch(publicChannelId);

      // Fetch public message directly by its ID
      let publicMsg;
      if (publicMsgId && publicMsgId !== reportId) {
        try {
          publicMsg = await publicChannel.messages.fetch(publicMsgId);
        } catch (e) {
          // Fallback search if fetching directly fails
        }
      }

      if (!publicMsg) {
        const fetchedMessages = await publicChannel.messages.fetch({
          limit: 100
        });
        publicMsg = fetchedMessages.find((msg) =>
          msg.embeds.some((e) => e.title && e.title.includes(`[${reportId}]`))
        );
      }

      if (publicMsg) {
        const publicEmbed = publicMsg.embeds[0];
        const updatedPublicEmbed = {
          ...publicEmbed.data,
          color: newColor,
          fields: publicEmbed.fields.map((f) =>
            f.name === "Status"
              ? { name: "Status", value: newStatus, inline: true }
              : f
          )
        };

        await publicMsg.edit({ embeds: [updatedPublicEmbed] });
      } else {
        console.error(`Public message for report ${reportId} not found.`);
      }
    } catch (err) {
      console.error("Public sync error:", err);
    }
  }
});
if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN);
} else {
  console.warn("No TOKEN for discord bot");
}
