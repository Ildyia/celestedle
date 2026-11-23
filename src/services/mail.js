// Boîte aux lettres : courrier écrit dans l'admin, lu dans le menu du jeu.
// Annonces (kind « news ») et sondages (« poll ») pour tous, relayés sur
// Discord dans le salon réglé (Settings de l'admin, ou
// DISCORD_MAIL_CHANNEL_ID), avec le rôle réglé mentionné.
// Sondages : une ou plusieurs cases ; les résultats ne se voient qu'après
// avoir voté (ou une fois fermé) ; un vote sur Discord d'un compte lié à un
// profil (tag Discord du profil) compte comme le vote de ce profil.
const config = require("../config");
const repo = require("../repositories/mail");
const settingsRepo = require("../repositories/settings");
const { HttpError } = require("../utils/http-error");
const players = require("./players");
const playersRepo = require("../repositories/players");
const reportsRepo = require("../repositories/reports");
const connectionsRepo = require("../repositories/connections");
const { nowIso } = require("../utils/dates");

const TITLE_MAX = 120;
const BODY_MAX = 4000;
// Salon et rôle Discord de chaque sorte de courrier, réglés avec la
// commande /setup-mail du bot (ou les variables d'environnement). Sans salon
// à elles, les notes de mise à jour et les sondages vont dans celui des annonces.
const DESTINATIONS = {
  announcement: { channel: "discord_mail_channel_id", role: "discord_mail_role_id", config: "mail" },
  "patch-notes": { channel: "discord_patch_channel_id", role: "discord_patch_role_id", config: "patch" },
  poll: { channel: "discord_poll_channel_id", role: "discord_poll_role_id", config: "poll" }
};
const TOPICS = ["announcement", "patch-notes"];
const SNOWFLAKE = /^\d{5,25}$/;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 10;
const OPTION_MAX = 80;
// Réponse libre « Other » : sa case est la position OTHER dans poll_votes
const OTHER = -1;
const TEXT_MAX = 300;

// Le bot Discord s'enregistre ici au démarrage ; sans bot, rien n'est envoyé.
// mailPosted renvoie { channelId, messageId } du message posté.
// pollVoted : un vote de plus (le message montre le nombre de votants) ;
// pollClosed : le message passe aux résultats finaux.
let notifier = {
  mailPosted: async () => null,
  mailUpdated: async () => {},
  mailDeleted: async () => {},
  pollVoted: async () => {},
  pollClosed: async () => {}
};

function setNotifier(next) {
  notifier = next;
}

// ===== Réglages Discord =====
/** { announcement: { channelId, roleId }, "patch-notes": …, poll: … } ("" : rien de réglé). */
function discordSettings() {
  return Object.fromEntries(
    Object.entries(DESTINATIONS).map(([topic, d]) => [
      topic,
      {
        channelId: settingsRepo.get(d.channel, config.discord[`${d.config}ChannelId`]) || "",
        roleId: settingsRepo.get(d.role, config.discord[`${d.config}RoleId`]) || ""
      }
    ])
  );
}

/** /setup-mail : salon (obligatoire) et rôle (null : personne) d'une sorte de courrier. */
function setDiscordDestination(topic, channelId, roleId = null) {
  const d = DESTINATIONS[topic];
  if (!d) throw new HttpError(400, `Unknown kind of letter "${topic}".`);
  for (const id of [channelId, roleId].filter(Boolean)) {
    if (!SNOWFLAKE.test(String(id))) throw new HttpError(400, "Discord IDs are numbers.");
  }
  if (!channelId) throw new HttpError(400, "A channel is needed.");
  settingsRepo.set(d.channel, String(channelId));
  settingsRepo.set(d.role, roleId ? String(roleId) : "");
  return discordSettings()[topic];
}

const topicOf = (mail) => (mail.kind === "poll" ? "poll" : mail.topic ?? "announcement");

/** Où poster une lettre sur Discord : { channelId, roleId }, ou null sans salon. */
function discordTarget(mail) {
  const all = discordSettings();
  const own = all[topicOf(mail)];
  const dest = own.channelId ? own : all.announcement;
  return dest.channelId ? { channelId: dest.channelId, roleId: dest.roleId || null } : null;
}

