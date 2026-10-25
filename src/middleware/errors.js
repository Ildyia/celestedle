const { HttpError } = require("../utils/http-error");

function notFound(req, res) {
  res.status(404).json({ error: "Route not found" });
}

// Express 5 transmet aussi les erreurs des handlers async
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }
  console.error(`[ERROR] ${req.method} ${req.originalUrl}`, err);
  // L'équipe admin n'a pas accès aux logs du serveur : elle reçoit le
  // message de l'erreur (sans la pile) pour pouvoir la signaler
  const debug = ["owner", "administrator"].includes(req.player?.role) ? `${err.name}: ${err.message}` : undefined;
  res.status(500).json({ error: "Internal server error", debug });
}

module.exports = { notFound, errorHandler };
