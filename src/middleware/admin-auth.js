const crypto = require("crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const config = require("../config");
const { HttpError } = require("../utils/http-error");

const SESSION_DURATION = "8h";

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

// ADMIN_PASSWORD_HASH (bcrypt) est prioritaire ; ADMIN_PASSWORD en clair
// reste accepté, comparé en temps constant.
async function checkPassword(password) {
  if (typeof password !== "string" || !password) return false;
  if (config.adminPasswordHash) {
    return bcrypt.compare(password, config.adminPasswordHash);
  }
  if (config.adminPassword) {
    return crypto.timingSafeEqual(sha256(password), sha256(config.adminPassword));
  }
  return false;
}

async function login(password) {
  if (!config.adminPasswordHash && !config.adminPassword) {
    throw new HttpError(503, "Admin access is not configured on this server.");
  }
  if (!(await checkPassword(password))) {
    throw new HttpError(401, "Mot de passe incorrect");
  }
  return jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: SESSION_DURATION });
}

function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return next(new HttpError(401, "Token manquant"));
  }
  try {
    jwt.verify(header.slice(7), config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, "Session expirée"));
  }
}

module.exports = { login, requireAdmin };
