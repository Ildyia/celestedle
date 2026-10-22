const staff = require("../services/staff");
const { HttpError } = require("../utils/http-error");

// L'accès admin passe par le profil du joueur (jeton X-Player-Token) et son rôle

function requireStaff(req, res, next) {
  if (!req.player) return next(new HttpError(401, "Sign in with your player profile first."));
  if (!staff.isStaff(req.player)) return next(new HttpError(403, "This profile has no admin rights."));
  next();
}

function requireOwner(req, res, next) {
  if (req.player?.role !== "owner") return next(new HttpError(403, "Only the owner can do this."));
  next();
}

// Modification comptée dans le quota du jour. Elle n'est enregistrée au
// journal que si la requête réussit. `target(req)` décrit l'objet modifié.
function limitedAction(action, target = () => null) {
  return (req, res, next) => {
    try {
      staff.assertCanModify(req.player);
    } catch (err) {
      return next(err);
    }
    res.on("finish", () => {
      if (res.statusCode < 400) staff.recordAction(req.player, action, target(req));
    });
    next();
  };
}

module.exports = { requireStaff, requireOwner, limitedAction };
