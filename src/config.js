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

  // Bêta : profil propriétaire recréé à chaque démarrage, connecté avec ce
  // code de récupération
  permanentOwner: {
    token: process.env.PERMANENT_OWNER_TOKEN || "",
    name: process.env.PERMANENT_OWNER_NAME || "Amélia"
  },

  // Accès à Connections tant que l'admin ne l'a pas réglé : staff, playtest
  // ou public (la bêta, dont la base repart de zéro, l'ouvre ainsi à tous)
  connectionsAccess: process.env.CONNECTIONS_ACCESS || "",
  // C-Side de Connections (grilles de tags seulement) : playtest par défaut
  connectionsCsideAccess: process.env.CONNECTIONS_CSIDE_ACCESS || "",

  // Adresse publique du jeu (liens des messages du bot)
  siteUrl: process.env.SITE_URL || "https://celestedle.vercel.app/",
  discord: {
    token: process.env.DISCORD_BOT_TOKEN || "",
    // Valeurs historiques, utilisées tant que /setup-reports n'a pas été lancé
    publicChannelId:
      process.env.DISCORD_PUBLIC_CHANNEL_ID || "1534624008614576209",
    privateChannelId:
      process.env.DISCORD_PRIVATE_CHANNEL_ID || "1534616690287972498",
    // Rôle mentionné par le récap de minuit (« ping word reset »)
    resetRoleId: process.env.DISCORD_RESET_ROLE_ID || "1535840476068974622",
    // Boîte aux lettres : salon et rôle des annonces, des notes de mise à
    // jour et des sondages, tant que /setup-mail n'en a pas choisi
    mailChannelId: process.env.DISCORD_MAIL_CHANNEL_ID || "",
    mailRoleId: process.env.DISCORD_MAIL_ROLE_ID || "",
    patchChannelId: process.env.DISCORD_PATCH_CHANNEL_ID || "",
    patchRoleId: process.env.DISCORD_PATCH_ROLE_ID || "",
    pollChannelId: process.env.DISCORD_POLL_CHANNEL_ID || "",
    pollRoleId: process.env.DISCORD_POLL_ROLE_ID || ""
  }
};
