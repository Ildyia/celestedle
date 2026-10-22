const crypto = require("crypto");
const bcrypt = require("bcrypt");
const config = require("../config");
const staffRepo = require("../repositories/staff");
const playersRepo = require("../repositories/players");
const settingsRepo = require("../repositories/settings");
const { HttpError } = require("../utils/http-error");
const { nowIso, parisDayStartIso } = require("../utils/dates");

// Rôles :
// - owner : toutes les permissions, gère l'équipe, sans limite (un seul)
// - administrator : modifications limitées par jour, ne gère pas l'équipe
const STAFF_ROLES = ["owner", "administrator"];
const DAILY_LIMIT_KEY = "admin_daily_action_limit";
const DEFAULT_DAILY_LIMIT = 20;

function isStaff(player) {
  return STAFF_ROLES.includes(player?.role);
}

function dailyLimit() {
  return settingsRepo.getNumber(DAILY_LIMIT_KEY, DEFAULT_DAILY_LIMIT);
}

function setDailyLimit(limit) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 1000) {
    throw new HttpError(400, "The daily limit must be an integer between 0 and 1000.");
  }
  settingsRepo.set(DAILY_LIMIT_KEY, limit);
}

// Modifications restantes aujourd'hui (null = pas de limite)
function quota(player) {
  const used = staffRepo.countActionsSince(player.id, parisDayStartIso());
  if (player.role === "owner") return { limit: null, used, remaining: null };
  const limit = dailyLimit();
  return { limit, used, remaining: Math.max(0, limit - used) };
}

function assertCanModify(player) {
  const { remaining, limit } = quota(player);
  if (remaining === 0) {
    throw new HttpError(429, `Daily limit reached (${limit} changes). It resets at midnight, Paris time.`);
  }
}

function recordAction(player, action, target) {
  staffRepo.logAction(player.id, action, target, nowIso());
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

// ADMIN_PASSWORD_HASH (bcrypt) est prioritaire ; ADMIN_PASSWORD en clair
// reste accepté, comparé en temps constant.
async function checkPassword(password) {
  if (typeof password !== "string" || !password) return false;
  if (config.adminPasswordHash) return bcrypt.compare(password, config.adminPasswordHash);
  if (config.adminPassword) {
    return crypto.timingSafeEqual(sha256(password), sha256(config.adminPassword));
  }
  return false;
}

function ownerExists() {
  return staffRepo.ownerId() !== null;
}

// Le mot de passe admin ne sert plus qu'à désigner le premier propriétaire,
// tant qu'il n'y en a pas
async function claimOwnership(player, password) {
  if (ownerExists()) throw new HttpError(409, "This site already has an owner.");
  if (!config.adminPasswordHash && !config.adminPassword) {
    throw new HttpError(503, "No admin password is configured on this server.");
  }
  if (!(await checkPassword(password))) throw new HttpError(401, "Wrong password.");
  staffRepo.setRole(player.id, "owner");
  recordAction(player, "claim_owner", player.id);
  return playersRepo.findById(player.id);
}

function grantAdministrator(owner, playerId) {
  const target = playersRepo.findById(String(playerId ?? "").trim());
  if (!target) throw new HttpError(404, "No profile with this player ID.");
  if (target.role === "owner") throw new HttpError(409, "The owner already has every permission.");
  staffRepo.setRole(target.id, "administrator");
  recordAction(owner, "grant_admin", target.id);
  return playersRepo.findById(target.id);
}

function revokeAdministrator(owner, playerId) {
  const target = playersRepo.findById(playerId);
  if (!target || target.role !== "administrator") {
    throw new HttpError(404, "This profile is not an administrator.");
  }
  staffRepo.setRole(target.id, "player");
  recordAction(owner, "revoke_admin", target.id);
  return playersRepo.findById(target.id);
}

function team() {
  return staffRepo.listStaff(parisDayStartIso());
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  isStaff,
  dailyLimit,
  setDailyLimit,
  quota,
  assertCanModify,
  recordAction,
  ownerExists,
  claimOwnership,
  grantAdministrator,
  revokeAdministrator,
  team,
  recentActions: staffRepo.recentActions
};
