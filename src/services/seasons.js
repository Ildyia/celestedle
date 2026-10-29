const db = require("../db");
const repo = require("../repositories/seasons");
const { HttpError } = require("../utils/http-error");
const { todayParis, addDays } = require("../utils/dates");

// Saisons du classement, de la plus récente à la plus ancienne. to = veille
// de la saison suivante, null pour la saison en cours.
function list() {
  const seasons = repo.list();
  return seasons
    .map((s, i) => ({
      id: s.id,
      name: s.name,
      from: s.startDate,
      to: i + 1 < seasons.length ? addDays(seasons[i + 1].startDate, -1) : null,
      current: i === seasons.length - 1
    }))
    .reverse();
}

function current() {
  return list()[0];
}

function find(id) {
  const season = list().find((s) => s.id === id);
  if (!season) throw new HttpError(404, "Unknown season.");
  return season;
}

function validName(name) {
  const clean = String(name ?? "").trim();
  if (clean.length < 2 || clean.length > 40) throw new HttpError(400, "The season name must be 2 to 40 characters.");
  return clean;
}

// Nouvelle saison à partir d'aujourd'hui : la précédente s'arrête hier. Une
// saison lancée aujourd'hui même n'a encore aucun jour à elle : elle est
// remplacée (sinon elle resterait dans la liste, vide).
const start = db.transaction((name) => {
  const clean = validName(name);
  const today = todayParis();
  const previous = current();
  if (previous && previous.from >= today) repo.remove(previous.id);
  return find(repo.insert(clean, today));
});

function rename(id, name) {
  const clean = validName(name);
  find(id);
  repo.rename(id, clean);
  return find(id);
}

module.exports = { list, current, find, start, rename };
