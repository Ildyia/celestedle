const fs = require("fs");
const { dataPath } = require("../utils/data-dir");

const DONE_KEY = "legacy_json_imported_at";

const STATUS_FROM_LABEL = {
  "🔴 New": "new",
  "🟡 Working on it": "working",
  "🟢 Fixed": "fixed",
  "⚪ Can't reproduce": "cant_reproduce",
  "🔴 Wrong report": "wrong"
};

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`[DB] ${file} illisible, ignoré :`, err.message);
    return fallback;
  }
}

// Importe une seule fois les reports et l'historique des stats de la v1
// (fichiers JSON dans data/). Les fichiers restent en place comme sauvegarde.
function importLegacyJson(db) {
  const done = db.prepare("SELECT value FROM settings WHERE key = ?").get(DONE_KEY);
  if (done) return;

  const reports = readJson(dataPath("reports.json"), {});
  const history = readJson(dataPath("stats-history.json"), []);

  const findElement = db.prepare("SELECT id FROM elements WHERE name = ?");
  const insertReport = db.prepare(`
    INSERT OR IGNORE INTO reports
      (id, element_id, element_name, bug_type, description, status,
       discord_public_id, discord_private_id)
    VALUES (@id, @elementId, @elementName, @bugType, @description, @status,
            @publicId, @privateId)
  `);
  const insertVote = db.prepare(`
    INSERT OR IGNORE INTO report_votes (report_id, voter_id, value) VALUES (?, ?, ?)
  `);
  const insertStats = db.prepare(`
    INSERT OR IGNORE INTO legacy_daily_stats
      (date, secret_word, victories, avg_tries, avg_hints, avg_seconds)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    let reportCount = 0;
    for (const [id, report] of Object.entries(reports)) {
      const name = report.elementName && report.elementName !== "N/A" ? report.elementName.trim() : null;
      const description = String(report.description || "").trim().slice(0, 1000) || "(no description)";
      insertReport.run({
        id,
        elementId: name ? findElement.get(name)?.id ?? null : null,
        elementName: name,
        bugType: report.bugType || "Other",
        description,
        status: STATUS_FROM_LABEL[report.status] ?? "new",
        publicId: report.publicMessageId ?? null,
        privateId: report.privateMessageId ?? null
      });
      for (const [voter, value] of Object.entries(report.votes || {})) {
        if (value !== 1 && value !== -1) continue;
        // Anciennes clés : "web-xxxx" (site) ou ID Discord numérique
        const voterId = /^\d+$/.test(voter) ? `discord:${voter}` : `legacy:${voter}`;
        insertVote.run(id, voterId, value);
      }
      reportCount++;
    }

    let statsCount = 0;
    for (const day of Array.isArray(history) ? history : []) {
      if (!day.date || !day.secretWord) continue;
      insertStats.run(
        day.date,
        day.secretWord,
        Number(day.victories) || 0,
        Number(day.avgTries) || 0,
        Number(day.avgHints) || 0,
        Number(day.avgTimeInSeconds) || 0
      );
      statsCount++;
    }

    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      DONE_KEY,
      new Date().toISOString()
    );
    return { reportCount, statsCount };
  });

  const { reportCount, statsCount } = run();
  console.log(
    `[DB] Import v1 : ${reportCount} report(s), ${statsCount} jour(s) de stats`
  );
}

module.exports = { importLegacyJson };
