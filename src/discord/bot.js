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
const community = require("../services/discord-community");
const playerCard = require("../services/player-card");
const { profileEmbed } = require("./profile-embed");
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
    .setName("setup-mail")
    .setDescription("Choose where the mailbox letters are posted, and which role they ping")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("kind")
        .setDescription("Kind of letter")
        .setRequired(true)
        .addChoices(
          { name: "Announcements", value: "announcement" },
          { name: "Patch notes", value: "patch-notes" },
          { name: "Polls", value: "poll" }
        )
    )
    .addChannelOption((opt) => opt.setName("channel").setDescription("Channel for this kind of letter").setRequired(true))
    .addRoleOption((opt) => opt.setName("role").setDescription("Role to ping (none if left empty)")),
  new SlashCommandBuilder()
    .setName("recap-preview")
    .setDescription("See the daily recap and the champion of the week now (only you see it)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Get a private message when you haven't climbed yet today")
    .addSubcommand((sub) =>
      sub
        .setName("on")
        .setDescription("Remind me every day I haven't played yet")
        .addIntegerOption((opt) => opt.setName("hour").setDescription("Hour, Paris time (0-23, default 20)").setMinValue(0).setMaxValue(23))
    )
    .addSubcommand((sub) => sub.setName("off").setDescription("Stop the reminders")),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show a climber's Celestedle file")
    .addUserOption((opt) => opt.setName("climber").setDescription("Whose file (default: yours)")),
  new SlashCommandBuilder()
    .setName("setup-chapter-roles")
    .setDescription("Create or find one role per chapter and give each climber the role of their chapter")
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

  // Boîte aux lettres : une annonce ou un sondage posté dans le salon réglé,
  // le rôle mentionné. Le sondage montre ses boutons tant qu'il est ouvert.
  function mailMessage(letter) {
    if (letter.kind !== "poll") return { embeds: [embeds.mailEmbed(letter, config.siteUrl)], components: [] };
    const poll = mail.pollView(letter, null, { all: true });
    // Les voix restent cachées tant que le sondage est ouvert
    const shown = poll.closed ? poll : { ...poll, options: poll.options.map((o) => ({ ...o, votes: null })) };
    return { embeds: [embeds.pollEmbed(letter, shown, config.siteUrl)], components: embeds.pollButtons(letter, shown) };
  }

  async function mailPosted(letter, { channelId, roleId }) {
    const channel = await client.channels.fetch(channelId);
    const message = await channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      ...mailMessage(letter),
      allowedMentions: { parse: [], roles: roleId ? [roleId] : [] }
    });
    return { channelId, messageId: message.id };
  }

  async function mailUpdated(letter) {
    const message = await fetchMessage(letter.discordChannelId, letter.discordMessageId);
    await message?.edit(mailMessage(letter));
  }

  async function mailDeleted(letter) {
    const message = await fetchMessage(letter.discordChannelId, letter.discordMessageId);
    await message?.delete();
  }

  // Un vote change le nombre de votants : une mise à jour toutes les 5 s au
  // plus par sondage (Discord limite les modifications de messages)
  const pendingPolls = new Map();
  async function pollVoted(letter) {
    if (pendingPolls.has(letter.id)) return;
    pendingPolls.set(
      letter.id,
      setTimeout(() => {
        pendingPolls.delete(letter.id);
        mailUpdated(mail.findLetter(letter.id) ?? letter).catch((err) => console.error("[DISCORD] Sondage :", err.message));
      }, 5000)
    );
  }

  async function pollClosed(letter) {
    clearTimeout(pendingPolls.get(letter.id));
    pendingPolls.delete(letter.id);
    await mailUpdated(letter);
  }

  // Bouton d'un sondage : le vote, puis ses choix et les résultats, pour lui seul
  async function handlePollVote(interaction, { mailId, position }) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    let result;
    try {
      result = mail.voteFromDiscord(mailId, interaction.user, position);
    } catch (err) {
      return reply(err.status ? err.message : "Something went wrong.");
    }
    const { poll } = result;
    const picked = poll.options.filter((o) => poll.myChoices.includes(o.position)).map((o) => `**${o.label}**`);
    const head = picked.length ? `Your vote: ${picked.join(", ")}.` : "Your vote was removed.";
    const tip = poll.multiple ? " Click an answer again to untick it." : "";
    return reply(`${head}${tip}\n\n${embeds.resultLines(poll)}\n\n${poll.voters} climber${poll.voters === 1 ? "" : "s"} voted so far.`);
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

  // Où va chaque sorte de lettre de la boîte aux lettres
  async function handleSetupMail(interaction) {
    const topic = interaction.options.getString("kind");
    const channel = interaction.options.getChannel("channel");
    const role = interaction.options.getRole("role");
    mail.setDiscordDestination(topic, channel.id, role?.id ?? null);
    const names = { announcement: "Announcements", "patch-notes": "Patch notes", poll: "Polls" };
    const all = mail.discordSettings();
    const lines = Object.entries(names).map(([key, name]) => {
      const d = all[key];
      if (!d.channelId) return `• ${name}: ${key === "announcement" ? "not set" : "same as announcements"}`;
      return `• ${name}: <#${d.channelId}>${d.roleId ? `, pings <@&${d.roleId}>` : ", no ping"}`;
    });
    await interaction.reply({
      content: `Saved. Letters sent from the admin's Mailbox page go to:\n${lines.join("\n")}`,
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

  // ===== Rappel de série =====
  async function handleReminder(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (interaction.options.getSubcommand() === "off") {
      return reply(community.removeReminder(interaction.user) ? "Reminders are off. See you on the mountain!" : "You had no reminder.");
    }
    const hour = interaction.options.getInteger("hour") ?? community.DEFAULT_HOUR;
    try {
      community.setReminder(interaction.user, hour);
    } catch (err) {
      return reply(err.message);
    }
    return reply(
      `Got it! Every day at **${String(hour).padStart(2, "0")}:00** (Paris time), if you haven't climbed yet, I'll send you a private message. ` +
        "Make sure I can message you (Privacy settings of this server). /reminder off to stop."
    );
  }

  // Rappels de l'heure : un message privé à ceux qui n'ont pas encore joué.
  // Traité même sans message (déjà joué) : un seul passage par jour.
  async function sendReminders() {
    for (const { userId } of community.dueReminders()) {
      community.markReminderSent(userId);
      try {
        const user = await client.users.fetch(userId);
        const reminder = community.reminderFor(user);
        if (reminder) await user.send({ content: community.reminderText(reminder, config.siteUrl), allowedMentions: { parse: [] } });
      } catch (err) {
        console.error(`[DISCORD] Rappel ${userId} :`, err.message);
      }
    }
  }

  // ===== /profile =====
  async function handleProfile(interaction) {
    const target = interaction.options.getUser("climber") ?? interaction.user;
    const self = target.id === interaction.user.id;
    const cards = community.publicProfiles(target).map(playerCard.publicCard).filter(Boolean).slice(0, 3);
    if (!cards.length) {
      return interaction.reply({
        content: self
          ? "No public Celestedle file is linked to your Discord. Add your Discord username in your profile (Profile → Discord username), and make sure it isn't hidden from the rankings."
          : `${target.username} has no public Celestedle file linked to their Discord.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
    }
    await interaction.reply({ embeds: cards.map((card) => profileEmbed(card, config.siteUrl)), allowedMentions: { parse: [] } });
    // En passant : son rôle de chapitre à jour
    if (self && interaction.guild) syncMember(interaction.guild, interaction.user, community.chapterOf(interaction.user)).catch(() => {});
  }

  // ===== Rôles de chapitre =====
  async function handleSetupChapterRoles(interaction) {
    const { guild } = interaction;
    if (!guild) return interaction.reply({ content: "Run this in a server.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roles = [];
    try {
      await guild.roles.fetch();
      for (const chapter of community.CHAPTERS) {
        const existing = guild.roles.cache.find((r) => r.name.toLowerCase() === chapter.name.toLowerCase());
        const role =
          existing ??
          (await guild.roles.create({ name: chapter.name, colors: chapter.color ? { primaryColor: chapter.color } : undefined, reason: "Celestedle chapter roles" }));
        roles.push(role.id);
      }
    } catch (err) {
      return interaction.editReply(
        `I couldn't create the roles (${err.message}). Give me the "Manage Roles" permission, and put my role above the chapter roles.`
      );
    }
    community.setChapterRoles(guild.id, roles);
    await interaction.editReply({
      content:
        `Chapter roles: ${roles.map((id) => `<@&${id}>`).join(" ")}\n` +
        "Climbers with their Discord username in their profile get the role of their current chapter (checked every hour). " +
        "My role must stay above these roles.",
      allowedMentions: { parse: [] }
    });
    syncChapterRoles().catch((err) => console.error("[DISCORD] Rôles de chapitre :", err.message));
  }

  // Le rôle du chapitre atteint, et aucun autre rôle de chapitre (aucun
  // du tout pour un joueur caché des classements : chapter = NO_ROLE)
  async function syncMember(guild, user, chapter, member = null) {
    const setup = community.chapterRoles();
    if (!setup || setup.guildId !== guild.id || chapter === null) return;
    member ??= await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const target = chapter === community.NO_ROLE ? null : setup.roles[chapter];
    const extra = setup.roles.filter((id, i) => i !== chapter && member.roles.cache.has(id));
    if (extra.length) await member.roles.remove(extra, "Celestedle chapter");
    if (target && !member.roles.cache.has(target)) await member.roles.add(target, "Celestedle chapter");
  }

  // Tous les joueurs liés : membre du serveur trouvé par son nom d'utilisateur
  async function syncChapterRoles() {
    const setup = community.chapterRoles();
    if (!setup) return;
    const guild = await client.guilds.fetch(setup.guildId);
    for (const [username, chapter] of community.chaptersByUsername()) {
      try {
        const found = await guild.members.search({ query: username, limit: 10 });
        const member = found.find((m) => m.user.username.toLowerCase() === username);
        if (member) await syncMember(guild, member.user, chapter, member);
      } catch (err) {
        console.error(`[DISCORD] Rôle de chapitre ${username} :`, err.message);
      }
    }
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
    // Sondages arrivés à leur date de fin : résultats finaux sur Discord
    const closeDue = () => mail.closeDuePolls().catch((err) => console.error("[DISCORD] Sondages :", err.message));
    closeDue();
    setInterval(closeDue, 5 * 60 * 1000).unref();
    // Rappels de série : on regarde toutes les 5 minutes si une heure est venue
    const remind = () => sendReminders().catch((err) => console.error("[DISCORD] Rappels :", err.message));
    remind();
    setInterval(remind, 5 * 60 * 1000).unref();
    // Rôles de chapitre : une fois par heure
    const roles = () => syncChapterRoles().catch((err) => console.error("[DISCORD] Rôles de chapitre :", err.message));
    roles();
    setInterval(roles, 60 * 60 * 1000).unref();
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-reports") {
        return await handleSetup(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-daily") {
        return await handleSetupDaily(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-mail") {
        return await handleSetupMail(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "recap-preview") {
        return await handleRecapPreview(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "reminder") {
        return await handleReminder(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "profile") {
        return await handleProfile(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "setup-chapter-roles") {
        return await handleSetupChapterRoles(interaction);
      }
      if (interaction.isChatInputCommand() && interaction.commandName === "passcode") {
        return await handlePasscode(interaction);
      }
      if (!interaction.isButton()) return;
      const pollVote = embeds.parsePollId(interaction.customId);
      if (pollVote) return await handlePollVote(interaction, pollVote);
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

  return { client, reportCreated, reportUpdated, reportDeleted, mailPosted, mailUpdated, mailDeleted, pollVoted, pollClosed };
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
  mail.setNotifier({
    mailPosted: bot.mailPosted,
    mailUpdated: bot.mailUpdated,
    mailDeleted: bot.mailDeleted,
    pollVoted: bot.pollVoted,
    pollClosed: bot.pollClosed
  });
  bot.client.login(config.discord.token).catch((err) => {
    console.error("[DISCORD] Connexion impossible :", err.message);
  });
  return bot;
}

module.exports = { startBot };
