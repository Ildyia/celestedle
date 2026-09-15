const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
global.discordBotClient = client;

let publicChannelId =
  process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209";
let privateChannelId =
  process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498";

const reportsFile = path.join(__dirname, "..", "reports.json");
function loadReports() {
  if (!fs.existsSync(reportsFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(reportsFile, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveReports(data) {
  fs.writeFileSync(reportsFile, JSON.stringify(data, null, 2));
}

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
  try {
    const rest = new REST({ version: "10" }).setToken(
      process.env.DISCORD_BOT_TOKEN
    );
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands
    });
  } catch (err) {}
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
  if (!privateChannel || !publicChannel)
    throw new Error("Discord channels not found.");

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
          { type: 2, style: 2, emoji: "👎", custom_id: `vote_down_${reportId}` }
        ]
      }
    ]
  });

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

  const reports = loadReports();
  reports[reportId] = {
    publicMessageId: publicMsg.id,
    privateMessageId: privateMsg.id,
    votes: {},
    elementName,
    bugType,
    description,
    status: "🔴 New"
  };
  saveReports(reports);
};

client.handleWebVote = async (reportId, userId, isUp) => {
  const reports = loadReports();
  let reportData = reports[reportId];
  if (!reportData) return false;

  const currentVote = reportData.votes[userId];
  if ((isUp && currentVote === 1) || (!isUp && currentVote === -1)) {
    delete reportData.votes[userId];
  } else {
    reportData.votes[userId] = isUp ? 1 : -1;
  }
  saveReports(reports);

  let totalScore = 0;
  Object.values(reportData.votes).forEach((val) => (totalScore += val));

  try {
    const publicChannel = await client.channels.fetch(publicChannelId);
    const msg = await publicChannel.messages.fetch(reportData.publicMessageId);
    const embed = msg.embeds[0];
    const updatedEmbed = {
      ...embed.data,
      fields: embed.fields.map((f) =>
        f.name === "Votes"
          ? { name: "Votes", value: `${totalScore}`, inline: true }
          : f
      )
    };
    await msg.edit({ embeds: [updatedEmbed] });
  } catch (err) {}

  return true;
};

client.on("interactionCreate", async (interaction) => {
  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "setup-reports"
  ) {
    publicChannelId = interaction.options.getChannel("public").id;
    privateChannelId = interaction.options.getChannel("private").id;
    return interaction.reply({ content: `Configured!`, ephemeral: true });
  }

  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  if (customId.startsWith("vote_")) {
    const isUp = customId.startsWith("vote_up_");
    const reportId = customId.replace(isUp ? "vote_up_" : "vote_down_", "");

    const reports = loadReports();
    let reportData = reports[reportId];
    if (!reportData) {
      reportData = { votes: {} };
      reports[reportId] = reportData;
    }

    const userId = interaction.user.id;
    const currentVote = reportData.votes[userId];
    if ((isUp && currentVote === 1) || (!isUp && currentVote === -1)) {
      delete reportData.votes[userId];
    } else {
      reportData.votes[userId] = isUp ? 1 : -1;
    }
    saveReports(reports);

    let totalScore = 0;
    Object.values(reportData.votes).forEach((val) => (totalScore += val));

    const newVoteState = reportData.votes[userId];
    const upStyle = newVoteState === 1 ? 1 : 2;
    const downStyle = newVoteState === -1 ? 1 : 2;

    const embed = interaction.message.embeds[0];
    const updatedEmbed = {
      ...embed.data,
      fields: embed.fields.map((f) =>
        f.name === "Votes"
          ? { name: "Votes", value: `${totalScore}`, inline: true }
          : f
      )
    };

    await interaction.update({
      embeds: [updatedEmbed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: upStyle,
              emoji: "👍",
              custom_id: `vote_up_${reportId}`
            },
            {
              type: 2,
              style: downStyle,
              emoji: "👎",
              custom_id: `vote_down_${reportId}`
            }
          ]
        }
      ]
    });
  }

  if (customId.startsWith("status_")) {
    let newStatus = "";
    let newColor = 0xef4444;
    let isFixed = false;

    if (customId.includes("_fixed_")) {
      newStatus = "🟢 Fixed";
      newColor = 0x10b981;
      isFixed = true;
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

    const reports = loadReports();
    if (isFixed) {
      delete reports[reportId];
    } else if (reports[reportId]) {
      reports[reportId].status = newStatus;
    }
    saveReports(reports);

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
      let publicMsg;
      if (publicMsgId && publicMsgId !== reportId) {
        try {
          publicMsg = await publicChannel.messages.fetch(publicMsgId);
        } catch (e) {}
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
      }
    } catch (err) {}
  }
});

if (process.env.DISCORD_BOT_TOKEN) {
  client.login(process.env.DISCORD_BOT_TOKEN);
}
