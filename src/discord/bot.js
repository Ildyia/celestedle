const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");
const config = require("../config");
const settingsRepo = require("../repositories/settings");
const reports = require("../services/reports");
const embeds = require("./embeds");

const PUBLIC_CHANNEL_KEY = "discord_public_channel_id";
const PRIVATE_CHANNEL_KEY = "discord_private_channel_id";

const commands = [
  new SlashCommandBuilder()
    .setName("setup-reports")
    .setDescription("Configure channels for bug reports")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt.setName("public").setDescription("Public channel for community votes").setRequired(true)
    )
    .addChannelOption((opt) =>
      opt.setName("private").setDescription("Private channel for management").setRequired(true)
    )
].map((cmd) => cmd.toJSON());

function channelIds() {
  return {
    publicId: settingsRepo.get(PUBLIC_CHANNEL_KEY, config.discord.publicChannelId),
    privateId: settingsRepo.get(PRIVATE_CHANNEL_KEY, config.discord.privateChannelId)
  };
}

function createBot() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  async function fetchMessage(channelId, messageId) {
    if (!messageId) return null;
    const channel = await client.channels.fetch(channelId);
    return channel.messages.fetch(messageId).catch(() => null);
  }

  // Nouveau report : message public (votes) + message privé (gestion)
  async function reportCreated(report) {
    const { publicId, privateId } = channelIds();
    const publicChannel = await client.channels.fetch(publicId);
    const privateChannel = await client.channels.fetch(privateId);

    const publicMsg = await publicChannel.send({
      embeds: [embeds.publicEmbed(report)],
      components: embeds.voteButtons(report.id)
    });
    const privateMsg = await privateChannel.send({
      embeds: [embeds.privateEmbed(report)],
      components: embeds.statusButtons(report.id)
    });
    reports.setDiscordIds(report.id, publicMsg.id, privateMsg.id);
  }

  // Vote ou statut changé : on met à jour les messages, sauf celui sur lequel
  // l'action a été faite (déjà mis à jour par l'interaction)
  async function reportUpdated(report, origin) {
    const { publicId, privateId } = channelIds();
    if (origin !== "discord-public") {
      const publicMsg = await fetchMessage(publicId, report.discordPublicId);
      await publicMsg?.edit({ embeds: [embeds.publicEmbed(report)] });
    }
    if (origin !== "discord-private") {
      const privateMsg = await fetchMessage(privateId, report.discordPrivateId);
      await privateMsg?.edit({ embeds: [embeds.privateEmbed(report)] });
    }
  }

  // Report supprimé depuis l'admin : ses messages disparaissent aussi
  async function reportDeleted(report) {
    const { publicId, privateId } = channelIds();
    const publicMsg = await fetchMessage(publicId, report.discordPublicId);
    await publicMsg?.delete();
    const privateMsg = await fetchMessage(privateId, report.discordPrivateId);
    await privateMsg?.delete();
  }

  async function handleSetup(interaction) {
    settingsRepo.set(PUBLIC_CHANNEL_KEY, interaction.options.getChannel("public").id);
    settingsRepo.set(PRIVATE_CHANNEL_KEY, interaction.options.getChannel("private").id);
    await interaction.reply({ content: "Configured!", flags: MessageFlags.Ephemeral });
  }

  async function handleVote(interaction, { reportId, isUp }) {
    if (!reports.findById(reportId)) {
      return interaction.reply({ content: "This report no longer exists.", flags: MessageFlags.Ephemeral });
    }
    const report = reports.vote(reportId, `discord:${interaction.user.id}`, isUp, "discord-public");
    await interaction.update({
      embeds: [embeds.publicEmbed(report)],
      components: embeds.voteButtons(report.id, report.userVote)
    });
  }

  async function handleStatus(interaction, { reportId, status }) {
    if (!reports.findById(reportId)) {
      return interaction.reply({ content: "This report no longer exists.", flags: MessageFlags.Ephemeral });
    }
    const report = reports.setStatus(reportId, status, "discord-private");
    await interaction.update({ embeds: [embeds.privateEmbed(report, interaction.user.username)] });
  }

  client.once("clientReady", async () => {
    console.log(`[DISCORD] Connecté en tant que ${client.user.tag}`);
    try {
      const rest = new REST({ version: "10" }).setToken(config.discord.token);
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
      console.error("[DISCORD] Enregistrement des commandes impossible :", err.message);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-reports") {
        return await handleSetup(interaction);
      }
      if (!interaction.isButton()) return;
      const action = embeds.parseCustomId(interaction.customId);
      if (action?.kind === "vote") return await handleVote(interaction, action);
      if (action?.kind === "status" && action.status) return await handleStatus(interaction, action);
    } catch (err) {
      console.error("[DISCORD] Interaction en erreur :", err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }
  });

  client.on("error", (err) => console.error("[DISCORD] Erreur client :", err.message));

  return { client, reportCreated, reportUpdated, reportDeleted };
}

// Démarre le bot si un token est configuré, et le branche sur les reports
function startBot() {
  if (!config.discord.token) {
    console.log("[DISCORD] Pas de DISCORD_BOT_TOKEN : bot désactivé");
    return null;
  }
  const bot = createBot();
  reports.setNotifier({
    reportCreated: bot.reportCreated,
    reportUpdated: bot.reportUpdated,
    reportDeleted: bot.reportDeleted
  });
  bot.client.login(config.discord.token).catch((err) => {
    console.error("[DISCORD] Connexion impossible :", err.message);
  });
  return bot;
}

module.exports = { startBot };