// ===== Courrier =====
function validate({ title, body } = {}) {
  const clean = { title: String(title ?? "").trim(), body: String(body ?? "").trim().replace(/\r\n/g, "\n") };
  if (!clean.title || clean.title.length > TITLE_MAX) throw new HttpError(400, `The title must be 1 to ${TITLE_MAX} characters.`);
  if (!clean.body || clean.body.length > BODY_MAX) throw new HttpError(400, `The letter must be 1 to ${BODY_MAX} characters.`);
  return clean;
}

const playerVoter = (player) => `player:${player.id}`;
const isClosed = (mail, now = nowIso()) => Boolean(mail.closesAt) && mail.closesAt <= now;

/**
 * Un sondage vu par `voter` (null : personne) : ses cases, ses choix, et les
 * voix quand il a voté, quand c'est fini, ou pour l'équipe (all).
 */
function pollView(mail, voter, { all = false } = {}) {
  const closed = isClosed(mail);
  const myChoices = voter ? repo.choicesOf(mail.id, voter) : [];
  const show = all || closed || myChoices.length > 0;
  const { counts, voters } = show ? repo.results(mail.id) : { counts: new Map(), voters: null };
  const options = repo.options(mail.id);
  if (mail.allowOther) options.push({ position: OTHER, label: "Other" });
  return {
    multiple: Boolean(mail.multiple),
    closesAt: mail.closesAt,
    closed,
    allowOther: Boolean(mail.allowOther),
    allowComments: Boolean(mail.allowComments),
    myChoices,
    // Ce que ce votant a écrit (lui seul le revoit ; l'équipe, sans son nom)
    myOther: voter && mail.allowOther ? repo.textOf(mail.id, voter, "other") : null,
    myComment: voter && mail.allowComments ? repo.textOf(mail.id, voter, "comment") : null,
    voters,
    options: options.map((o) => ({ position: o.position, label: o.label, votes: show ? counts.get(o.position) ?? 0 : null }))
  };
}

// Ce que voit le joueur
function toPublic(mail, player = null) {
  return {
    id: mail.id,
    kind: mail.kind,
    slug: mail.slug,
    title: mail.title,
    body: mail.body,
    createdAt: mail.createdAt,
    read: Boolean(mail.readAt),
    personal: Boolean(mail.playerId),
    topic: mail.topic ?? null,
    poll: mail.kind === "poll" ? pollView(mail, player ? playerVoter(player) : null) : null
  };
}

/** Courrier d'un joueur (ou de tous, sans profil), le plus récent d'abord. */
function inbox(player) {
  return repo.listFor(player?.id ?? null).map((mail) => toPublic(mail, player));
}

function markRead(player, id) {
  const mail = repo.find(Number(id));
  if (!mail || (mail.playerId && mail.playerId !== player.id)) throw new HttpError(404, "Letter not found.");
  repo.markRead(mail.id, player.id, nowIso());
  return { ok: true };
}

function validatePoll({ options, multiple, closesAt, allowOther, allowComments } = {}) {
  const labels = (Array.isArray(options) ? options : []).map((o) => String(o ?? "").trim()).filter(Boolean);
  if (labels.length < OPTIONS_MIN || labels.length > OPTIONS_MAX) throw new HttpError(400, `A poll needs ${OPTIONS_MIN} to ${OPTIONS_MAX} answers.`);
  if (labels.some((l) => l.length > OPTION_MAX)) throw new HttpError(400, `Each answer must be ${OPTION_MAX} characters at most.`);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) throw new HttpError(400, "Two answers are the same.");
  let end = null;
  if (closesAt) {
    const at = new Date(closesAt);
    if (Number.isNaN(at.getTime())) throw new HttpError(400, "The closing date isn't valid.");
    if (at <= new Date()) throw new HttpError(400, "The closing date must be in the future.");
    end = at.toISOString();
  }
  return { options: labels, multiple: Boolean(multiple), closesAt: end, allowOther: Boolean(allowOther), allowComments: Boolean(allowComments) };
}

// Une erreur Discord ne doit jamais faire échouer l'action de l'admin
async function relay(event, mail, ...args) {
  try {
    return await notifier[event](mail, ...args);
  } catch (err) {
    console.error(`[DISCORD] ${event} ${mail.id} :`, err.message);
    return null;
  }
}

