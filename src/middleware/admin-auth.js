const staff = require("../services/staff");
const { HttpError } = require("../utils/http-error");

// L'accès admin passe par le profil du joueur (jeton X-Player-Token) et son rôle

function requireStaff(req, res, next) {
  if (!req.player) return next(new HttpError(401, "Sign in with your player profile first."));
  if (!staff.isStaff(req.player)) return next(new HttpError(403, "This profile has no admin rights."));
  next();
}

// Modes en test : playtesters et équipe admin
// Ouvert à tous : même sans profil (il est créé au premier essai)
function requirePlaytester(req, res, next) {
  if (staff.canPlaytest(req.player)) return next();
  if (!req.player) return next(new HttpError(401, "Sign in with your player profile first."));
  next(new HttpError(403, "This mode is only open to playtesters for now."));
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

module.exports = { requireStaff, requirePlaytester, requireOwner, limitedAction };
