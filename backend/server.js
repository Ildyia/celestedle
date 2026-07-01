const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();

app.use(cors());
app.use(express.json());

const database = JSON.parse(fs.readFileSync("./db.json", "utf8"));
const listeNoms = Object.keys(database).sort();

const ADMIN_KEY = process.env.ADMIN_PASSWORD;

let secretForce = null;
let secretVersion = Date.now();
let hash = 20250202; // Servira de graine (seed) de base pour le calcul

function getSecretDuJour() {
  if (secretForce) return secretForce;

  const dateStr = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });

  // On utilise une variable locale basée sur le hash global pour ne pas altérer la racine
  let localHash = hash;

  for (let i = 0; i < dateStr.length; i++) {
    localHash = dateStr.charCodeAt(i) + ((localHash << 5) - localHash);
  }
  const index = Math.abs(localHash) % listeNoms.length;
  return listeNoms[index];
}

function normaliserListe(donnee) {
  if (Array.isArray(donnee)) {
    if (donnee.length === 1 && donnee[0].includes(",")) {
      return donnee[0].split(",").map((c) => c.trim());
    }
    return donnee.map((c) => c.trim());
  }
  if (typeof donnee === "string") {
    return donnee.split(",").map((c) => c.trim());
  }
  return [];
}

app.post("/api/admin/verifier-key", (req, res) => {
  const { key } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Mot de passe incorrect" });
  }
  res.json({ success: true, message: "Accès autorisé" });
});

app.post("/api/admin/random-Hash", (req, res) => {
  const { key, newHash } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  if (newHash === null) {
    hash = 20250202;
    secretVersion = Date.now();
    return res.json({
      message: "Le hash a été réinitialisé sur le hash par défaut.",
    });
  }
  hash = newHash;
  secretVersion = Date.now();
  res.json({
    message: "Le hash a été mis à jour avec succès et le mot a changé.",
  });
});

app.post("/api/getSecretWord", (req, res) => {
  const elementSecret = getSecretDuJour();
  res.json({
    success: true,
    secretElement: elementSecret,
  });
});

app.get("/api/elements", (req, res) => {
  res.json(listeNoms);
});

app.get("/api/version", (req, res) => {
  res.json({ secretVersion: secretVersion });
});

app.post("/api/valider", (req, res) => {
  const { choix } = req.body;

  if (!choix || !database[choix]) {
    return res.status(400).json({ error: "Élément invalide" });
  }

  const secretNom = getSecretDuJour();
  const choixData = database[choix];
  const secretData = database[secretNom];

  const choixLieux = normaliserListe(choixData.lieu);
  const secretLieux = normaliserListe(secretData.lieu);
  const choixCouleurs = normaliserListe(choixData.couleur);
  const secretCouleurs = normaliserListe(secretData.couleur);

  let lieuVerdict = "wrong";
  let lieuMatch = choixLieux.filter((l) => secretLieux.includes(l));
  if (
    lieuMatch.length === secretLieux.length &&
    lieuMatch.length === choixLieux.length
  ) {
    lieuVerdict = "correct";
  } else if (lieuMatch.length > 0) {
    if (lieuMatch.length === choixLieux.length) {
      lieuVerdict = "partial";
    } else lieuVerdict = "notTotallyWrong";
  }

  let couleurVerdict = "wrong";
  let couleurMatch = choixCouleurs.filter((c) => secretCouleurs.includes(c));
  if (
    couleurMatch.length === secretCouleurs.length &&
    couleurMatch.length === choixCouleurs.length
  ) {
    couleurVerdict = "correct";
  } else if (couleurMatch.length > 0 || secretCouleurs == "always") {
    if (choixCouleurs.every((val, i) => val === couleurMatch[i])) {
      couleurVerdict = "partial";
    } else {
      couleurVerdict = "notTotallyWrong";
    }
  }

  let hitboxVerdict = "wrong";
  if (choixData.hitbox === secretData.hitbox) {
    hitboxVerdict = "correct";
  }

  res.json({
    nom: choix,
    secretVersion: secretVersion,
    verdict: {
      isCorrect: choix === secretNom,
      type: choixData.type === secretData.type ? "correct" : "wrong",
      lieu: lieuVerdict,
      couleur: couleurVerdict,
      hitbox: hitboxVerdict,
    },
    valeurs: {
      type: choixData.type,
      lieu: choixLieux.join(", "),
      couleur: choixCouleurs.join(", "),
      hitbox: choixData.hitbox,
    },
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
