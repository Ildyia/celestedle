const crypto = require("crypto");
const config = require("../config");
const playersRepo = require("../repositories/players");
const staffRepo = require("../repositories/staff");
const players = require("./players");

// Bêta : son disque est effacé à chaque redémarrage. Le profil connecté avec
// PERMANENT_OWNER_TOKEN est recréé s'il manque, puis devient propriétaire
// (ou administrateur si le site a déjà un autre propriétaire).
function ensurePermanentOwner() {
  const { token, name } = config.permanentOwner;
  if (!token) return null;
  if (token.length < 16) {
    console.warn("[BETA] PERMANENT_OWNER_TOKEN doit faire au moins 16 caractères");
    return null;
  }
  let player = players.findByToken(token);
  if (!player) {
    player = playersRepo.create({
      id: crypto.randomBytes(8).toString("base64url"),
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      name,
      avatar: players.AVATARS[0],
      color: players.COLORS[0]
    });
    // Profil nommé, donc pas anonyme : il apparaît dans les classements
    playersRepo.update(player.id, { ...player, discordTag: player.discordTag ?? null });
  }
  const ownerId = staffRepo.ownerId();
  const role = ownerId === null || ownerId === player.id ? "owner" : "administrator";
  if (player.role !== role) staffRepo.setRole(player.id, role);
  console.log(`[BETA] Profil permanent « ${player.name} » : ${role}`);
  return playersRepo.findById(player.id);
}

module.exports = { ensurePermanentOwner };
