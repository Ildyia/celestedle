// Boîte aux lettres (migration 018)
const db = require("../db");

const COLUMNS = `m.id, m.kind, m.slug, m.title, m.body, m.player_id AS playerId, m.author_id AS authorId,
  m.discord_channel_id AS discordChannelId, m.discord_message_id AS discordMessageId,
  m.created_at AS createdAt, m.updated_at AS updatedAt`;

const stmts = {
  // Courrier visible d'un joueur (ou de tous, playerId NULL), le plus récent d'abord
  listFor: db.prepare(`
    SELECT ${COLUMNS}, r.read_at AS readAt
    FROM mail m LEFT JOIN mail_reads r ON r.mail_id = m.id AND r.player_id = @playerId
    WHERE m.player_id IS NULL OR m.player_id = @playerId
    ORDER BY m.created_at DESC, m.id DESC LIMIT @limit
  `),
  // Admin : le courrier pour tous, avec le nombre de lecteurs
  listPublic: db.prepare(`
    SELECT ${COLUMNS}, (SELECT COUNT(*) FROM mail_reads r WHERE r.mail_id = m.id) AS reads
    FROM mail m WHERE m.player_id IS NULL
    ORDER BY m.created_at DESC, m.id DESC
  `),
  find: db.prepare(`SELECT ${COLUMNS} FROM mail m WHERE m.id = ?`),
  insert: db.prepare(`
    INSERT INTO mail (kind, title, body, player_id, author_id, created_at, updated_at)
    VALUES (@kind, @title, @body, @playerId, @authorId, @at, @at)
  `),
  update: db.prepare("UPDATE mail SET title = @title, body = @body, updated_at = @at WHERE id = @id"),
  setDiscord: db.prepare("UPDATE mail SET discord_channel_id = @channelId, discord_message_id = @messageId WHERE id = @id"),
  remove: db.prepare("DELETE FROM mail WHERE id = ?"),
  markRead: db.prepare("INSERT OR IGNORE INTO mail_reads (mail_id, player_id, read_at) VALUES (?, ?, ?)")
};

const listFor = (playerId, limit = 50) => stmts.listFor.all({ playerId, limit });
const listPublic = () => stmts.listPublic.all();
const find = (id) => stmts.find.get(id) ?? null;

function insert(mail) {
  return find(stmts.insert.run(mail).lastInsertRowid);
}

const update = (id, { title, body, at }) => stmts.update.run({ id, title, body, at });
const setDiscord = (id, channelId, messageId) => stmts.setDiscord.run({ id, channelId, messageId });
const remove = (id) => stmts.remove.run(id);
const markRead = (mailId, playerId, at) => stmts.markRead.run(mailId, playerId, at);

module.exports = { listFor, listPublic, find, insert, update, setDiscord, remove, markRead };
