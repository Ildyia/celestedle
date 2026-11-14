const express = require("express");
const fs = require("fs");
const path = require("path");
const corsMiddleware = require("./middleware/cors");
const { errorHandler } = require("./middleware/errors");
const elementsRepo = require("./repositories/elements");
const sprites = require("./services/sprites");
const techsRepo = require("./repositories/techs");

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

// Aperçu de lien (Discord…) : l'image doit être donnée par une adresse
// complète. On l'ajoute au <head> des pages à l'envoi, d'après l'adresse
// demandée : pas de nom de domaine à configurer, la bêta a la sienne.
const LINK_PREVIEW_PAGES = ["index.html", "menu.html", "connections.html", "techs.html"];
const pageCache = new Map();

function sendPageWithPreview(req, res, next) {
  const page = req.path === "/" ? "index.html" : req.path.slice(1);
  // Relu seulement quand le fichier change
  let html;
  try {
    const file = path.join(PUBLIC_DIR, page);
    const { mtimeMs } = fs.statSync(file);
    if (pageCache.get(page)?.mtimeMs !== mtimeMs) pageCache.set(page, { mtimeMs, html: fs.readFileSync(file, "utf8") });
    html = pageCache.get(page).html;
  } catch {
    return next();
  }
  const origin = `${req.protocol}://${req.get("host")}`.replace(/[^a-zA-Z0-9.:/\-[\]]/g, "");
  const tags = [
    `<meta property="og:url" content="${origin}${req.path}" />`,
    `<meta property="og:image" content="${origin}/assets/og.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />'
  ].join("\n    ");
  res.type("html").send(html.replace("</head>", `  ${tags}\n  </head>`));
}

function createApp() {
  const app = express();

  // Render et Traefik sont devant l'application : req.ip = IP du joueur
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json({ limit: "100kb" }));
  app.get(["/", ...LINK_PREVIEW_PAGES.map((page) => `/${page}`)], sendPageWithPreview);
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

  // Image ou GIF d'une tech, envoyé depuis l'admin
  app.get("/tech-media/:name", (req, res) => {
    const file = sprites.uploadFile(techsRepo.findByName(req.params.name)?.media);
    res.sendFile(file && fs.existsSync(file) ? file : PLACEHOLDER_SPRITE);
  });

  app.use("/api", require("./routes/api"));

  app.use((req, res) => res.status(404).json({ error: "Route not found" }));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
