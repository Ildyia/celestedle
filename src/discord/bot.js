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
const players = require("../services/players");
const embeds = require("./embeds");
const recapPoster = require("./recap-poster");
const mail = require("../services/mail");
const { todayParis } = require("../utils/dates");

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
    ),
  new SlashCommandBuilder()
    .setName("setup-daily")
    .setDescription("Choose the channel for the midnight recap and the champion of the week")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel for the daily recap").setRequired(true))
    .addRoleOption((opt) => opt.setName("role").setDescription("Role pinged at midnight (default: the word reset role)"))
    .addBooleanOption((opt) => opt.setName("no-ping").setDescription("Ping nobody")),
  new SlashCommandBuilder()
    .setName("recap-preview")
    .setDescription("See the daily recap and the champion of the week now (only you see it)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("passcode")
    .setDescription("Get a new Celestedle recovery code for the profile linked to your Discord")
].map((cmd) => cmd.toJSON());

// /passcode : une demande toutes les 10 minutes par utilisateur Discord
const PASSCODE_COOLDOWN_MS = 10 * 60 * 1000;
const lastPasscode = new Map();

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

  // Discord garantit l'identité de l'utilisateur qui lance la commande : on
  // cherche les profils dont le tag Discord est le sien et on lui envoie en
  // message privé un nouveau code pour chacun
  async function handlePasscode(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    const { user } = interaction;

    const last = lastPasscode.get(user.id) ?? 0;
    if (Date.now() - last < PASSCODE_COOLDOWN_MS) {
      return reply("You already asked for a code recently. Try again in a few minutes.");
    }
    const matches = players.findByDiscordUser({ username: user.username, discriminator: user.discriminator });
    if (matches.length === 0) {
      return reply(
        `No Celestedle profile has the Discord username "${user.username}". ` +
          "Add it in your profile (Profile → Discord username) while you still have access to it."
      );
    }
    lastPasscode.set(user.id, Date.now());

    const lines = matches.map((profile) => `• **${profile.name}** : \`${players.resetToken(profile.id)}\``);
    const message =
      "Here is a new Celestedle recovery code. On the game, open Profile → Recovery code → " +
      "paste it in \"Use this code\". Your previous code no longer works.\n\n" +
      lines.join("\n") +
      "\n\nKeep it private: anyone with this code can use your profile.";

    try {
      await user.send(message);
      await reply("I sent you a new recovery code in a private message.");
    } catch {
      // Messages privés fermés : la réponse éphémère n'est visible que par lui
      await reply(message);
    }
  }

  async function handleSetup(interaction) {
    settingsRepo.set(PUBLIC_CHANNEL_KEY, interaction.options.getChannel("public").id);
    settingsRepo.set(PRIVATE_CHANNEL_KEY, interaction.options.getChannel("private").id);
    await interaction.reply({ content: "Configured!", flags: MessageFlags.Ephemeral });
  }

  // Boîte aux lettres : une annonce postée dans le salon réglé, le rôle mentionné
  async function mailPosted(letter, { channelId, roleId }) {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [embeds.mailEmbed(letter, config.siteUrl)],
      allowedMentions: { parse: [], roles: roleId ? [roleId] : [] }
    });
    return { channelId, messageId: message.id };
  }

  async function mailUpdated(letter) {
    const message = await fetchMessage(letter.discordChannelId, letter.discordMessageId);
    await message?.edit({ embeds: [embeds.mailEmbed(letter, config.siteUrl)] });
  }

  async function mailDeleted(letter) {
    const message = await fetchMessage(letter.discordChannelId, letter.discordMessageId);
    await message?.delete();
  }

  // Récap de minuit : seul le rôle choisi est mentionné, jamais un joueur
  async function sendRecap(channelId, recapEmbeds, roleId) {
    const channel = await client.channels.fetch(channelId);
    await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: recapEmbeds,
      allowedMentions: { parse: [], roles: roleId ? [roleId] : [] }
    });
  }
  const poster = recapPoster.createRecapPoster({ send: sendRecap });

  async function handleSetupDaily(interaction) {
    const channel = interaction.options.getChannel("channel");
    const role = interaction.options.getRole("role");
    recapPoster.setChannelId(channel.id);
    if (interaction.options.getBoolean("no-ping")) recapPoster.setRoleId(null);
    else if (role) recapPoster.setRoleId(role.id);
    const pinged = recapPoster.roleId();
    await interaction.reply({
      content:
        `The recap will be posted in <#${channel.id}> every night just after midnight (Paris time), ` +
        `${pinged ? `pinging <@&${pinged}>` : "without pinging anyone"}. Try /recap-preview to see it now.`,
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral
    });
  }

  async function handleRecapPreview(interaction) {
    const pinged = recapPoster.roleId();
    await interaction.reply({
      content: pinged ? `At midnight, this pings <@&${pinged}>.` : "At midnight, this pings nobody.",
      embeds: recapPoster.previewEmbeds(todayParis()),
      allowedMentions: { parse: [] },
      flags: MessageFlags.Ephemeral
    });
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
    poster.start();
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-reports") {
        return await handleSetup(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-daily") {
        return await handleSetupDaily(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "recap-preview") {
        return await handleRecapPreview(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "passcode") {
        return await handlePasscode(interaction);
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

  return { client, reportCreated, reportUpdated, reportDeleted, mailPosted, mailUpdated, mailDeleted };
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
  mail.setNotifier({ mailPosted: bot.mailPosted, mailUpdated: bot.mailUpdated, mailDeleted: bot.mailDeleted });
  bot.client.login(config.discord.token).catch((err) => {
    console.error("[DISCORD] Connexion impossible :", err.message);
  });
  return bot;
}

module.exports = { startBot };
