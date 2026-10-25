const db = require("../db");

const stmts = {
  insert: db.prepare(`
    INSERT INTO players (id, token_hash, name, avatar, color, created_at, last_seen_at)
    VALUES (@id, @tokenHash, @name, @avatar, @color, @now, @now)
  `),
  byTokenHash: db.prepare("SELECT * FROM players WHERE token_hash = ?"),
  byId: db.prepare("SELECT * FROM players WHERE id = ?"),
  update: db.prepare(`
    UPDATE players SET name = @name, avatar = @avatar, color = @color, is_hidden = @isHidden,
      discord_tag = @discordTag, is_anonymous = 0
    WHERE id = @id
  `),
  touch: db.prepare("UPDATE players SET last_seen_at = ? WHERE id = ?"),
  setTokenHash: db.prepare("UPDATE players SET token_hash = ? WHERE id = ?"),
  setPlaytester: db.prepare("UPDATE players SET is_playtester = ? WHERE id = ?"),
  byDiscordTag: db.prepare("SELECT * FROM players WHERE discord_tag = ? COLLATE NOCASE"),
  search: db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM games g WHERE g.player_id = p.id) AS games
    FROM players p
    WHERE p.id = @q OR p.name LIKE @like ESCAPE '\\' OR p.discord_tag LIKE @like ESCAPE '\\'
    ORDER BY p.last_seen_at DESC
    LIMIT 50
  `),
  // Ses votes ne sont pas liés par une clé étrangère : on les retire à part
  removeVotes: db.prepare("DELETE FROM report_votes WHERE voter_id = ?"),
  remove: db.prepare("DELETE FROM players WHERE id = ?"),
  count: db.prepare("SELECT COUNT(*) AS n FROM players")
};

function toPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    isHidden: row.is_hidden === 1,
    // Profil jamais enregistré par le joueur : absent des classements
    isAnonymous: row.is_anonymous === 1,
    role: row.role ?? "player",
    // Accès aux modes en test, indépendant du rôle admin
    isPlaytester: row.is_playtester === 1,
    // Renvoyé seulement au joueur lui-même et à l'admin
    discordTag: row.discord_tag ?? null,
    createdAt: row.created_at
  };
}

function create({ id, tokenHash, name, avatar, color }) {
  stmts.insert.run({ id, tokenHash, name, avatar, color, now: new Date().toISOString() });
  return findById(id);
}

function findByTokenHash(tokenHash) {
  return toPlayer(stmts.byTokenHash.get(tokenHash));
}

function findById(id) {
  return toPlayer(stmts.byId.get(id));
}

function update(id, { name, avatar, color, isHidden, discordTag }) {
  stmts.update.run({ id, name, avatar, color, isHidden: isHidden ? 1 : 0, discordTag });
  return findById(id);
}

function setTokenHash(id, tokenHash) {
  stmts.setTokenHash.run(tokenHash, id);
}

function setPlaytester(id, enabled) {
  return stmts.setPlaytester.run(enabled ? 1 : 0, id).changes === 1;
}

function findByDiscordTag(tag) {
  return stmts.byDiscordTag.all(tag).map(toPlayer);
}

function search(query) {
  const q = String(query ?? "").trim();
  return stmts.search
    // % et _ cherchés tels quels
    .all({ q, like: `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` })
    .map((row) => ({ ...toPlayer(row), lastSeenAt: row.last_seen_at, games: row.games }));
}

// Parties, essais et journal admin suivent (ON DELETE CASCADE) ; ses
// reports restent, sans auteur
const remove = db.transaction((id) => {
  stmts.removeVotes.run(`player:${id}`);
  return stmts.remove.run(id).changes === 1;
});

function touch(id) {
  stmts.touch.run(new Date().toISOString(), id);
}

function count() {
  return stmts.count.get().n;
}

module.exports = {
  create,
  findByTokenHash,
  findById,
  findByDiscordTag,
  search,
  update,
  setTokenHash,
  setPlaytester,
  remove,
  touch,
  count
};
