require("dotenv").config();
const crypto = require("crypto");

function list(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Sans JWT_SECRET, un secret aléatoire est généré : le serveur démarre, mais
// les sessions admin sont perdues à chaque redémarrage.
function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  console.warn("[CONFIG] JWT_SECRET absent : secret temporaire généré");
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  randomSeed: process.env.RANDOM_SEED || "",
  jwtSecret: jwtSecret(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",

  // Origines autorisées en plus du site lui-même et des domaines Celestedle
  // sur Vercel (voir middleware/cors.js)
  corsOrigins: list(process.env.CORS_ORIGINS),

  discord: {
    token: process.env.DISCORD_BOT_TOKEN || "",
    // Valeurs historiques, utilisées tant que /setup-reports n'a pas été lancé
    publicChannelId:
      process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209",
    privateChannelId:
      process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498"
  }
};
