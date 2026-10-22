const crypto = require("crypto");
const playersRepo = require("../repositories/players");
const statsRepo = require("../repositories/stats");
const { HttpError } = require("../utils/http-error");
const { todayParis, addDays } = require("../utils/dates");
const { getMode } = require("./modes");

// Avatars proposés : sprites existants dans public/assets/entities
const AVATARS = [
  "madeline",
  "badeline",
  "theo",
  "granny-portrait",
  "oshiro-portrait",
  "strawberry",
  "golden-strawberry",
  "winged-strawberry",
  "moon-berry",
  "crystal-heart",
  "feather",
  "refill",
  "seeker",
  "pufferfish",
  "kevin",
  "bird"
];

const COLORS = ["#f472b6", "#a855f7", "#6366f1", "#38bdf8", "#10b981", "#facc15", "#f97316", "#ef4444"];

const NAME_PATTERN = /^[\p{L}\p{N} _-]{3,20}$/u;

// Nom d'utilisateur Discord actuel (2 à 32 caractères : a-z, 0-9, _ et .)
// ou ancien format « Nom#1234 »
const DISCORD_PATTERN = /^(?:[a-z0-9_.]{2,32}|[^#@:]{2,32}#\d{4})$/;

// "" ou null efface le tag ; un @ au début est ignoré
function normalizeDiscordTag(value) {
  const tag = String(value ?? "").trim().replace(/^@/, "");
  if (!tag) return null;
  const normalized = tag.includes("#") ? tag : tag.toLowerCase();
  if (!DISCORD_PATTERN.test(normalized)) {
    throw new HttpError(400, "Discord username must be 2 to 32 letters, digits, _ or . (or the old name#1234 format).");
  }
  return normalized;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomItem(list) {
  return list[crypto.randomInt(list.length)];
}

// Le jeton n'est renvoyé qu'ici : il sert aussi de code de récupération
function createPlayer() {
  const token = crypto.randomBytes(24).toString("base64url");
  const player = playersRepo.create({
    id: crypto.randomBytes(8).toString("base64url"),
    tokenHash: hashToken(token),
    name: `Climber ${crypto.randomInt(1000, 10000)}`,
    avatar: randomItem(AVATARS),
    color: randomItem(COLORS)
  });
  return { player, token };
}

function findByToken(token) {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return null;
  return playersRepo.findByTokenHash(hashToken(token));
}

function updateProfile(player, input) {
  const name = input.name === undefined ? player.name : String(input.name).trim();
  if (!NAME_PATTERN.test(name)) {
    throw new HttpError(400, "Name must be 3 to 20 letters, digits, spaces, _ or -.");
  }
  const avatar = input.avatar ?? player.avatar;
  if (!AVATARS.includes(avatar)) throw new HttpError(400, "Unknown avatar.");
  const color = input.color ?? player.color;
  if (!COLORS.includes(color)) throw new HttpError(400, "Unknown colour.");
  const isHidden = input.isHidden === undefined ? player.isHidden : Boolean(input.isHidden);
  const discordTag =
    input.discordTag === undefined ? player.discordTag : normalizeDiscordTag(input.discordTag);

  return playersRepo.update(player.id, { name, avatar, color, isHidden, discordTag });
}

// Séries de jours consécutifs gagnés. La série en cours compte encore si le
// dernier jour gagné est aujourd'hui ou hier.
function streaks(winDates) {
  let best = 0;
  let run = 0;
  let previous = null;
  for (const date of winDates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  const today = todayParis();
  const current = previous === today || previous === addDays(today, -1) ? run : 0;
  return { current, best };
}

function playerStats(player, modeId) {
  const mode = getMode(modeId);
  const games = statsRepo.playerGames(player.id, mode.id);
  const wins = games.filter((g) => g.status === "won");

  const distribution = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? "10+" : String(i + 1),
    count: 0
  }));
  for (const win of wins) distribution[Math.min(win.tries, 10) - 1].count++;

  const average = (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return {
    mode: mode.id,
    played: games.length,
    wins: wins.length,
    forfeits: games.filter((g) => g.status === "forfeit").length,
    losses: games.filter((g) => g.status === "lost").length,
    winRate: games.length ? Math.round((wins.length / games.length) * 100) : 0,
    avgTries: average(wins.map((w) => w.tries)),
    avgSeconds: average(wins.map((w) => w.seconds)),
    bestSeconds: wins.length ? Math.min(...wins.map((w) => w.seconds)) : null,
    streak: streaks(wins.map((w) => w.date)),
    distribution
  };
}

module.exports = {
  AVATARS,
  COLORS,
  createPlayer,
  findByToken,
  updateProfile,
  playerStats,
  streaks
};
