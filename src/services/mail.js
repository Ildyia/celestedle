// Boîte aux lettres : courrier écrit dans l'admin, lu dans le menu du jeu.
// Étape 1 : annonces pour tous (kind « news »), relayées sur Discord dans le
// salon réglé (Settings de l'admin, ou DISCORD_MAIL_CHANNEL_ID), avec le rôle
// réglé mentionné.
const config = require("../config");
const repo = require("../repositories/mail");
const settingsRepo = require("../repositories/settings");
const { HttpError } = require("../utils/http-error");
const { nowIso } = require("../utils/dates");

const TITLE_MAX = 120;
const BODY_MAX = 4000;
const CHANNEL_KEY = "discord_mail_channel_id";
const ROLE_KEY = "discord_mail_role_id";
const SNOWFLAKE = /^\d{5,25}$/;

// Le bot Discord s'enregistre ici au démarrage ; sans bot, rien n'est envoyé.
// mailPosted renvoie { channelId, messageId } du message posté.
let notifier = {
  mailPosted: async () => null,
  mailUpdated: async () => {},
  mailDeleted: async () => {}
};

function setNotifier(next) {
  notifier = next;
}

// ===== Réglages Discord =====
function discordSettings() {
  return {
    channelId: settingsRepo.get(CHANNEL_KEY, config.discord.mailChannelId) || "",
    roleId: settingsRepo.get(ROLE_KEY, config.discord.mailRoleId) || ""
  };
}

function setDiscordSettings({ channelId, roleId }) {
  for (const [key, value, name] of [[CHANNEL_KEY, channelId, "channel"], [ROLE_KEY, roleId, "role"]]) {
    if (value === undefined) continue;
    const id = String(value ?? "").trim();
    if (id && !SNOWFLAKE.test(id)) throw new HttpError(400, `The Discord ${name} ID must be a number (right-click → Copy ID in Discord).`);
    settingsRepo.set(key, id);
  }
  return discordSettings();
}

// ===== Courrier =====
function validate({ title, body } = {}) {
  const clean = { title: String(title ?? "").trim(), body: String(body ?? "").trim().replace(/\r\n/g, "\n") };
  if (!clean.title || clean.title.length > TITLE_MAX) throw new HttpError(400, `The title must be 1 to ${TITLE_MAX} characters.`);
  if (!clean.body || clean.body.length > BODY_MAX) throw new HttpError(400, `The letter must be 1 to ${BODY_MAX} characters.`);
  return clean;
}

// Ce que voit le joueur
function toPublic(mail) {
  return { id: mail.id, kind: mail.kind, slug: mail.slug, title: mail.title, body: mail.body, createdAt: mail.createdAt, read: Boolean(mail.readAt), personal: Boolean(mail.playerId) };
}

/** Courrier d'un joueur (ou de tous, sans profil), le plus récent d'abord. */
function inbox(player) {
  return repo.listFor(player?.id ?? null).map(toPublic);
}

function markRead(player, id) {
  const mail = repo.find(Number(id));
  if (!mail || (mail.playerId && mail.playerId !== player.id)) throw new HttpError(404, "Letter not found.");
  repo.markRead(mail.id, player.id, nowIso());
  return { ok: true };
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

/** Admin : le courrier pour tous, avec le nombre de lecteurs. */
function listForAdmin() {
  return { letters: repo.listPublic(), discord: discordSettings() };
}

/** Admin : nouvelle annonce ; discord = la poster aussi sur Discord. */
async function send(author, input = {}) {
  const { title, body } = validate(input);
  const mail = repo.insert({ kind: "news", title, body, playerId: null, authorId: author.id, at: nowIso() });
  const { channelId, roleId } = discordSettings();
  if (input.discord && channelId) {
    const posted = await relay("mailPosted", mail, { channelId, roleId: roleId || null });
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

module.exports = { setNotifier, inbox, markRead, listForAdmin, send, edit, remove, discordSettings, setDiscordSettings, TITLE_MAX, BODY_MAX };