/** Admin : le courrier pour tous, avec le nombre de lecteurs et les résultats des sondages. */
function listForAdmin() {
  return {
    letters: repo.listPublic().map((mail) =>
      mail.kind === "poll"
        ? { ...mail, poll: pollView(mail, null, { all: true }), texts: repo.texts(mail.id) }
        : { ...mail, poll: null, texts: [] }
    ),
    discord: discordSettings()
  };
}

/**
 * Admin : nouvelle annonce (topic « announcement » ou « patch-notes »), ou
 * sondage (kind « poll » : options, multiple, closesAt) ; discord = la poster
 * aussi sur Discord, dans le salon de sa sorte.
 */
async function send(author, input = {}) {
  const { title, body } = validate(input);
  const kind = input.kind === "poll" ? "poll" : "news";
  const topic = kind === "news" ? (TOPICS.includes(input.topic) ? input.topic : "announcement") : null;
  const poll = kind === "poll" ? validatePoll(input) : { options: [], multiple: false, closesAt: null };
  const mail = repo.insert(
    {
      kind,
      topic,
      title,
      body,
      playerId: null,
      authorId: author.id,
      multiple: poll.multiple,
      closesAt: poll.closesAt,
      allowOther: poll.allowOther,
      allowComments: poll.allowComments,
      at: nowIso()
    },
    poll.options
  );
  const target = discordTarget(mail);
  if (input.discord && target) {
    const posted = await relay("mailPosted", mail, target);
    if (posted) repo.setDiscord(mail.id, posted.channelId, posted.messageId);
  }
  return repo.find(mail.id);
}

/** Admin : corrige une lettre (et son message Discord). */
async function edit(id, input = {}) {
  const mail = repo.find(Number(id));
  if (!mail || mail.playerId) throw new HttpError(404, "Letter not found.");
  const { title, body } = validate(input);
  repo.update(mail.id, { title, body, at: nowIso() });
  const updated = repo.find(mail.id);
  if (updated.discordMessageId) await relay("mailUpdated", updated);
  return updated;
}

/** Admin : supprime une lettre (et son message Discord). */
async function remove(id) {
  const mail = repo.find(Number(id));
  if (!mail || mail.playerId) throw new HttpError(404, "Letter not found.");
  repo.remove(mail.id);
  if (mail.discordMessageId) await relay("mailDeleted", mail);
  return { ok: true };
}

// ===== Réponses personnelles =====
// Une lettre pour un seul joueur : réponse de l'équipe à son report de bug ou
// à sa suggestion de tag, ou la lettre automatique d'un report corrigé. Rien
// sur Discord : c'est privé.
function sendPersonal({ playerId, about, title, body, authorId = null }) {
  const clean = validate({ title, body });
  if (!playersRepo.findById(playerId)) throw new HttpError(409, "This player's profile no longer exists.");
  return repo.insert({ kind: "reply", about, ...clean, playerId, authorId, at: nowIso() });
}

