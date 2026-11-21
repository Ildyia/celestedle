const config = require("./config");
const { createApp } = require("./app");
const { startBot } = require("./discord/bot");
const daily = require("./services/daily");
const { ensurePermanentOwner } = require("./services/permanent-owner");

process.on("unhandledRejection", (err) => {
  console.error("[ERROR] Promesse rejetée non gérée :", err);
});

const app = createApp();
startBot();

console.log(
  `[INIT] Mot du jour : ${daily.getTodaySecret("normal").element.nom} | ` +
    `Hard : ${daily.getTodaySecret("hard").element.nom}`
);

// Une erreur ici ne doit pas empêcher le site de démarrer
try {
  ensurePermanentOwner();
} catch (err) {
  console.error("[BETA] Profil permanent :", err);
}

app.listen(config.port, () => {
  console.log(`Server successfully started running on port ${config.port}`);
  // Grilles Connections des prochains jours, tirées en avance dans un worker
  require("./services/connections").startPreparingUpcoming();
});
