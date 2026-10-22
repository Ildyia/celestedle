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
      discord_tag = @discordTag
    WHERE id = @id
  `),
  touch: db.prepare("UPDATE players SET last_seen_at = ? WHERE id = ?"),
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

function touch(id) {
  stmts.touch.run(new Date().toISOString(), id);
}

function count() {
  return stmts.count.get().n;
}

module.exports = { create, findByTokenHash, findById, update, touch, count };
