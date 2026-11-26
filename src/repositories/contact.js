const db = require("../db");

const stmts = {
  insert: db.prepare(`
    INSERT INTO contact_messages (player_id, topic, body, created_at) VALUES (@playerId, @topic, @body, @at)
  `),
  // Les plus récents d'abord ; l'auteur avec son nom et son tag Discord
  list: db.prepare(`
    SELECT m.id, m.topic, m.body, m.status, m.created_at AS createdAt, m.player_id AS playerId,
           p.name AS playerName, p.discord_tag AS discordTag
    FROM contact_messages m LEFT JOIN players p ON p.id = m.player_id
    ORDER BY m.status = 'done', m.created_at DESC, m.id DESC
  `),
  byId: db.prepare(`
    SELECT m.id, m.topic, m.body, m.status, m.created_at AS createdAt, m.player_id AS playerId,
           p.name AS playerName, p.discord_tag AS discordTag
    FROM contact_messages m LEFT JOIN players p ON p.id = m.player_id WHERE m.id = ?
  `),
  setStatus: db.prepare("UPDATE contact_messages SET status = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM contact_messages WHERE id = ?"),
  countNew: db.prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'")
};

function insert({ playerId, topic, body, at }) {
  return findById(Number(stmts.insert.run({ playerId, topic, body, at }).lastInsertRowid));
}
const findById = (id) => stmts.byId.get(id) ?? null;
const list = () => stmts.list.all();
const setStatus = (id, status) => stmts.setStatus.run(status, id).changes === 1;
const remove = (id) => stmts.remove.run(id).changes === 1;
const countNew = () => stmts.countNew.get().n;

module.exports = { insert, findById, list, setStatus, remove, countNew };
