require("dotenv").config();

function list(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  randomSeed: process.env.RANDOM_SEED || "",
  // Sert uniquement à désigner le premier propriétaire (voir services/staff.js)
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",

  // Origines autorisées en plus du site lui-même et des domaines Celestedle
  // sur Vercel (voir middleware/cors.js)
  corsOrigins: list(process.env.CORS_ORIGINS),

  // Bêta : la prod partage ses éléments et ses tags avec SYNC_TOKEN, la bêta
  // les récupère au démarrage depuis SYNC_SOURCE_URL (voir services/beta-sync.js)
  sync: {
    token: process.env.SYNC_TOKEN || "",
    sourceUrl: process.env.SYNC_SOURCE_URL || ""
  },
  // Bêta : profil propriétaire recréé à chaque démarrage, connecté avec ce
  // code de récupération
  permanentOwner: {
    token: process.env.PERMANENT_OWNER_TOKEN || "",
    name: process.env.PERMANENT_OWNER_NAME || "Amélia"
  },

  discord: {
    token: process.env.DISCORD_BOT_TOKEN || "",
    // Valeurs historiques, utilisées tant que /setup-reports n'a pas été lancé
    publicChannelId:
      process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209",
    privateChannelId:
      process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498"
  }
};
