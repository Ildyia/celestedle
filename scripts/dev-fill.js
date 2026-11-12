// Outil de test local : donne de fausses parties à un profil pour voir les
// fraises et les tampons sans jouer pendant des mois.
// Les achievements sont calculés à partir des parties : on ajoute donc des
// parties Celestedle (A et B) sur des jours passés, marquées secret_version = -1
// pour pouvoir les retirer ensuite.
//
//   node scripts/dev-fill.js "<nom du profil>"            tout : 202 fraises et les 10 tampons
//   node scripts/dev-fill.js "<nom du profil>" --wins 20  seulement 20 fraises (victoires)
//   node scripts/dev-fill.js "<nom du profil>" --reset    retire les parties ajoutées par ce script
//
// Serveur arrêté de préférence (même base data/celestedle.db, ou DB_PATH).
// Perfectionist et Bad Day ne viennent que si Connections et Techs ne sont pas
// ouverts à tous (sinon il faudrait aussi des parties de ces jeux).
const db = require("../src/db");

const FAKE = -1;
const [name, ...flags] = process.argv.slice(2);
if (!name) {
  console.log('Usage : node scripts/dev-fill.js "<nom du profil>" [--wins N | --reset]');
  process.exit(1);
}
const players = db.prepare("SELECT id, name FROM players WHERE name = ? COLLATE NOCASE").all(name);
if (players.length !== 1) {
  console.log(players.length ? `Plusieurs profils s'appellent « ${name} », renomme-en un.` : `Aucun profil « ${name} ».`);
  process.exit(1);
}
const player = players[0];

if (flags.includes("--reset")) {
  const { changes } = db.prepare("DELETE FROM games WHERE player_id = ? AND secret_version = ?").run(player.id, FAKE);
  console.log(`${changes} parties de test retirées pour ${player.name}.`);
  process.exit(0);
}

const winsIndex = flags.indexOf("--wins");
const onlyWins = winsIndex >= 0 ? Number(flags[winsIndex + 1]) : null;
if (onlyWins !== null && !(onlyWins > 0)) {
  console.log("--wins attend un nombre positif.");
  process.exit(1);
}

const elementId = db.prepare("SELECT id FROM elements ORDER BY id LIMIT 1").get().id;
const taken = new Set(db.prepare("SELECT date || '|' || mode AS k FROM games WHERE player_id = ?").all(player.id).map((r) => r.k));
const insertGame = db.prepare(`
  INSERT INTO games (date, mode, player_id, status, secret_version, started_at, finished_at)
  VALUES (@date, @mode, @playerId, @status, ${FAKE}, @startedAt, @finishedAt)
`);
const insertGuess = db.prepare("INSERT INTO guesses (game_id, position, element_id, created_at) VALUES (?, 1, ?, ?)");
const insertHint = db.prepare("INSERT INTO game_hints (game_id, type, payload, created_at) VALUES (?, ?, '{}', ?)");

// Jour J - n, au format AAAA-MM-JJ (heure de Paris)
const dayBefore = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
// Instant ISO où il est `time` à Paris ce jour-là
function parisInstant(date, time) {
  for (const offset of ["+01:00", "+02:00"]) {
    const iso = new Date(`${date}T${time}${offset}`).toISOString();
    if (new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Paris" }) === `${date} ${time}`) return iso;
  }
  return new Date(`${date}T${time}Z`).toISOString();
}

function addGame(date, mode, status, { time = "12:00:00", hints = [] } = {}) {
  if (taken.has(`${date}|${mode}`)) return false;
  taken.add(`${date}|${mode}`);
  const finishedAt = parisInstant(date, time);
  const startedAt = new Date(new Date(finishedAt).getTime() - 60000).toISOString();
  const { lastInsertRowid: id } = insertGame.run({ date, mode, playerId: player.id, status, startedAt, finishedAt });
  insertGuess.run(id, elementId, finishedAt);
  for (const type of hints) insertHint.run(id, type, finishedAt);
  return true;
}

let added = 0;
db.transaction(() => {
  // Victoires A et B, du jour le plus récent au plus ancien (hier d'abord) :
  // jours consécutifs (Summit Streak), B gagnés du premier coup sans indice
  // (Lucky Guess, Golden), A et B gagnés le même jour (Perfectionist)
  const target = onlyWins ?? 202;
  let day = 1;
  while (added < target) {
    for (const mode of ["normal", "hard"]) {
      if (added < target && addGame(dayBefore(day), mode, "won")) added++;
    }
    day++;
  }
  if (onlyWins !== null) return;
  // Speedrunner : une victoire 2 minutes après minuit ; Assist Mode : tous les indices
  addGame(dayBefore(day), "normal", "won", { time: "00:02:00", hints: ["opposite", "secret_info", "truth_and_lies"] });
  // Bad Day : A et B perdus le même jour
  addGame(dayBefore(day + 1), "normal", "lost");
  addGame(dayBefore(day + 1), "hard", "forfeit");
})();

console.log(`${player.name} : ${added} victoires ajoutées${onlyWins === null ? ", plus les parties des tampons" : ""}.`);
console.log("Recharge le menu. Pour tout retirer : --reset");
