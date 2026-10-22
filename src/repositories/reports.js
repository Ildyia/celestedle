const db = require("../db");

// Statuts « ouverts » : affichés aux joueurs et proposés comme doublons
const OPEN_STATUSES = ["new", "working"];
const CLOSED_STATUSES = ["fixed", "cant_reproduce", "wrong"];

const SELECT_REPORT = `
  SELECT r.*,
         COALESCE((SELECT SUM(value) FROM report_votes v WHERE v.report_id = r.id), 0) AS score,
         COALESCE((SELECT value FROM report_votes v WHERE v.report_id = r.id AND v.voter_id = @voterId), 0) AS user_vote
  FROM reports r
`;

const stmts = {
  insert: db.prepare(`
    INSERT INTO reports (id, element_id, element_name, bug_type, description, is_spoiler, player_id)
    VALUES (@id, @elementId, @elementName, @bugType, @description, @isSpoiler, @playerId)
  `),
  byId: db.prepare(`${SELECT_REPORT} WHERE r.id = @id`),
  listOpen: db.prepare(`
    ${SELECT_REPORT}
    WHERE r.status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(",")})
    ORDER BY score DESC, r.created_at DESC
  `),
  // Admin : avec l'auteur, pour pouvoir le recontacter
  listAll: db.prepare(`
    SELECT r.*,
           COALESCE((SELECT SUM(value) FROM report_votes v WHERE v.report_id = r.id), 0) AS score,
           0 AS user_vote,
           p.name AS reporter_name, p.discord_tag AS reporter_discord
    FROM reports r LEFT JOIN players p ON p.id = r.player_id
    ORDER BY r.created_at DESC
  `),
  remove: db.prepare("DELETE FROM reports WHERE id = ?"),
  closed: db.prepare(`
    SELECT id, discord_public_id, discord_private_id FROM reports
    WHERE status IN (${CLOSED_STATUSES.map((s) => `'${s}'`).join(",")})
  `),
  vote: db.prepare(`
    INSERT INTO report_votes (report_id, voter_id, value) VALUES (?, ?, ?)
    ON CONFLICT(report_id, voter_id) DO UPDATE SET value = excluded.value
  `),
  unvote: db.prepare("DELETE FROM report_votes WHERE report_id = ? AND voter_id = ?"),
  currentVote: db.prepare("SELECT value FROM report_votes WHERE report_id = ? AND voter_id = ?"),
  setStatus: db.prepare(`
    UPDATE reports SET status = ?, updated_at = datetime('now') WHERE id = ?
  `),
  setDiscordIds: db.prepare(`
    UPDATE reports SET discord_public_id = ?, discord_private_id = ? WHERE id = ?
  `),
  exists: db.prepare("SELECT 1 FROM reports WHERE id = ?")
};

function toReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    elementId: row.element_id,
    elementName: row.element_name,
    bugType: row.bug_type,
    description: row.description,
    isSpoiler: row.is_spoiler === 1,
    status: row.status,
    score: row.score,
    userVote: row.user_vote,
    discordPublicId: row.discord_public_id,
    discordPrivateId: row.discord_private_id,
    createdAt: row.created_at
  };
}

function toAdminReport(row) {
  return {
    ...toReport(row),
    reporter: row.player_id
      ? { id: row.player_id, name: row.reporter_name, discordTag: row.reporter_discord }
      : null
  };
}

function create(report) {
  stmts.insert.run({ playerId: null, ...report, isSpoiler: report.isSpoiler ? 1 : 0 });
  return findById(report.id);
}

function exists(id) {
  return Boolean(stmts.exists.get(id));
}

function findById(id, voterId = null) {
  return toReport(stmts.byId.get({ id, voterId }));
}

function listOpen(voterId = null) {
  return stmts.listOpen.all({ voterId }).map(toReport);
}

function listAll() {
  return stmts.listAll.all().map(toAdminReport);
}

// Les votes sont supprimés avec le report (ON DELETE CASCADE)
function remove(id) {
  return stmts.remove.run(id).changes === 1;
}

function listClosed() {
  return stmts.closed.all().map((r) => ({
    id: r.id,
    discordPublicId: r.discord_public_id,
    discordPrivateId: r.discord_private_id
  }));
}

// Même vote deux fois = annulation ; vote inverse = changement
const toggleVote = db.transaction((reportId, voterId, value) => {
  const current = stmts.currentVote.get(reportId, voterId)?.value;
  if (current === value) stmts.unvote.run(reportId, voterId);
  else stmts.vote.run(reportId, voterId, value);
});

function setStatus(id, status) {
  stmts.setStatus.run(status, id);
}

function setDiscordIds(id, publicId, privateId) {
  stmts.setDiscordIds.run(publicId, privateId, id);
}

module.exports = {
  OPEN_STATUSES,
  CLOSED_STATUSES,
  remove,
  listClosed,
  create,
  exists,
  findById,
  listOpen,
  listAll,
  toggleVote,
  setStatus,
  setDiscordIds
};
