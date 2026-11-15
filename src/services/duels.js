// Duels : deux joueurs cherchent le même élément, tiré au hasard. Un salon
// est public (listé dans le menu) ou privé (rejoint par son lien). Le duel
// commence quand le second joueur entre ; chacun joue sa partie avec les
// règles du mode choisi (A-Side / B-Side) et voit avancer l'autre.
// Résultat : une victoire bat une défaite ; entre deux victoires, le moins
// d'essais (un indice compte comme un essai), puis le plus rapide depuis le
// début du duel. Pas de fraises, de stats ni de classement : les parties ont
// leurs propres tables (migration 016).
// Le moteur de partie est celui du jeu du jour (createGameService), avec un
// « mot du jour » propre au salon.
const crypto = require("crypto");
const db = require("../db");
const elementsRepo = require("../repositories/elements");
const playersRepo = require("../repositories/players");
const { createGamesRepo } = require("../repositories/games");
const { createGameService } = require("./games");
const { elementsComparator } = require("./compare");
const { getModeRules } = require("./mode-rules");
const { ELEMENTS_CATALOG } = require("./hints");
const { HttpError } = require("../utils/http-error");
const { nowIso, secondsBetween } = require("../utils/dates");

const MODES = ["normal", "hard"];
// Un salon attend son second joueur au plus WAIT_MINUTES ; un duel commencé
// dure au plus DUEL_MINUTES (une partie pas finie compte alors comme abandonnée)
const WAIT_MINUTES = 30;
const DUEL_MINUTES = 30;
const LIST_LIMIT = 30;

const gamesRepo = createGamesRepo({
  games: "duel_games",
  guesses: "duel_guesses",
  hints: "duel_hints",
  summaries: "duel_game_summaries"
});

const stmts = {
  insert: db.prepare(`
    INSERT INTO duel_rooms (id, mode, element_id, is_public, host_id, created_at)
    VALUES (@id, @mode, @elementId, @isPublic, @hostId, @createdAt)
  `),
  find: db.prepare("SELECT * FROM duel_rooms WHERE id = ?"),
  open: db.prepare(`
    SELECT * FROM duel_rooms
    WHERE is_public = 1 AND guest_id IS NULL AND closed_at IS NULL AND created_at > @since
    ORDER BY created_at DESC LIMIT @limit
  `),
  join: db.prepare(`
    UPDATE duel_rooms SET guest_id = @guestId, started_at = @at
    WHERE id = @id AND guest_id IS NULL AND closed_at IS NULL AND host_id <> @guestId
  `),
  close: db.prepare("UPDATE duel_rooms SET closed_at = @at WHERE id = @id AND guest_id IS NULL AND closed_at IS NULL"),
  // Un hôte n'a qu'un salon en attente : créer un salon ferme les autres
  closeWaitingOf: db.prepare("UPDATE duel_rooms SET closed_at = @at WHERE host_id = @hostId AND guest_id IS NULL AND closed_at IS NULL"),
  setRematch: db.prepare("UPDATE duel_rooms SET rematch_id = @rematchId WHERE id = @id AND rematch_id IS NULL"),
  // Fin de duel : les parties pas finies comptent comme abandonnées
  forfeitPlaying: db.prepare("UPDATE duel_games SET status = 'forfeit', finished_at = @at WHERE date = @date AND status = 'playing'")
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

function newRoomId() {
  // 8 caractères : assez pour qu'un salon privé ne se devine pas
  return crypto.randomBytes(6).toString("base64url");
}

// Joueur montré dans un salon
function publicPlayer(id) {
  const p = id ? playersRepo.findById(id) : null;
  return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color } : null;
}

function findRoom(id) {
  const room = typeof id === "string" ? stmts.find.get(id) : null;
  if (!room) throw new HttpError(404, "This duel doesn't exist.");
  return room;
}

function roomStatus(room) {
  if (room.closed_at) return "closed";
  if (!room.started_at) return room.created_at > minutesAgo(WAIT_MINUTES) ? "waiting" : "expired";
  return "started";
}

// Moteur de partie du salon : son élément tient lieu de mot du jour
function serviceFor(room) {
  const element = elementsRepo.findById(room.element_id);
  const date = `duel:${room.id}`;
  return createGameService({
    items: elementsRepo,
    gamesRepo,
    daily: {
      getTodaySecret: () => ({ date, version: 1, element }),
      // Indices tirés au hasard : stables pour un salon
      seededRandom: (mode, offset = 0) => {
        const digest = crypto.createHash("sha256").update(`${room.id}|${mode}|${offset}`).digest();
        return digest.readUInt32BE(0);
      }
    },
    comparator: elementsComparator,
    hintCatalog: ELEMENTS_CATALOG,
    getRules: getModeRules,
    modeIds: MODES,
    normalMode: "normal",
    hardMode: "hard",
    unknownMessage: "Unknown element. Check the spelling."
  });
}

// Duel trop long : on le clôt (parties pas finies = abandon)
function closeIfOverdue(room) {
  if (room.started_at && room.started_at < minutesAgo(DUEL_MINUTES)) {
    stmts.forfeitPlaying.run({ date: `duel:${room.id}`, at: nowIso() });
  }
}

function roleOf(room, player) {
  if (!player) return null;
  if (player.id === room.host_id) return "host";
  if (player.id === room.guest_id) return "guest";
  return null;
}

// Où en est un joueur, vu par l'autre : ses lignes en couleurs seulement (le
// nom deviné reste caché tant que celui qui regarde n'a pas fini)
function progressOf(state, room, reveal) {
  const seconds = state.finishedAt ? secondsBetween(room.started_at, state.finishedAt) : null;
  return {
    status: state.status,
    started: Boolean(state.startedAt),
    tries: state.tries,
    hints: state.hints.length,
    seconds,
    rows: state.guesses.map((g) => ({ name: reveal ? g.nom : null, verdict: g.verdict }))
  };
}

