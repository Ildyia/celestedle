const db = require("../db");

const stmts = {
  owner: db.prepare("SELECT id FROM players WHERE role = 'owner'"),
  setRole: db.prepare("UPDATE players SET role = ? WHERE id = ?"),
  staff: db.prepare(`
    SELECT p.id, p.name, p.discord_tag AS discordTag, p.role, p.last_seen_at AS lastSeenAt,
           (SELECT COUNT(*) FROM admin_actions a
            WHERE a.player_id = p.id AND a.created_at >= @since) AS actionsToday
    FROM players p
    WHERE p.role IN ('owner', 'administrator')
    ORDER BY p.role DESC, p.name
  `),
  logAction: db.prepare(`
    INSERT INTO admin_actions (player_id, action, target, created_at) VALUES (?, ?, ?, ?)
  `),
  countSince: db.prepare(`
    SELECT COUNT(*) AS n FROM admin_actions WHERE player_id = ? AND created_at >= ?
  `),
  recent: db.prepare(`
    SELECT a.action, a.target, a.created_at AS createdAt, p.id AS playerId, p.name, p.role
    FROM admin_actions a JOIN players p ON p.id = a.player_id
    ORDER BY a.created_at DESC
    LIMIT ?
  `)
};

function ownerId() {
  return stmts.owner.get()?.id ?? null;
}

function setRole(playerId, role) {
  return stmts.setRole.run(role, playerId).changes === 1;
}

function listStaff(since) {
  return stmts.staff.all({ since });
}

function logAction(playerId, action, target, at) {
  stmts.logAction.run(playerId, action, target ?? null, at);
}

function countActionsSince(playerId, since) {
  return stmts.countSince.get(playerId, since).n;
}

function recentActions(limit = 100) {
  return stmts.recent.all(limit);
}

module.exports = { ownerId, setRole, listStaff, logAction, countActionsSince, recentActions };
