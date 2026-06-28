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
let secretVersion = Date.now(); // Version initiale unique

function getSecretDuJour() {
  if (secretForce) return secretForce;

  const dateStr = new Date().toLocaleDateString("sv-SE", {
    timeZone: "Europe/Paris",
  });

  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % listeNoms.length;
  return listeNoms[index];
}

// [ADMIN] Vérification de la clé
app.post("/api/admin/verifier-key", (req, res) => {
  const { key } = req.body;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Mot de passe incorrect" });
  }
  res.json({ success: true, message: "Accès autorisé" });
});

// [ADMIN] Changement manuel du secret avec mise à jour de la version
app.post("/api/admin/set-secret", (req, res) => {
  const { key, nom } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  if (nom === null) {
    secretForce = null;
    secretVersion = Date.now(); // Le mot change -> nouvelle version
    return res.json({
      message: "Le secret a été réinitialisé sur le mode automatique du jour.",
    });
  }
  if (!database[nom]) {
    return res.status(400).json({ error: "Élément introuvable dans la DB" });
  }

  secretForce = nom;
  secretVersion = Date.now(); // Le mot change -> nouvelle version
  res.json({
    message: `La cible a été forcée manuellement. Nouvelle cible : ${secretForce}`,
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

  let lieuVerdict = "wrong";
  const intersectionLieu = choixData.lieu.filter((l) =>
    secretData.lieu.includes(l),
  );

  if (JSON.stringify(choixData.lieu) === JSON.stringify(secretData.lieu)) {
    lieuVerdict = "correct";
  } else if (intersectionLieu.length > 0) {
    lieuVerdict = "partial";
  } else if (
    choixData.lieu.includes("récurrent") &&
    secretData.lieu.includes("récurrent")
  ) {
    lieuVerdict = "partial";
  }

  let couleurVerdict = "wrong";
  const intersectionCouleur = choixData.couleur.filter((x) =>
    secretData.couleur.includes(x),
  );
  if (
    JSON.stringify(choixData.couleur.sort()) ===
    JSON.stringify(secretData.couleur.sort())
  ) {
    couleurVerdict = "correct";
  } else if (intersectionCouleur.length > 0) {
    couleurVerdict = "partial";
  }

  let hitboxVerdict = "wrong";
  if (choixData.hitbox === secretData.hitbox) {
    hitboxVerdict = "correct";
  }

  res.json({
    nom: choix,
    secretVersion: secretVersion, // Inclus pour permettre la détection côté client
    verdict: {
      isCorrect: choix === secretNom,
      type: choixData.type === secretData.type ? "correct" : "wrong",
      lieu: lieuVerdict,
      couleur: couleurVerdict,
      hitbox: hitboxVerdict,
    },
    valeurs: {
      type: choixData.type,
      lieu: choixData.lieu.join(", "),
      couleur: choixData.couleur.join(", "),
      hitbox: choixData.hitbox,
    },
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});