// Boîte aux lettres (migrations 018 et 019 : sondages)
const db = require("../db");

const COLUMNS = `m.id, m.kind, m.slug, m.title, m.body, m.player_id AS playerId, m.author_id AS authorId,
  m.discord_channel_id AS discordChannelId, m.discord_message_id AS discordMessageId,
  m.created_at AS createdAt, m.updated_at AS updatedAt,
  m.multiple, m.closes_at AS closesAt, m.discord_closed AS discordClosed`;

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
    INSERT INTO mail (kind, title, body, player_id, author_id, multiple, closes_at, created_at, updated_at)
    VALUES (@kind, @title, @body, @playerId, @authorId, @multiple, @closesAt, @at, @at)
  `),
  insertOption: db.prepare("INSERT INTO poll_options (mail_id, position, label) VALUES (?, ?, ?)"),
  options: db.prepare("SELECT position, label FROM poll_options WHERE mail_id = ? ORDER BY position"),
  // Résultats : voix par case, et votants distincts
  counts: db.prepare("SELECT position, COUNT(*) AS votes FROM poll_votes WHERE mail_id = ? GROUP BY position"),
  voters: db.prepare("SELECT COUNT(DISTINCT voter) AS voters FROM poll_votes WHERE mail_id = ?"),
  choicesOf: db.prepare("SELECT position FROM poll_votes WHERE mail_id = ? AND voter = ? ORDER BY position"),
  clearVote: db.prepare("DELETE FROM poll_votes WHERE mail_id = ? AND voter = ?"),
  addVote: db.prepare("INSERT INTO poll_votes (mail_id, voter, position, created_at) VALUES (?, ?, ?, ?)"),
  close: db.prepare("UPDATE mail SET closes_at = @at, updated_at = @at WHERE id = @id AND (closes_at IS NULL OR closes_at > @at)"),
  // Sondages fermés dont le message Discord montre encore les boutons
  closedOnDiscord: db.prepare(`
    SELECT ${COLUMNS} FROM mail m
    WHERE m.kind = 'poll' AND m.discord_message_id IS NOT NULL AND m.discord_closed = 0
      AND m.closes_at IS NOT NULL AND m.closes_at <= ?
  `),
  setDiscordClosed: db.prepare("UPDATE mail SET discord_closed = 1 WHERE id = ?"),
  update: db.prepare("UPDATE mail SET title = @title, body = @body, updated_at = @at WHERE id = @id"),
  setDiscord: db.prepare("UPDATE mail SET discord_channel_id = @channelId, discord_message_id = @messageId WHERE id = @id"),
  remove: db.prepare("DELETE FROM mail WHERE id = ?"),
  markRead: db.prepare("INSERT OR IGNORE INTO mail_reads (mail_id, player_id, read_at) VALUES (?, ?, ?)")
};

const listFor = (playerId, limit = 50) => stmts.listFor.all({ playerId, limit });
const listPublic = () => stmts.listPublic.all();
const find = (id) => stmts.find.get(id) ?? null;

// Une lettre, et pour un sondage ses cases, d'un seul coup
const insert = db.transaction((mail, options = []) => {
  const id = stmts.insert.run({ closesAt: null, ...mail, multiple: mail.multiple ? 1 : 0 }).lastInsertRowid;
  options.forEach((label, position) => stmts.insertOption.run(id, position, label));
  return find(id);
});

const options = (mailId) => stmts.options.all(mailId);

function results(mailId) {
  const counts = new Map(stmts.counts.all(mailId).map((r) => [r.position, r.votes]));
  return { counts, voters: stmts.voters.get(mailId).voters };
}

const choicesOf = (mailId, voter) => stmts.choicesOf.all(mailId, voter).map((r) => r.position);

// Remplace toutes les cases cochées par ce votant
const setVote = db.transaction((mailId, voter, positions, at) => {
  stmts.clearVote.run(mailId, voter);
  for (const position of positions) stmts.addVote.run(mailId, voter, position, at);
});

const close = (id, at) => stmts.close.run({ id, at });
const closedOnDiscord = (now) => stmts.closedOnDiscord.all(now);
const setDiscordClosed = (id) => stmts.setDiscordClosed.run(id);

const update = (id, { title, body, at }) => stmts.update.run({ id, title, body, at });
const setDiscord = (id, channelId, messageId) => stmts.setDiscord.run({ id, channelId, messageId });
const remove = (id) => stmts.remove.run(id);
const markRead = (mailId, playerId, at) => stmts.markRead.run(mailId, playerId, at);

module.exports = {
  listFor, listPublic, find, insert, update, setDiscord, remove, markRead,
  options, results, choicesOf, setVote, close, closedOnDiscord, setDiscordClosed
};
