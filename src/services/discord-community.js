// Ce que le bot Discord sait des joueurs liés à un compte Discord (le tag
// Discord de leur profil) : rappel de série, fiche (/profile), rôle de
// chapitre. Le bot (src/discord/bot.js) ne fait que l'envoyer.
const players = require("./players");
const playersRepo = require("../repositories/players");
const discordRepo = require("../repositories/discord");
const settingsRepo = require("../repositories/settings");
const achievements = require("./achievements");
const { CHAPTERS } = require("./chapters");
const { HttpError } = require("../utils/http-error");
const { todayParis, nowIso } = require("../utils/dates");

const DEFAULT_HOUR = 20;
const ROLES_KEY = "discord_chapter_roles";
const PARIS_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false });
const parisHour = (at = new Date()) => Number(PARIS_HOUR.format(at)) % 24;

const linkedProfiles = (user) => players.findByDiscordUser({ username: user.username, discriminator: user.discriminator });

// ===== Rappel de série =====
function setReminder(user, hour = DEFAULT_HOUR) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new HttpError(400, "The hour must be between 0 and 23.");
  if (!linkedProfiles(user).length) {
    throw new HttpError(404, `No Celestedle profile has the Discord username "${user.username}". Add it in your profile first (Profile → Discord username).`);
  }
  discordRepo.setReminder(user.id, hour, nowIso());
  return { hour };
}

const removeReminder = (user) => discordRepo.removeReminder(user.id);
const findReminder = (user) => discordRepo.findReminder(user.id);

/**
 * Le rappel à envoyer à ce compte Discord aujourd'hui, ou null : pas de profil
 * lié, ou déjà joué aujourd'hui. streak : la meilleure série en cours.
 */
function reminderFor(user, today = todayParis()) {
  const profiles = linkedProfiles(user);
  if (!profiles.length || profiles.some((p) => discordRepo.playedOn(p.id, today))) return null;
  const streak = Math.max(0, ...profiles.flatMap((p) => ["normal", "hard"].map((mode) => players.playerStats(p, mode).streak.current)));
  return { streak, name: profiles[0].name };
}

function reminderText({ streak }, siteUrl) {
  return streak > 0
    ? `🍓 Your **${streak}-day streak** is still waiting for today's climb! A new entity is up on ${siteUrl}`
    : `🏔️ Today's climb is waiting for you on ${siteUrl}`;
}

/** Rappels de l'heure en cours pas encore traités aujourd'hui. */
function dueReminders(at = new Date()) {
  return discordRepo.dueReminders(parisHour(at), todayParis(at));
}

const markReminderSent = (userId, at = new Date()) => discordRepo.markSent(userId, todayParis(at));

// ===== Fiche =====
/** Profils visibles (ni cachés ni anonymes) liés à ce compte Discord. */
function publicProfiles(user) {
  return linkedProfiles(user).filter((p) => !p.isHidden && !p.isAnonymous);
}

// ===== Rôles de chapitre =====
/** { guildId, roles: [id du rôle de chaque chapitre] }, ou null avant /setup-chapter-roles. */
function chapterRoles() {
  try {
    return JSON.parse(settingsRepo.get(ROLES_KEY, "null"));
  } catch {
    return null;
  }
}

function setChapterRoles(guildId, roles) {
  settingsRepo.set(ROLES_KEY, JSON.stringify({ guildId, roles }));
}

/**
 * Chapitre atteint par nom d'utilisateur Discord (le plus haut de ses
 * profils). Les anciens tags « Nom#1234 » sont laissés de côté.
 */
function chaptersByUsername() {
  const best = new Map();
  for (const profile of playersRepo.withDiscordTag()) {
    if (profile.discordTag.includes("#")) continue;
    const chapter = achievements.playerClimb(profile).chapter;
    best.set(profile.discordTag, Math.max(best.get(profile.discordTag) ?? 0, chapter));
  }
  return best;
}

/** Chapitre d'un compte Discord, ou null sans profil lié. */
function chapterOf(user) {
  const profiles = linkedProfiles(user);
  return profiles.length ? Math.max(...profiles.map((p) => achievements.playerClimb(p).chapter)) : null;
}

module.exports = {
  CHAPTERS,
  DEFAULT_HOUR,
  setReminder,
  removeReminder,
  findReminder,
  reminderFor,
  reminderText,
  dueReminders,
  markReminderSent,
  publicProfiles,
  chapterRoles,
  setChapterRoles,
  chaptersByUsername,
  chapterOf
};
