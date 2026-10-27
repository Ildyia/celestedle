const config = require("./config");
const { createApp } = require("./app");
const { startBot } = require("./discord/bot");
const daily = require("./services/daily");
const betaSync = require("./services/beta-sync");

process.on("unhandledRejection", (err) => {
  console.error("[ERROR] Promesse rejetée non gérée :", err);
});

const app = createApp();
startBot();

console.log(
  `[INIT] Mot du jour : ${daily.getTodaySecret("normal").element.nom} | ` +
    `Hard : ${daily.getTodaySecret("hard").element.nom}`
);

betaSync.runAtStartup();

app.listen(config.port, () => {
  console.log(`Server successfully started running on port ${config.port}`);
});
