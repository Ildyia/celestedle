const cors = require("cors");
const config = require("../config");

// Front Celestedle sur Vercel (production, bêta et prévisualisations)
const VERCEL_ORIGIN = /^https:\/\/celestedle[a-z0-9-]*\.vercel\.app$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowed(origin, host) {
  if (!origin) return true; // requêtes sans navigateur, ou même origine en GET
  if (VERCEL_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin)) return true;
  if (config.corsOrigins.includes(origin)) return true;
  try {
    // Pages servies par l'API elle-même (admin.html…)
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

module.exports = cors((req, callback) => {
  callback(null, { origin: isAllowed(req.get("origin"), req.get("host")) });
});
