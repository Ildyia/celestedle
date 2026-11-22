// Données du bot Discord : rappels de série (migration 020)
const db = require("../db");

const stmts = {
  upsert: db.prepare(`
    INSERT INTO discord_reminders (discord_user_id, hour, created_at) VALUES (@userId, @hour, @at)
    ON CONFLICT (discord_user_id) DO UPDATE SET hour = @hour
  `),
  remove: db.prepare("DELETE FROM discord_reminders WHERE discord_user_id = ?"),
  find: db.prepare("SELECT discord_user_id AS userId, hour, last_sent AS lastSent FROM discord_reminders WHERE discord_user_id = ?"),
  due: db.prepare(`
    SELECT discord_user_id AS userId, hour FROM discord_reminders
    WHERE hour = @hour AND (last_sent IS NULL OR last_sent <> @today)
  `),
  markSent: db.prepare("UPDATE discord_reminders SET last_sent = ? WHERE discord_user_id = ?"),
  // Une partie de Celestedle finie ce jour-là (gagnée, perdue ou abandonnée)
  playedOn: db.prepare("SELECT COUNT(*) AS n FROM games WHERE player_id = ? AND date = ? AND status <> 'playing'")
};

const setReminder = (userId, hour, at) => stmts.upsert.run({ userId, hour, at });
const removeReminder = (userId) => stmts.remove.run(userId).changes > 0;
const findReminder = (userId) => stmts.find.get(userId) ?? null;
const dueReminders = (hour, today) => stmts.due.all({ hour, today });
const markSent = (userId, today) => stmts.markSent.run(today, userId);
const playedOn = (playerId, date) => stmts.playedOn.get(playerId, date).n > 0;

module.exports = { setReminder, removeReminder, findReminder, dueReminders, markSent, playedOn };
