const express = require("express");
const fs = require("fs");
const path = require("path");
const corsMiddleware = require("./middleware/cors");
const { errorHandler } = require("./middleware/errors");
const elementsRepo = require("./repositories/elements");
const sprites = require("./services/sprites");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PLACEHOLDER_SPRITE = path.join(PUBLIC_DIR, "assets/placeholder.svg");

function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN"
  });
  next();
}

function createApp() {
  const app = express();

  // Render et Traefik sont devant l'application : req.ip = IP du joueur
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(PUBLIC_DIR));

  // Image d'un élément, ou une image par défaut
  app.get("/sprite/:name", (req, res) => {
    const sprite = elementsRepo.findByName(req.params.name)?.sprite;
    // Sprite envoyé depuis l'admin (dossier de données) ou fichier de public/
    const uploaded = sprites.uploadFile(sprite);
    const file = uploaded ?? (sprite ? path.join(PUBLIC_DIR, sprite) : null);
    const allowed = uploaded || (file && file.startsWith(PUBLIC_DIR + path.sep));
    res.sendFile(allowed && fs.existsSync(file) ? file : PLACEHOLDER_SPRITE);
  });

  app.use("/api", require("./routes/api"));

  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
