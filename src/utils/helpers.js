const fs = require("fs");
const path = require("path");

const database = JSON.parse(fs.readFileSync(path.join(__dirname, "../../db.json"), "utf8"));
const officialElementsList = Object.keys(database).sort();

let secretForce = null;
let globalSeedHash = 20250204;

function getSecretOfTheDay() {
  if (secretForce) return secretForce;

  const dateString = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });

  let localizedHash = globalSeedHash;

  for (let i = 0; i < dateString.length; i++) {
    // Use bitwise OR with 0 to ensure the result is a 32-bit integer
    localizedHash = (localizedHash * 33 + dateString.charCodeAt(i)) | 0;
    //Use math function to randomize the localizedHash further
    localizedHash = Math.sin(localizedHash) * 10000 | 0;
  }

  const targetedIndex = Math.abs(localizedHash) % officialElementsList.length;
  return officialElementsList[targetedIndex];
}

function normalizeMetaList(data) {
  if (Array.isArray(data)) {
    if (data.length === 1 && data[0].includes(",")) {
      return data[0].split(",").map((item) => item.trim());
    }
    return data.map((item) => item.trim());
  }
  if (typeof data === "string") {
    return data.split(",").map((item) => item.trim());
  }
  return [];
}

function updateSeedHash(newHash) {
  globalSeedHash = newHash;
}

module.exports = {
  database,
  officialElementsList,
  getSecretOfTheDay,
  normalizeMetaList,
  updateSeedHash,
};