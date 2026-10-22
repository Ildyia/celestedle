const players = require("../services/players");
const { HttpError } = require("../utils/http-error");

const TOKEN_HEADER = "x-player-token";

// Associe la requête au joueur du jeton, s'il y en a un valide
function resolvePlayer(req, res, next) {
  const token = req.get(TOKEN_HEADER);
  req.player = token ? players.findByToken(token) : null;
  next();
}

function requirePlayer(req, res, next) {
  if (!req.player) {
    return next(new HttpError(401, "Missing or unknown player token."));
  }
  next();
}

module.exports = { TOKEN_HEADER, resolvePlayer, requirePlayer };