const shorten = (text, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Admin : répondre à l'auteur d'un report. */
function replyToReport(author, reportId, input = {}) {
  const report = reportsRepo.findById(reportId);
  if (!report) throw new HttpError(404, "Report not found.");
  const playerId = reportsRepo.authorOf(reportId);
  if (!playerId) throw new HttpError(409, "This report was sent without a profile: there's no one to answer.");
  return sendPersonal({
    playerId,
    about: `report:${report.id}`,
    title: input.title || `About your bug report${report.elementName ? ` on ${report.elementName}` : ""}`,
    body: input.body,
    authorId: author.id
  });
}

/** Admin : répondre à l'auteur d'une suggestion de tag. */
function replyToSuggestion(author, suggestionId, input = {}) {
  const suggestion = connectionsRepo.findSuggestion(Number(suggestionId));
  if (!suggestion) throw new HttpError(404, "Unknown suggestion.");
  if (!suggestion.playerId) throw new HttpError(409, "This suggestion's profile no longer exists.");
  return sendPersonal({
    playerId: suggestion.playerId,
    about: `suggestion:${suggestion.id}`,
    title: input.title || `About your tag idea "${suggestion.label}"`,
    body: input.body,
    authorId: author.id
  });
}

/**
 * Report passé à « Fixed » : une lettre automatique à son auteur, une seule
 * fois par report (même s'il repasse par un autre statut).
 */
function reportFixed(report) {
  const playerId = reportsRepo.authorOf(report.id);
  const about = `report:${report.id}:fixed`;
  if (!playerId || repo.findAbout(about) || !playersRepo.findById(playerId)) return null;
  return repo.insert({
    kind: "reply",
    about,
    title: "Your bug report is fixed!",
    body:
      `Thanks for your report${report.elementName ? ` about **${report.elementName}**` : ""}: it's fixed now.\n\n` +
      `*What you told us:* ${shorten(report.description)}\n\n` +
      "Keep them coming, every report makes the mountain a little better. 🍓\n— The Celestedle team",
    playerId,
    authorId: null,
    at: nowIso()
  });
}

/**
 * Suggestion devenue un tag : une lettre automatique à son auteur, une seule
 * fois. tagLabel : le nom du tag créé (il peut différer de l'idée).
 */
function suggestionAdded(suggestionId, tagLabel) {
  const suggestion = connectionsRepo.findSuggestion(Number(suggestionId));
  const about = `suggestion:${suggestionId}:added`;
  if (!suggestion?.playerId || repo.findAbout(about) || !playersRepo.findById(suggestion.playerId)) return null;
  const renamed = tagLabel && tagLabel.trim().toLowerCase() !== suggestion.label.trim().toLowerCase();
  return repo.insert({
    kind: "reply",
    about,
    title: "Your tag idea is in the game!",
    body:
      `Thanks for suggesting **${suggestion.label}**! It's now a Connections tag${renamed ? ` (as **${tagLabel.trim()}**)` : ""}, ` +
      "so it can show up as a group in the daily grids.\n\n" +
      "Keep the ideas coming! 🧩\n— The Celestedle team",
    playerId: suggestion.playerId,
    authorId: null,
    at: nowIso()
  });
}

/** Admin : réponses déjà envoyées, par report ou par suggestion. */
const repliesTo = (kind) => Object.fromEntries(repo.repliesTo(kind));

// ===== Sondages =====
function openPoll(id) {
  const mail = repo.find(Number(id));
  if (!mail || mail.kind !== "poll" || mail.playerId) throw new HttpError(404, "Poll not found.");
  if (isClosed(mail)) throw new HttpError(409, "This poll is closed.");
  return mail;
}

function checkChoices(mail, choices) {
  const positions = new Set(repo.options(mail.id).map((o) => o.position));
  if (mail.allowOther) positions.add(OTHER);
  const picked = [...new Set((Array.isArray(choices) ? choices : []).map(Number))];
  if (!picked.length) throw new HttpError(400, "Pick at least one answer.");
  if (picked.some((p) => !positions.has(p))) throw new HttpError(400, "Unknown answer.");
  if (!mail.multiple && picked.length > 1) throw new HttpError(400, "Only one answer for this poll.");
  return picked.sort((a, b) => a - b);
}

// Texte libre : 1 à TEXT_MAX caractères, ou null pour « rien »
function cleanText(value, what) {
  const text = String(value ?? "").trim();
  if (text.length > TEXT_MAX) throw new HttpError(400, `Your ${what} must be ${TEXT_MAX} characters at most.`);
  return text || null;
}

// Les cases, la réponse « Other » (exigée si sa case est cochée) et le
// commentaire d'un votant, d'un coup
function saveVote(mail, voter, choices, { other, comment } = {}, { keepComment = false } = {}) {
  const at = nowIso();
  const picked = choices.length ? checkChoices(mail, choices) : [];
  const otherText = picked.includes(OTHER) ? cleanText(other, "answer") : null;
  if (picked.includes(OTHER) && !otherText) throw new HttpError(400, 'Write your own answer for "Other".');
  repo.setVote(mail.id, voter, picked, at);
  if (mail.allowOther) repo.setText(mail.id, voter, "other", otherText, at);
  if (mail.allowComments && !keepComment) repo.setText(mail.id, voter, "comment", cleanText(comment, "comment"), at);
}

/**
 * Vote du site : les cases cochées remplacent le vote d'avant ; other : le
 * texte de la case « Other » ; comment : le commentaire (vide : retiré).
 */
function vote(player, id, choices, texts = {}) {
  const mail = openPoll(id);
  if (!Array.isArray(choices) || !choices.length) throw new HttpError(400, "Pick at least one answer.");
  saveVote(mail, playerVoter(player), choices, texts);
  repo.markRead(mail.id, player.id, nowIso());
  if (mail.discordMessageId) relay("pollVoted", repo.find(mail.id));
  return toPublic({ ...repo.find(mail.id), readAt: nowIso() }, player);
}

// Votant Discord : le profil dont le tag Discord est le sien, s'il n'y en a
// qu'un ; sinon le compte Discord lui-même
function discordVoter(user) {
  const matches = players.findByDiscordUser({ username: user.username, discriminator: user.discriminator });
  return matches.length === 1 ? `player:${matches[0].id}` : `discord:${user.id}`;
}

/**
 * Bouton Discord : plusieurs cases, il coche ou décoche la sienne ; une seule
 * case, il la choisit. Renvoie le sondage vu par ce votant.
 */
function voteFromDiscord(id, user, position) {
  const mail = openPoll(id);
  const voter = discordVoter(user);
  const mine = repo.choicesOf(mail.id, voter);
  const next = mail.multiple ? (mine.includes(position) ? mine.filter((p) => p !== position) : [...mine, position]) : [position];
  // Plus aucune case : le vote est retiré ; la réponse « Other » est gardée
  // tant que sa case reste cochée
  saveVote(mail, voter, next, { other: repo.textOf(mail.id, voter, "other") }, { keepComment: true });
  const updated = repo.find(mail.id);
  relay("pollVoted", updated);
  return { mail: updated, poll: pollView(updated, voter) };
}

/**
 * Fenêtre Discord « Other… » : sa réponse, et sa case cochée (en plus des
 * autres s'il y en a plusieurs, à la place sinon).
 */
function otherFromDiscord(id, user, text) {
  const mail = openPoll(id);
  if (!mail.allowOther) throw new HttpError(400, "This poll has no \"Other\" answer.");
  const voter = discordVoter(user);
  const mine = repo.choicesOf(mail.id, voter);
  const next = mail.multiple ? [...new Set([...mine, OTHER])] : [OTHER];
  saveVote(mail, voter, next, { other: text }, { keepComment: true });
  const updated = repo.find(mail.id);
  relay("pollVoted", updated);
  return { mail: updated, poll: pollView(updated, voter) };
}

/** Fenêtre Discord « Comment » : son commentaire (vide : retiré). */
function commentFromDiscord(id, user, text) {
  const mail = openPoll(id);
  if (!mail.allowComments) throw new HttpError(400, "This poll takes no comments.");
  const voter = discordVoter(user);
  repo.setText(mail.id, voter, "comment", cleanText(text, "comment"), nowIso());
  return { mail, poll: pollView(mail, voter) };
}

/** Le texte déjà écrit par ce compte Discord (pour préremplir la fenêtre). */
function discordText(id, user, kind) {
  return repo.textOf(Number(id), discordVoter(user), kind);
}

/** Admin : ferme un sondage maintenant. */
async function closePoll(id) {
  const mail = openPoll(id);
  repo.close(mail.id, nowIso());
  const closed = repo.find(mail.id);
  if (closed.discordMessageId && (await relay("pollClosed", closed)) !== null) repo.setDiscordClosed(closed.id);
  return { ...closed, poll: pollView(closed, null, { all: true }) };
}

/** Sondages arrivés à leur date de fin : leur message Discord passe aux résultats. */
async function closeDuePolls() {
  for (const mail of repo.closedOnDiscord(nowIso())) {
    if ((await relay("pollClosed", mail)) !== null) repo.setDiscordClosed(mail.id);
  }
}

const findLetter = (id) => repo.find(Number(id));

module.exports = {
  OTHER,
  otherFromDiscord,
  commentFromDiscord,
  discordText,
  sendPersonal,
  replyToReport,
  replyToSuggestion,
  reportFixed,
  suggestionAdded,
  repliesTo,
  setDiscordDestination,
  findLetter,
  vote,
  voteFromDiscord,
  closePoll,
  closeDuePolls,
  pollView,
  setNotifier, inbox, markRead, listForAdmin, send, edit, remove, discordSettings, TITLE_MAX, BODY_MAX };
