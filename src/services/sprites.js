const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("../utils/data-dir");
const { HttpError } = require("../utils/http-error");

// Sprites envoyés depuis l'admin : rangés dans le dossier de données (volume
// Docker en prod), car public/ est recréé à chaque déploiement. En base, leur
// chemin commence par « uploads/ ».
const UPLOADS_DIR = path.join(DATA_DIR, "sprites");
const UPLOAD_PREFIX = "uploads/";
const MAX_BYTES = 1024 * 1024;

// Format reconnu à ses premiers octets, quel que soit le type annoncé
const FORMATS = [
  { ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" }
];

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function isUpload(sprite) {
  return typeof sprite === "string" && sprite.startsWith(UPLOAD_PREFIX);
}

// Fichier d'un sprite envoyé, ou null si le chemin sort du dossier
function uploadFile(sprite) {
  if (!isUpload(sprite)) return null;
  const name = sprite.slice(UPLOAD_PREFIX.length);
  if (!/^[\w.-]+$/.test(name)) return null;
  return path.join(UPLOADS_DIR, name);
}

// Enregistre l'image et renvoie son chemin à mettre dans elements.sprite
function saveUpload(element, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, "No image received.");
  if (buffer.length > MAX_BYTES) throw new HttpError(413, "The image must be 1 MB or less.");
  const format = FORMATS.find((f) => f.test(buffer));
  if (!format) throw new HttpError(400, "Use a PNG, GIF, JPEG or WebP image.");

  // Nom unique à chaque envoi : les navigateurs ne gardent pas l'ancienne image en cache
  const name = `${element.slug}-${crypto.randomBytes(4).toString("hex")}.${format.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return UPLOAD_PREFIX + name;
}

// Ancien fichier remplacé : supprimé pour ne pas remplir le volume
function removeUpload(sprite) {
  const file = uploadFile(sprite);
  if (file) fs.rmSync(file, { force: true });
}

module.exports = { MAX_BYTES, isUpload, uploadFile, saveUpload, removeUpload };
