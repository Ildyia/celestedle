// Le jeu change de mot à minuit, heure de Paris. Les dates de jeu sont des
// chaînes "YYYY-MM-DD" ; les horodatages sont en ISO 8601 UTC.
const TIME_ZONE = "Europe/Paris";

function todayParis(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Lundi de la semaine de `date`
function weekStart(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(date, -((day + 6) % 7));
}

// Prochain minuit à Paris, en millisecondes depuis maintenant
function msUntilNextDay(now = new Date()) {
  const parisNow = new Date(now.toLocaleString("en-US", { timeZone: TIME_ZONE }));
  const parisMidnight = new Date(parisNow);
  parisMidnight.setHours(24, 0, 0, 0);
  return parisMidnight - parisNow;
}

function nowIso() {
  return new Date().toISOString();
}

function secondsBetween(startIso, endIso) {
  return Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}

module.exports = { todayParis, addDays, weekStart, msUntilNextDay, nowIso, secondsBetween };
