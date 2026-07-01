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

function normaliserListe(donnee) {
  if (Array.isArray(donnee)) {
    // Si le tableau contient une seule chaîne avec des virgules ex: ["brown, grey"]
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

app.post("/api/admin/set-secret", (req, res) => {
  const { key, nom } = req.body;

  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  if (nom === null) {
    secretForce = null;
    secretVersion = Date.now();
    return res.json({
      message: "Le secret a été réinitialisé sur le mode automatique du jour.",
    });
  }
  if (!database[nom]) {
    return res.status(400).json({ error: "Élément introuvable dans la DB" });
  }

  secretForce = nom;
  secretVersion = Date.now();
  res.json({
    message: `La cible a été forcée manuellement. Nouvelle cible : ${secretForce}`,
  });
});

//obtention liste json
app.get("/api/elements", (req, res) => {
  res.json(listeNoms);
});

//obtentien numéro unique pour pouvoir restaurerle mot si le server shutdown
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
  } else if (couleurMatch.length > 0) {
    if (couleurMatch == choixCouleurs) {
      couleurVerdict = "partial";
      console.log(
        "Couleur partiellement correcte : ",
        choixCouleurs,
        secretCouleurs,
        couleurMatch,
      );
    } else {
      couleurVerdict = "notTotallyWrong";
      console.log(
        "Couleur partiellement correcte : ",
        choixCouleurs,
        secretCouleurs,
        couleurMatch,
      );
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