// Résultat, une fois les deux parties finies
function resultOf(room, host, guest) {
  if (host.status === "playing" || guest.status === "playing") return null;
  const score = (p) => ({ won: p.status === "won", cost: p.tries + p.hints, seconds: p.seconds ?? Infinity });
  const a = score(host);
  const b = score(guest);
  let winner = null;
  if (a.won !== b.won) winner = a.won ? "host" : "guest";
  else if (a.won) {
    if (a.cost !== b.cost) winner = a.cost < b.cost ? "host" : "guest";
    else if (a.seconds !== b.seconds) winner = a.seconds < b.seconds ? "host" : "guest";
  }
  return { winner, winnerId: winner ? room[`${winner}_id`] : null, draw: winner === null };
}

/**
 * Tout ce que le joueur voit d'un salon : le salon, sa partie (s'il y joue),
 * celle de l'autre (en couleurs), le résultat une fois les deux finies.
 */
function getDuel(id, player) {
  const room = findRoom(id);
  const status = roomStatus(room);
  const role = roleOf(room, player);
  const base = {
    id: room.id,
    mode: room.mode,
    isPublic: Boolean(room.is_public),
    status,
    role,
    host: publicPlayer(room.host_id),
    guest: publicPlayer(room.guest_id),
    createdAt: room.created_at,
    startedAt: room.started_at,
    rematchId: room.rematch_id,
    me: null,
    opponent: null,
    result: null
  };
  if (status !== "started") return base;

  closeIfOverdue(room);
  const service = serviceFor(room);
  const states = {
    host: service.getState({ id: room.host_id }, room.mode),
    guest: service.getState({ id: room.guest_id }, room.mode)
  };
  const progress = (who, reveal) => progressOf(states[who], room, reveal);
  const result = resultOf(room, progress("host", false), progress("guest", false));
  if (role) {
    const other = role === "host" ? "guest" : "host";
    base.me = states[role];
    // Les noms de l'adversaire : une fois sa propre partie finie
    base.opponent = progress(other, base.me.status !== "playing");
  } else {
    // Spectateur (lien ouvert par quelqu'un d'autre) : juste les couleurs
    base.players = { host: progress("host", Boolean(result)), guest: progress("guest", Boolean(result)) };
  }
  base.result = result;
  return { ...base, status: result ? "finished" : "playing" };
}

function listOpen() {
  return stmts.open.all({ since: minutesAgo(WAIT_MINUTES), limit: LIST_LIMIT }).map((room) => ({
    id: room.id,
    mode: room.mode,
    host: publicPlayer(room.host_id),
    createdAt: room.created_at
  }));
}

const create = db.transaction((player, { mode = "normal", isPublic = true } = {}) => {
  if (!MODES.includes(mode)) throw new HttpError(400, `Unknown mode "${mode}"`);
  const elements = elementsRepo.listActive();
  if (!elements.length) throw new HttpError(503, "No element to guess right now.");
  const at = nowIso();
  stmts.closeWaitingOf.run({ hostId: player.id, at });
  const id = newRoomId();
  stmts.insert.run({
    id,
    mode,
    elementId: elements[crypto.randomInt(elements.length)].id,
    isPublic: isPublic ? 1 : 0,
    hostId: player.id,
    createdAt: at
  });
  return getDuel(id, player);
});

function join(id, player) {
  const room = findRoom(id);
  if (roleOf(room, player)) return getDuel(id, player);
  const status = roomStatus(room);
  if (status !== "waiting") {
    throw new HttpError(409, status === "started" ? "This duel already has two players." : "This duel is closed.");
  }
  if (stmts.join.run({ id, guestId: player.id, at: nowIso() }).changes !== 1) {
    throw new HttpError(409, "Someone else joined first.");
  }
  return getDuel(id, player);
}

function close(id, player) {
  const room = findRoom(id);
  if (room.host_id !== player.id) throw new HttpError(403, "Only the host can close this duel.");
  stmts.close.run({ id, at: nowIso() });
  return getDuel(id, player);
}

// Partie d'un joueur du duel : seulement une fois le duel commencé
function playable(id, player) {
  const room = findRoom(id);
  if (!roleOf(room, player)) throw new HttpError(403, "You're not in this duel.");
  if (roomStatus(room) !== "started") throw new HttpError(409, "The duel hasn't started yet.");
  closeIfOverdue(room);
  return { room, service: serviceFor(room) };
}

function guess(id, player, input) {
  const { room, service } = playable(id, player);
  return service.guess(player, room.mode, input);
}

function useHint(id, player, type, choice) {
  const { room, service } = playable(id, player);
  return service.useHint(player, room.mode, type, undefined, choice);
}

function forfeit(id, player) {
  const { room, service } = playable(id, player);
  return service.forfeit(player, room.mode);
}

// Revanche : un nouveau salon privé, même mode. Le premier qui la demande
// le crée ; l'autre le rejoint.
const rematch = db.transaction((id, player) => {
  const room = findRoom(id);
  if (!roleOf(room, player)) throw new HttpError(403, "You're not in this duel.");
  if (room.rematch_id) return join(room.rematch_id, player);
  const next = create(player, { mode: room.mode, isPublic: false });
  stmts.setRematch.run({ id, rematchId: next.id });
  return next;
});

module.exports = { WAIT_MINUTES, DUEL_MINUTES, listOpen, getDuel, create, join, close, guess, useHint, forfeit, rematch };
