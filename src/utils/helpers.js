const elementsRepo = require("../repositories/elements");
const daily = require("../services/daily");

// Façade gardée pour les routes existantes : les données viennent maintenant
// de la base SQLite (voir src/db et src/repositories)

function getElementsList() {
  return elementsRepo.listActive();
}

function getEntitySprite(name) {
  return elementsRepo.findByName(name)?.sprite;
}

console.log(
  `[INIT] SEED: ${process.env.RANDOM_SEED} | MOT DU JOUR: ${daily.getSecretElement().nom}`
);

module.exports = {
  getElementsList,
  getEntitySprite,
  findElementByName: elementsRepo.findByName,
  getSecretElement: daily.getSecretElement,
  getSecretVersion: daily.getSecretVersion,
  getSeededRandom: daily.getSeededRandom,
  setSecret: daily.setSecret,
  drawRandomSecret: daily.drawRandomSecret
};
