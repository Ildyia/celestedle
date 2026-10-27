const crypto = require("crypto");
const config = require("../config");
const db = require("../db");
const elementsRepo = require("../repositories/elements");
const connectionsRepo = require("../repositories/connections");
const playersRepo = require("../repositories/players");
const staffRepo = require("../repositories/staff");
const players = require("./players");
const sprites = require("./sprites");

// Ce que la prod partage avec la bêta : les éléments modifiés dans l'admin
// (les autres viennent de db.json, déjà dans le code) et tous les tags.
// Les éléments sont désignés par leur nom : les ids diffèrent d'une base à l'autre.
function exportForSync() {
  const all = elementsRepo.listAll();
  const names = new Map(all.map((el) => [el.id, el.nom]));
  return {
    elements: all
      .filter((el) => el.managedBy === "admin")
      .map(({ nom, type, lieu, couleur, shape, sprite, isActive }) => ({
        name: nom,
        type,
        lieu,
        couleur,
        shape,
        sprite,
        isActive
      })),
    tags: connectionsRepo.listTags().map((tag) => ({
      label: tag.label,
      description: tag.description,
      elements: tag.elementIds.map((id) => names.get(id)).filter(Boolean)
    }))
  };
}

// La bêta devient une copie : les tags absents de la prod sont supprimés
const importFromSync = db.transaction(({ elements = [], tags = [] }) => {
  for (const input of elements) {
    const current = elementsRepo.findByName(input.name);
    // Les images envoyées dans l'admin restent sur le disque de la prod
    const sprite = sprites.uploadFile(input.sprite) ? (current?.sprite ?? null) : input.sprite;
    if (current) elementsRepo.update(current.id, { ...input, sprite });
    else elementsRepo.create({ ...input, sprite });
  }

  const existing = new Map(connectionsRepo.listTags().map((t) => [t.label.toLowerCase(), t]));
  for (const tag of tags) {
    const elementIds = tag.elements.map((name) => elementsRepo.findByName(name)?.id).filter(Boolean);
    const id = existing.get(tag.label.toLowerCase())?.id ?? null;
    connectionsRepo.saveTag(id, { label: tag.label, description: tag.description, elementIds });
    existing.delete(tag.label.toLowerCase());
  }
  for (const tag of existing.values()) connectionsRepo.deleteTag(tag.id);
  return { elements: elements.length, tags: tags.length };
});

function sameSecret(a, b) {
  const hash = (v) => crypto.createHash("sha256").update(String(v)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function isSyncToken(token) {
  return Boolean(config.sync.token) && typeof token === "string" && sameSecret(token, config.sync.token);
}

// Profil connecté avec PERMANENT_OWNER_TOKEN, créé s'il manque. Il devient
// propriétaire, ou administrateur si le site a déjà un autre propriétaire.
function ensurePermanentOwner() {
  const { token, name } = config.permanentOwner;
  if (!token) return null;
  if (token.length < 16) {
    console.warn("[BETA] PERMANENT_OWNER_TOKEN doit faire au moins 16 caractères");
    return null;
  }
  let player = players.findByToken(token);
  if (!player) {
    player = playersRepo.create({
      id: crypto.randomBytes(8).toString("base64url"),
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      name,
      avatar: players.AVATARS[0],
      color: players.COLORS[0]
    });
    // Profil nommé, donc pas anonyme : il apparaît dans les classements
    playersRepo.update(player.id, { ...player, discordTag: player.discordTag ?? null });
  }
  const ownerId = staffRepo.ownerId();
  const role = ownerId === null || ownerId === player.id ? "owner" : "administrator";
  if (player.role !== role) staffRepo.setRole(player.id, role);
  console.log(`[BETA] Profil permanent « ${player.name} » : ${role}`);
  return playersRepo.findById(player.id);
}

async function pullFromSource() {
  const { sourceUrl, token } = config.sync;
  if (!sourceUrl || !token) return null;
  const url = new URL("/api/sync/export", sourceUrl);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${url} a répondu ${res.status}`);
  const result = importFromSync(await res.json());
  console.log(`[BETA] Copié depuis la prod : ${result.elements} élément(s) modifié(s), ${result.tags} tag(s)`);
  return result;
}

// Au démarrage : une erreur est seulement signalée, le site démarre quand même
async function runAtStartup() {
  try {
    ensurePermanentOwner();
  } catch (err) {
    console.error("[BETA] Profil permanent :", err);
  }
  try {
    await pullFromSource();
  } catch (err) {
    console.error("[BETA] Copie depuis la prod impossible :", err.message);
  }
}

module.exports = { exportForSync, importFromSync, isSyncToken, ensurePermanentOwner, pullFromSource, runAtStartup };
