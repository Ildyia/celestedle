const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

// --- State & Configuration ---
const database = JSON.parse(fs.readFileSync("./db.json", "utf8"));
const officialElementsList = Object.keys(database).sort();
const adminKey = process.env.ADMIN_PASSWORD;

let secretForce = null;
let secretVersion = Date.now();
let globalSeedHash = 20250204; // Used as the base seed value for dynamic daily selections

// --- Helper Functions ---

// Calculates the element of the day dynamically using a time-locked string hashing mechanism
function getSecretOfTheDay() {
  if (secretForce) return secretForce;

  const dateString = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });

  let localizedHash = globalSeedHash;

  // Generate a pseudo-random hash value locked on the current calendar date string
  for (let i = 0; i < dateString.length; i++) {
    localizedHash =
      dateString.charCodeAt(i) + ((localizedHash << 5) - localizedHash);
  }

  const targetedIndex = Math.abs(localizedHash) % officialElementsList.length;
  return officialElementsList[targetedIndex];
}

// Normalizes mixed inputs (comma strings or text arrays) into standard string lists
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

// --- Admin Endpoint Handlers ---

// Verifies if the passed payload key matches the environment credential string
app.post("/api/admin/verifier-key", (req, res) => {
  const { key } = req.body;
  if (key !== adminKey) {
    return res.status(403).json({ error: "Incorrect passworrrrd" });
  }
  res.json({ success: true, message: "Access authorized" });
});

// Updates or restores the current seed hash to shuffle the daily puzzle word immediately
app.post("/api/admin/random-Hash", (req, res) => {
  const { key, newHash } = req.body;

  if (key !== adminKey) {
    return res.status(403).json({ error: "Access denied" });
  }

  // Restore defaults if explicitly passed a null hash value
  if (newHash === null) {
    globalSeedHash = 20250204;
    secretVersion = Date.now();
    return res.json({
      message:
        "The seed hash has been reset to the system default configuration.",
    });
  }

  globalSeedHash = newHash;
  secretVersion = Date.now();
  res.json({
    message:
      "The seed hash updated successfully. Daily element puzzle has rotated.",
  });
});

// --- Core Game APIs ---

// Returns the hidden element token calculated for the active day signature
app.post("/api/getSecretWord", (req, res) => {
  const secretElement = getSecretOfTheDay();
  res.json({
    success: true,
    secretElement: secretElement,
  });
});

// Provides the primary list containing all valid game entity keywords
app.get("/api/elements", (req, res) => {
  res.json(officialElementsList);
});

// Returns the dynamic compilation stamp used by the client script to verify state syncs
app.get("/secret-version", (req, res) => {
  res.json({ secretVersion: secretVersion });
});

// Compares the client payload choice parameters directly against the target answer metadata fields
app.post("/api/valider", (req, res) => {
  const { choix } = req.body;

  if (!choix || !database[choix]) {
    return res.status(400).json({ error: "Invalid element name" });
  }

  const secretName = getSecretOfTheDay();
  const choiceData = database[choix];
  const secretData = database[secretName];

  const choiceLocations = normalizeMetaList(choiceData.lieu);
  const secretLocations = normalizeMetaList(secretData.lieu);
  const choiceColors = normalizeMetaList(choiceData.couleur);
  const secretColors = normalizeMetaList(secretData.couleur);

  // Evaluate location matches matrix values
  let locationVerdict = "wrong";
  let locationMatches = choiceLocations.filter((loc) =>
    secretLocations.includes(loc),
  );

  if (
    locationMatches.length === secretLocations.length &&
    locationMatches.length === choiceLocations.length
  ) {
    locationVerdict = "correct";
  } else if (locationMatches.length > 0) {
    if (locationMatches.length === choiceLocations.length) {
      locationVerdict = "partial";
    } else {
      locationVerdict = "notTotallyWrong";
    }
  }

  // Evaluate color matches matrix values
  let colorVerdict = "wrong";
  let colorMatches = choiceColors.filter((col) => secretColors.includes(col));

  if (
    colorMatches.length === secretColors.length &&
    colorMatches.length === choiceColors.length
  ) {
    colorVerdict = "correct";
  } else if (colorMatches.length > 0 || secretColors.includes("always")) {
    if (choiceColors.every((val, idx) => val === colorMatches[idx])) {
      colorVerdict = "partial";
    } else {
      colorVerdict = "notTotallyWrong";
    }
  }

  // Evaluate standard hitbox value match conditions
  let hitboxVerdict = "wrong";
  if (choiceData.hitbox === secretData.hitbox) {
    hitboxVerdict = "correct";
  }

  // Dispatch final evaluation payloads
  res.json({
    nom: choix,
    secretVersion: secretVersion,
    verdict: {
      isCorrect: choix === secretName,
      type: choiceData.type === secretData.type ? "correct" : "wrong",
      lieu: locationVerdict,
      couleur: colorVerdict,
      hitbox: hitboxVerdict,
    },
    valeurs: {
      type: choiceData.type,
      lieu: choiceLocations.join(", "),
      couleur: choiceColors.join(", "),
      hitbox: choiceData.hitbox,
    },
  });
});

// --- Server Lifecycle Initialization ---
app.get("/api/version", (req, res) => {
  res.json({
    status: "online",
    environment: process.env.API_URL?.includes("mizkyosia")
      ? "Production (VPS)"
      : "Beta-test (Render)",
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server successfully started running on port ${PORT}`);
});
